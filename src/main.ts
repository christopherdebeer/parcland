import { interpret } from 'xstate';
import { gestureMachine } from './lib/gesture-machine/gestureMachine.ts';
import { installPointerAdapter } from './lib/gesture-machine/pointerAdapter.ts';
import { createGestureHelpers } from './lib/gesture-machine/gesture-helpers.ts';
import { buildContextMenu } from './lib/context-menu';
import { installCommandPalette } from './lib/cmd-palette/command-palette.ts';
import { generateContent, regenerateImage } from './lib/network/generation.ts';
import { loadInitialCanvas, saveCanvas, saveCanvasLocalOnly } from './lib/network/storage.ts';
import { showModal } from './lib/modal.ts';
import { elementRegistry } from './lib/elements/elementRegistry.ts';
import { CrdtAdapter } from './lib/network/crdt.ts';
import type { CanvasState, CanvasElement, ViewState, Edge } from './types.ts';
import { HistoryManager } from './services/HistoryManager.ts';
import { ViewportManager } from './services/ViewportManager.ts';
import { SelectionManager } from './services/SelectionManager.ts';

class CanvasController {
    canvasState: CanvasState;
    crdt: CrdtAdapter;

    // Service managers
    historyManager: HistoryManager;
    viewportManager: ViewportManager;
    selectionManager: SelectionManager;

    // Legacy properties (delegated to services)
    selectedElementIds: Set<string>;
    selectedElementId: string | null;
    selectionBox: HTMLElement | null;
    viewState: ViewState;
    groupBox: HTMLElement;
    MAX_SCALE: number;
    MIN_SCALE: number;
    _undo: any[];
    _redo: any[];
    _maxHistory: number;

    activeEditTab: string;
    elementRegistry: any;
    elementNodesMap: Record<string, HTMLElement>;
    edgeNodesMap: Record<string, SVGLineElement>;
    edgeLabelNodesMap?: Record<string, SVGTextElement>;
    canvas: HTMLElement;
    container: HTMLElement;
    staticContainer: HTMLElement;
    contextMenu: HTMLElement;
    modeBtn: HTMLElement;
    drillUpBtn: HTMLElement;
    edgesLayer: SVGSVGElement;
    codeMirrorContent: any;
    codeMirrorSrc: any;
    tokenKey: string;
    modes: string[];
    mode: string;
    fsmService: any;
    uninstallAdapter: () => void;
    uninstallCommandPalette: () => void;
    _renderQueued: boolean;
    _edgesQueued: boolean;
    requestRender: () => void;
    requestEdgeUpdate: () => void;
    contextMenuPointerDownHandler?: (ev: Event) => void;

    constructor(canvasState: CanvasState) {
        updateCanvasController(this)
        this.canvasState = canvasState;
        this.crdt = new CrdtAdapter(canvasState.canvasId);

        this.crdt.onUpdate( (ev) => {
            const remote = !ev.transaction.local;
            if (remote) {
                console.log(`[CRDT] Update from ${remote ? 'Remote' : 'Local'}`, ev )
                // const els = this.crdt.elements.toJSON();
                // const edges = this.crdt.edges.toJSON();
                // console.log(`[CRDT] remote updates`, els, edges)
                // this.canvasState.elements = Object.values(els);
                // this.canvasState.edges = Object.values(edges);

                if (ev.currentTarget === this.crdt.elements) {
                    const keys = Array.from(ev.keysChanged);
                    console.log(`[CRDT] Remote element(s) update`, keys)
                    // keys.forEach( id => {
                    //     const el = this.findElementById(id)
                    //     const yel = this.crdt.elements.get(id)
                    //     Object.keys(el).forEach( k => {
                    //         el[k] = yel[k]
                    //     })
                    // })
                }
                // this.requestRender();
            }
        })
        
        if (!this.canvasState.edges) {
            this.canvasState.edges = [];
        }

        this.activeEditTab = "content"; // "content" or "src"
        this.elementRegistry = elementRegistry;
        this.elementNodesMap = {};
        this.edgeNodesMap = {};

        // Get DOM elements
        this.canvas = document.getElementById("canvas");
        this.container = document.getElementById("canvas-container");
        this.staticContainer = document.getElementById("static-container");
        this.contextMenu = document.getElementById("context-menu");
        this.modeBtn = document.getElementById("mode");
        this.drillUpBtn = document.getElementById("drillUp");
        this.edgesLayer = document.getElementById("edges-layer") as any as SVGSVGElement;

        this.codeMirrorContent = null;
        this.codeMirrorSrc = null;
        this.tokenKey = "PARC.LAND/BKPK_TOKEN";
        this.modes = ['direct', 'navigate'];
        this.mode = 'direct';

        // Initialize service managers
        this.historyManager = new HistoryManager(
            () => ({ canvasState: this.canvasState, viewState: this.viewState }),
            ({ canvasState, viewState }) => {
                this.canvasState = canvasState;
                this.viewState = viewState;
                this.selectionManager.clearSelection();
                this.requestRender();
            }
        );

        // Create initial viewState for ViewportManager
        const initialViewState: ViewState = {
            scale: 1,
            translateX: 0,
            translateY: 0
        };

        this.viewportManager = new ViewportManager(
            this.canvas,
            this.container,
            this.edgesLayer,
            canvasState.canvasId || "default",
            (id) => this.findElementById(id),
            initialViewState,
            () => {
                this.crdt.updateView(this.viewState);
                this.selectionManager.updateGroupBox();
            }
        );

        this.selectionManager = new SelectionManager(
            this.canvas,
            this.container,
            (id) => this.findElementById(id),
            () => this.canvasState.elements,
            (selectedIds) => {
                this.crdt.updateSelection(selectedIds);
                this.requestRender();
            }
        );

        // Set up legacy property accessors that delegate to services
        Object.defineProperty(this, 'selectedElementIds', {
            get: () => this.selectionManager.getSelectedIds(),
            set: (v: Set<string>) => this.selectionManager.setSelectedIds(v)
        });

        Object.defineProperty(this, 'selectedElementId', {
            get: () => this.selectionManager.getSingleSelectedId(),
            set: (v: string | null) => {
                if (v) {
                    this.selectionManager.selectElement(v, false);
                } else {
                    this.selectionManager.clearSelection();
                }
            }
        });

        Object.defineProperty(this, 'selectionBox', {
            get: () => null, // Managed internally by SelectionManager
            set: (_v) => { /* no-op */ }
        });

        Object.defineProperty(this, 'viewState', {
            get: () => this.viewportManager.getViewState(),
            set: (v: ViewState) => this.viewportManager.setViewState(v)
        });

        Object.defineProperty(this, 'groupBox', {
            get: () => this.selectionManager.getGroupBoxElement()
        });

        Object.defineProperty(this, 'MAX_SCALE', {
            get: () => this.viewportManager.MAX_SCALE
        });

        Object.defineProperty(this, 'MIN_SCALE', {
            get: () => this.viewportManager.MIN_SCALE
        });

        // Legacy history properties (delegate to historyManager)
        Object.defineProperty(this, '_undo', {
            get: () => [], // Internal to HistoryManager
            set: (_v) => { /* no-op */ }
        });

        Object.defineProperty(this, '_redo', {
            get: () => [], // Internal to HistoryManager
            set: (_v) => { /* no-op */ }
        });

        Object.defineProperty(this, '_maxHistory', {
            get: () => 100 // Internal to HistoryManager
        });

        this.switchMode('navigate');
        const helperActions = createGestureHelpers(this);
        let safeActions: any = {};
        Object.entries(helperActions).forEach(([key, fn]: [string, any]) => {
            safeActions[key] = (ctx: any, ev: any, meta?: any) => {
                console.log(`[Gesture Action: ${key}]`);
                try {
                    // run the real helper
                    return (fn as any)(ctx, ev, meta);
                } catch (err) {
                    console.error(`[Gesture Action Error: ${key}]`, err);
                    // emit an in‐machine event—this will bubble to your state machine
                    this.fsmService.send({ type: 'ERROR', action: key, error: err });
                    // swallow, so the machine's transition still completes
                }
            };
        });
        this.fsmService = interpret(
            gestureMachine.withContext({
                ...gestureMachine.context,
                controller: this,
            }).withConfig({
                actions: { ...safeActions },
            })
        ).start();
        this.uninstallAdapter = installPointerAdapter(
            this.canvas,
            this.fsmService,
            () => ({ ...this.viewState }),
            () => this.selectedElementIds
        );
        this.setupEventListeners();


        if (this.canvasState.parentCanvas) {
            this.drillUpBtn.style.display = 'block';
        } else {
            this.drillUpBtn.style.display = 'none';
        }

        (this.canvas as any).controller = this;

        this.updateCanvasTransform();
        this._renderQueued = false;
        this._edgesQueued = false;

        this.requestRender = () => {
            if (this._renderQueued) return;
            this._renderQueued = true;
            requestAnimationFrame(() => {
                this._renderQueued = false;
                this.renderElementsImmediately();
            });
        };
        this.requestEdgeUpdate = () => {
            if (this._edgesQueued) return;
            this._edgesQueued = true;
            requestAnimationFrame(() => {
                this._edgesQueued = false;
                this.renderEdgesImmediately();
            });
        };

        this.requestRender();
        this.uninstallCommandPalette = installCommandPalette(this);
    }

    detach() {
        // Remove context menu event listener
        if (this.contextMenuPointerDownHandler) {
            this.contextMenu.removeEventListener("pointerdown", this.contextMenuPointerDownHandler);
        }

        // Clean up services
        this.selectionManager.destroy();

        // Clean up DOM nodes
        Object.values(this.elementNodesMap).forEach(node => node.remove());
        this.elementNodesMap = {};
        Object.values(this.edgeNodesMap).forEach(line => line.remove());
        this.edgeNodesMap = {};
        if (this.edgeLabelNodesMap) {
            Object.values(this.edgeLabelNodesMap).forEach(label => label.remove());
            this.edgeLabelNodesMap = {};
        }
        this.container.innerHTML = '';
        this.staticContainer.innerHTML = '';
        this.edgesLayer.innerHTML = '';

        // Remove button click handlers
        this.modeBtn.onclick = null;
        this.drillUpBtn.onclick = null;

        this.hideContextMenu();

        if (window.CC === this) {
            window.CC = null as any;
            activeCanvasController = null;
        }
    }

    setupEventListeners() {

        this.contextMenuPointerDownHandler = (ev) => {
            console.log("contextMenu");
            ev.stopPropagation();
        };

        // Add context menu event listener
        this.contextMenu.addEventListener("pointerdown", this.contextMenuPointerDownHandler);

        // Add mode button click handler
        this.modeBtn.onclick = (ev) => {
            ev.stopPropagation();
            const newMode = (this.mode === 'direct') ? 'navigate' : 'direct';
            this.switchMode(newMode);
        };

        // Add drill up button click handler
        this.drillUpBtn.onclick = this.handleDrillUp.bind(this);
    }

    // History methods - delegate to HistoryManager
    undo() {
        this.historyManager.undo();
    }

    redo() {
        this.historyManager.redo();
    }

    _pushHistorySnapshot(label: string) {
        this.historyManager.snapshot(label);
    }

    // Legacy methods for compatibility
    _snapshot(label = '') {
        return {
            label,
            data: structuredClone({
                canvasState: this.canvasState,
                viewState: this.viewState
            })
        };
    }

    _stepHistory(fromStack: any[], toStack: any[], direction: string) {
        // Delegated to HistoryManager
        if (direction === 'undo') {
            this.historyManager.undo();
        } else {
            this.historyManager.redo();
        }
    }

    _restoreSnapshot({ canvasState, viewState }: { canvasState: CanvasState; viewState: ViewState }) {
        this.canvasState = structuredClone(canvasState);
        this.selectionManager.clearSelection();
        this.requestRender();
    }


    // Selection methods - delegate to SelectionManager
    createSelectionBox(startX: number, startY: number) {
        this.selectionManager.createSelectionBox(startX, startY);
    }

    updateSelectionBox(startX: number, startY: number, curX: number, curY: number) {
        this.selectionManager.updateSelectionBox(startX, startY, curX, curY);
    }

    removeSelectionBox() {
        this.selectionManager.removeSelectionBox();
    }

    selectElement(id: string, additive = false) {
        this.selectionManager.selectElement(id, additive);
    }

    clearSelection() {
        this.selectionManager.clearSelection();
    }

    isElementSelected(id: string) {
        return this.selectionManager.isElementSelected(id);
    }

    getGroupBBox() {
        return this.selectionManager.getGroupBBox();
    }

    updateGroupBox() {
        this.selectionManager.updateGroupBox();
    }

    switchMode(m?: string) {
        if (m && this.mode === m) return;
        this.mode = m!;
        this.updateModeUI();
        this.fsmService?.send('TOGGLE_MODE');
    }

    updateModeUI() {
        this.canvas.setAttribute("mode", this.mode);
        this.modeBtn.innerHTML = `<i class="fa-solid fa-${this.mode === 'direct' ? 'arrow-pointer' : 'hand'}"></i> ${this.mode === 'direct' ? 'Editing' : 'Viewing'}`;
    }

    // Viewport methods - delegate to ViewportManager
    loadLocalViewState() {
        this.viewportManager.loadLocalViewState();
    }

    saveLocalViewState() {
        this.viewportManager.saveLocalViewState();
    }

    updateCanvasTransform() {
        if ((this.canvas as any).controller !== this) return;
        this.viewportManager.updateCanvasTransform();
    }

    recenterOnElement(elId: string) {
        this.viewportManager.recenterOnElement(elId);
    }

    screenToCanvas(px: number, py: number): { x: number; y: number } {
        return this.viewportManager.screenToCanvas(px, py);
    }

    renderElementsImmediately() {
        if ((this.canvas as any).controller !== this) return;
        console.log(`requestRender()`);
        const existingIds = new Set(Object.keys(this.elementNodesMap));
        const usedIds = new Set();

        this.canvasState.elements.forEach(el => {
            usedIds.add(el.id);
            let node = this.elementNodesMap[el.id];
            if (!node) {
                node = this._ensureDomFor(el);
                (el.static ? this.staticContainer : this.container).appendChild(node);
                this.elementNodesMap[el.id] = node;
            }
            const isSel = this.selectedElementIds.has(el.id);
            this.updateElementNode(node, el, isSel);
        });

        existingIds.forEach(id => {
            if (!usedIds.has(id)) {
                const node = this.elementNodesMap[id];
                const view = elementRegistry.viewFor(node?.dataset.type);
                view?.unmount?.(node.firstChild as HTMLElement);
                node.remove();

                delete this.elementNodesMap[id];
            }
        });
        this.updateGroupBox()
        this.requestEdgeUpdate();
    }

    renderEdgesImmediately() {
        // console.log("requestEdgeUpdate()");

        // Ensure an SVG marker for arrowheads exists.
        let defs = this.edgesLayer.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            this.edgesLayer.prepend(defs);
        }
        if (!defs.querySelector("#arrowhead")) {
            const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
            marker.setAttribute("id", "arrowhead");
            marker.setAttribute("markerWidth", "10");
            marker.setAttribute("markerHeight", "7");
            marker.setAttribute("refX", "10");
            marker.setAttribute("refY", "3.5");
            marker.setAttribute("orient", "auto");
            const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            arrowPath.setAttribute("d", "M0,0 L0,7 L10,3.5 Z");
            arrowPath.setAttribute("fill", "#ccc");
            marker.appendChild(arrowPath);
            defs.appendChild(marker);
        }

        // Iterate over each edge in the canvas state.
        this.canvasState.edges.forEach(edge => {
            let line = this.edgeNodesMap[edge.id];
            if (!line) {
                // console.log("line node does not exists", edge, line)
                line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("stroke", edge.style?.color || "#ccc");
                line.setAttribute("stroke-width", edge.style?.thickness || "2");
                // Set arrow marker at the target end.
                line.setAttribute("marker-end", "url(#arrowhead)");
                this.edgeNodesMap[edge.id] = line;
                this.edgesLayer.appendChild(line);
            } else {
                // console.log("line node exists", edge, line)
            }

            this.updateEdgePosition(edge, line)
        });

        // Remove any orphaned SVG lines.
        Object.keys(this.edgeNodesMap).forEach(edgeId => {
            if (!this.canvasState.edges.find(e => e.id === edgeId)) {
                console.log(`[DEBUG] Deleting orphaned edge node`, edgeId, this.edgeNodesMap[edgeId])
                this.edgeNodesMap[edgeId].remove();
                delete this.edgeNodesMap[edgeId];
            }
        });
        // Remove orphaned labels.
        if (this.edgeLabelNodesMap) {
            Object.keys(this.edgeLabelNodesMap).forEach(edgeId => {
                if (!this.canvasState.edges.find(e => e.id === edgeId)) {
                    console.log(`[DEBUG] Deleting orphaned edge label`, edgeId, this.edgeLabelNodesMap[edgeId])
                    this.edgeLabelNodesMap[edgeId].remove();
                    delete this.edgeLabelNodesMap[edgeId];
                }
            });
        }
    }

    updateEdgePosition(edge: Edge, line: SVGLineElement) {
        if (!line) return;
        const sourceEl = this.findElementById(edge.source);
        const targetEl = this.findElementById(edge.target);
        const sourceEdge = sourceEl ? null : this.findEdgeElementById(edge.source);
        const targetEdge = targetEl ? null : this.findEdgeElementById(edge.target);

        let sourcePoint, targetPoint;
        if ((sourceEl || sourceEdge) && (targetEl || targetEdge)) {
            sourcePoint = this.computeIntersection(sourceEl || {
                x: parseFloat(this.edgeLabelNodesMap[edge.source].getAttribute("x")),
                y: parseFloat(this.edgeLabelNodesMap[edge.source].getAttribute("y"))
            }, targetEl || {
                x: parseFloat(this.edgeLabelNodesMap[edge.target].getAttribute("x")),
                y: parseFloat(this.edgeLabelNodesMap[edge.target].getAttribute("y"))
            });
            targetPoint = this.computeIntersection(targetEl || {
                x: parseFloat(this.edgeLabelNodesMap[edge.target].getAttribute("x")),
                y: parseFloat(this.edgeLabelNodesMap[edge.target].getAttribute("y"))
            }, sourceEl || {
                x: parseFloat(this.edgeLabelNodesMap[edge.source].getAttribute("x")),
                y: parseFloat(this.edgeLabelNodesMap[edge.source].getAttribute("y"))
            });
        }

        if (sourcePoint && targetPoint) {
            line.setAttribute("x1", String(sourcePoint.x));
            line.setAttribute("y1", String(sourcePoint.y));
            line.setAttribute("x2", String(targetPoint.x));
            line.setAttribute("y2", String(targetPoint.y));
            line.setAttribute("stroke-dasharray", edge.data?.meta ? "5,5" : edge.style?.dash || "");

            // Handle edge label:
            // Use a default label if none is present.
            const labelText = edge.label ? edge.label : "Edge";
            if (!this.edgeLabelNodesMap) this.edgeLabelNodesMap = {};
            let textEl = this.edgeLabelNodesMap[edge.id];
            if (!textEl) {
                textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                textEl.setAttribute("text-anchor", "middle");
                textEl.setAttribute("data-id", edge.id);
                textEl.setAttribute("alignment-baseline", "middle");
                textEl.setAttribute("fill", "#000");
                textEl.style.fontSize = "12px";
                if (this.selectedElementId === edge.id) textEl.style.fill = "red";
                this.edgeLabelNodesMap[edge.id] = textEl;
                this.edgesLayer.appendChild(textEl);
            }
            // Calculate midpoint of the line.
            const midX = (sourcePoint.x + targetPoint.x) / 2;
            const midY = (sourcePoint.y + targetPoint.y) / 2;
            textEl.setAttribute("x", String(midX));
            textEl.setAttribute("y", String(midY));
            textEl.textContent = labelText;

        } else {
            this.canvasState.edges = this.canvasState.edges.filter(ed => ed.id !== edge.id);
            line.remove();
        }
    }

    createElementNode(el: CanvasElement) {
        const node = document.createElement("div");
        node.classList.add("canvas-element");
        node.dataset.elId = el.id;
        return node;
    }

    updateElementNode(node: HTMLElement, el: CanvasElement, isSelected: boolean, skipHandles?: boolean) {
        this.crdt.updateElement(el.id, el)
        const view = this.elementRegistry.viewFor(el.type);
        if (view && typeof view.update === 'function') {
            view.update(el, node.firstChild, this);   // firstChild is view root
        } else {
            this.setElementContent(node, el);         // legacy fallback
        }

        this.applyPositionStyles(node, el);
        node.setAttribute("type", el.type);
        node.classList.remove("selected");
        if (isSelected) {
            node.classList.add("selected");
        }
        const peerSelected = Array.from((this.crdt as any).provider?.awareness?.getStates?.()?.values?.() || [])
            .filter( (p: any) => p.client?.clientId !== (this.crdt as any).provider?.awareness?.clientID)
            .flatMap( (p: any) => p.client?.selection || [])
        
        if (peerSelected.indexOf(el.id) >= 0) {
            node.classList.add("peer-selected");
        } else {
            node.classList.remove("peer-selected");
        }
        if ((this.crdt as any).provider?.awareness?.getStates?.())
        //this.setElementContent(node, el);

        if (!skipHandles) {
            // Remove old handles (if any)
            const oldHandles = Array.from(node.querySelectorAll('.element-handle'));
            oldHandles.forEach(h => h.remove());
            if (isSelected) {
                this.buildHandles(node, el);
            }
        }
    }

    /**
     * Visually flag a problem on a canvas element.
     * Re-invocations replace the message so only one badge is shown.
     */
    _showElementError(node, msg = 'Error') {
        if (!node) return;

        let badge = node.querySelector('.el-err');
        if (!badge) {
            badge = document.createElement('div');
            badge.className = 'el-err';
            Object.assign(badge.style, {
                position: 'absolute',
                top: 0,
                left: 0,
                maxWidth: '160px',
                padding: '.2em .4em',
                fontSize: 'calc(.6rem / var(--scale))',
                background: 'crimson',
                color: '#fff',
                fontFamily: 'monospace',
                zIndex: 9999,
                pointerEvents: 'none',
                whiteSpace: 'pre-wrap'
            });
            node.appendChild(badge);
        }
        badge.innerHTML = `<i class="fa fa-exclamation-triangle"/><span class="msg">${msg}</span>`;
    }

    async executeScriptElements(el, node) {

        // defer execution
        await new Promise(r => requestAnimationFrame(r));
        const scriptElements = Array.from(node.querySelectorAll('script')) as HTMLScriptElement[];

        const loadScript = (script: HTMLScriptElement) => {
            return new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = () => {
                    this._showElementError(node.closest('.canvas-element') as HTMLElement,
                        `Failed to load
${script.getAttribute('src')}`);
                    reject(new Error(`Failed to load script: ${script.getAttribute('src')}`));
                };
                document.head.appendChild(script);
            });
        };

        for (const scriptElement of scriptElements) {
            if (scriptElement.type !== 'module' &&
                !scriptElement.getAttribute('src') &&
                scriptElement.textContent.trim()) {

                try {
                    const fn = new Function('element', 'controller', 'node',
                        scriptElement.textContent || '');
                    fn(el, this, node);
                } catch (err: any) {
                    console.warn('Inline script error', err);
                    this._showElementError(node.closest('.canvas-element') as HTMLElement, err.message);
                }

            } else {
                await loadScript(scriptElement);
            }
        }
    }

    findElementOrEdgeById(id: string): CanvasElement | Edge | undefined {
        console.log(`[DEBUG] findElementOrEdgeById("${id}")`);
        return this.findElementById(id) || this.findEdgeElementById(id);
    }

    findElementById(id: string): CanvasElement | undefined {
        return this.canvasState.elements.find(e => e.id === id);
    }

    findEdgesByElementId(id: string): Edge[] {
        return this.canvasState.edges.filter(e => e.source === id || e.target === id);
    }

    findEdgeElementById(id: string): Edge | undefined {
        return this.canvasState.edges.find(e => e.id === id);
    }

    createNewElement(x: number, y: number, type = 'markdown', content = '', isCanvasContainer = false, data: any = {}) {
        const newId = "el-" + Date.now();
        const defaultMap = {
            text: "New text element",
            img: "Realistic tree on white background",
            html: "<div>Hello World</div>",
            markdown: "# New Markdown\nSome **content** here..."
        };
        let finalType = isCanvasContainer ? 'canvas-container' : type;
        let finalContent = content || defaultMap[finalType] || "Untitled";
        const scaleFactor = this.viewState.scale || 1;
        const elObj = {
            ...data,
            id: newId,
            x, y,
            width: 120 / scaleFactor,
            height: 40 / scaleFactor,
            rotation: 0,
            type: finalType,
            content: finalContent,
            versions: [],
            static: false,
        };
        this.canvasState.elements.push(elObj);
        this.selectElement(newId);
        this.requestRender();
        saveCanvas(this.canvasState);
        this._pushHistorySnapshot('New element');
        return newId;
    }

    createNewEdge(sourceId: string, targetId: string, label: string, data: any = {}, style: any = {}) {
        // Create a new edge object.
        const newEdge: Edge = {
            id: "edge-" + Date.now(),
            source: sourceId,
            target: targetId,
            label: label,
            style: {
                ...style,
            },
            data: {
                ...data,
            }
        };
        this.canvasState.edges.push(newEdge);
        this._pushHistorySnapshot('new edge');

    }

    createEditElement(ev: MouseEvent, el: CanvasElement, prop: string) {
        const canvasPt = this.screenToCanvas(ev.clientX, ev.clientY);
        const elId = this.createNewElement(canvasPt.x, canvasPt.y, "edit-prompt", el[prop], false, {
            target: el.id,
            property: prop,
        });
        this.switchMode('direct');
        this.createNewEdge(elId, el.id, "Editing...", { meta: true });
    }

    clickCapture(btn: HTMLElement, handler: (event: Event) => void) {
        btn.addEventListener("pointerdown", (ev: PointerEvent) => {
            ev.stopPropagation();
            btn.setPointerCapture(ev.pointerId);
        });
        btn.onclick = handler;
    }

    toggleStatic(el: CanvasElement) {
        const node = this.elementNodesMap[el.id];
        if (!node) return;
        if (!el.static) {
            const rect = node.getBoundingClientRect();
            const topPct = (rect.top / window.innerHeight) * 100;
            const leftPct = (rect.left / window.innerWidth) * 100;
            el.fixedTop = topPct;
            el.fixedLeft = leftPct;
            el.static = true;
        } else {
            const rect = node.getBoundingClientRect();
            const centerCanvas = this.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
            el.x = centerCanvas.x - (el.width * (el.scale || 1)) / 2;
            el.y = centerCanvas.y - (el.height * (el.scale || 1)) / 2;
            el.static = false;
        }
    }

    setElementContent(node: HTMLElement, el: CanvasElement) {
        const currentType = node.dataset.type || "";
        const currentContent = node.dataset.content || "";
        const currentSrc = node.dataset.src || "";
        const desiredSrc = el.src || "";
        if (
            currentType === el.type &&
            currentContent === el.content &&
            currentSrc === desiredSrc
        ) {
            return;
        }
        // console.log("Setting element content", el.id, el.type)
        node.dataset.type = el.type;
        node.dataset.content = el.content;
        node.dataset.src = desiredSrc;
        node.innerHTML = "";
        // Render based on type:
        if (el.type === "text") {
            const t = document.createElement('p');
            t.classList.add('content');
            t.textContent = el.content;
            t.style.color = el.color || "#000000";
            node.appendChild(t);
        } else if (el.type === "html") {
            const t = document.createElement('div');
            t.classList.add('content');
            t.innerHTML = el.content;
            node.appendChild(t);
            this.executeScriptElements(el, t);
        } else if (el.type === "markdown") {
            const t = document.createElement('div');
            t.classList.add('content');
            t.innerHTML = (window as any).marked.parse(el.content);
            t.style.color = el.color || "#000000";
            node.appendChild(t);
        } else if (el.type === "img") {
            const i = document.createElement("img");
            i.classList.add("content");
            i.dataset.image_id = el.imgId || "";
            i.title = el.content;
            i.onerror = (err) => {
                console.warn("Image failed to load", err);
            };

            if (!el.src && !i.src) {
                regenerateImage(el).then(() => {
                    saveCanvasLocalOnly(this.canvasState);
                    this.requestRender();
                });
            }
            i.src = el.src || `https://placehold.co/${Math.round(el.width)}x${Math.round(el.height)}?text=${encodeURIComponent(el.content)}&font=lora`;

            node.appendChild(i);
        } else if (el.type === "edit-prompt") {
            // Render a prompt element for editing using a mini CodeMirror editor.
            const container = document.createElement('div');
            container.classList.add('content');
            node.appendChild(container);
            if (!(node as any).editor) {
                (node as any).editor = (window as any).CodeMirror(container, {
                    value: el.content || "",
                    lineNumbers: false,
                    mode: "text",
                    theme: "default",
                    lineWrapping: true,
                    viewportMargin: Infinity
                });
            }
            // Add Save and Cancel buttons beneath the editor.
            const btnContainer = document.createElement('div');
            btnContainer.classList.add('actions');
            node.appendChild(btnContainer);
            const saveBtn = document.createElement('button');
            saveBtn.textContent = "Save";
            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = "Delete";
            const cancelBtn = document.createElement('button');
            cancelBtn.textContent = "Cancel";
            btnContainer.appendChild(cancelBtn);
            btnContainer.appendChild(saveBtn);
            btnContainer.appendChild(deleteBtn);

            deleteBtn.onclick = () => {
                console.log("edit-prompt delete target");
                const target = this.findElementOrEdgeById(el.target);
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== target?.id && e.id !== el.id);
                this.canvasState.edges = this.canvasState.edges.filter(e => e.id !== target?.id);
                this.requestRender();
                saveCanvas(this.canvasState);
            };

            saveBtn.onclick = () => {
                const val = (node as any).editor.getValue();
                const target = this.findElementOrEdgeById(el.target);
                if (target) {
                    console.log(`[DEBUG] Saving edit prompt content to [${target.id}] as property [${el.property}]. with value: "${val}"`, target, el);
                    target[el.property] = val;
                    this.requestEdgeUpdate();
                    saveCanvas(this.canvasState);
                }
                // Remove the edit-prompt element after saving
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== el.id);
                // Remove the meta edge connecting edit-prompt to the target
                this.canvasState.edges = this.canvasState.edges.filter(e => e.source !== el.id && e.target !== el.id);
                this.requestRender();
            };
            cancelBtn.onclick = () => {
                // Remove the edit-prompt element
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== el.id);
                // Remove the meta edge connecting edit-prompt to the target
                this.canvasState.edges = this.canvasState.edges.filter(e => e.source !== el.id && e.target !== el.id);
                this.requestRender();
                saveCanvas(this.canvasState);
            };
        } else {
            console.warn("Unknown element type", el.type, el)
            console.log("Delete?")
        }

        const c = node.querySelector('.content');
        if (c) {
            if (c.clientHeight < c.scrollHeight) {
                c.classList.add('scroller');
            } else {
                c.classList.remove('scroller');
            }
        }
        // only if someone has previously “converted” it
        if (el.refCanvasId) {
            const drillInBtn = document.createElement('button');
            drillInBtn.textContent = "Drill In";
            drillInBtn.style.marginTop = '0.5em';
            drillInBtn.onclick = async (ev) => {
                ev.stopPropagation();
                this.handleDrillIn(el);
            };
            c.appendChild(drillInBtn);
        }
    }

    deleteElementById(id: string) {
        this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== id);
        if (this.elementNodesMap[id]) {
            this.elementNodesMap[id].remove();
            delete this.elementNodesMap[id];
        }
        this._pushHistorySnapshot('delete element');

    }

    async handleDrillIn(el: CanvasElement) {
        console.log("handleDrillIn()", el)
        if (!el.refCanvasId) return alert("No canvas reference found.");
        const canvasState = await loadInitialCanvas({
            canvasId: el.refCanvasId,
            elements: [],
            edges: [],
            versionHistory: [],
            parentCanvas: this.canvasState.canvasId,
        }, undefined);
        this.detach()
        const childController = new CanvasController(canvasState);
        updateCanvasController(childController);
        childController.recenterOnElement(el.id);
        window.history.pushState({}, "", "?canvas=" + el.refCanvasId);
    }

    async handleDrillUp(ev: Event) {
        ev.stopPropagation();
        const canvasId = this.canvasState.parentCanvas;
        if (!canvasId) return;
        const canvasState = await loadInitialCanvas({
            canvasId: canvasId,
            elements: [],
            edges: [],
            versionHistory: [],
        } as CanvasState, undefined);
        this.detach();
        const controller = new CanvasController(canvasState);
        updateCanvasController(controller);
        if (this.canvasState.parentElement) {
            controller.recenterOnElement(this.canvasState.parentElement)
        }
        window.history.pushState({}, "", "?canvas=" + canvasId);
    };

    buildHandles(node: HTMLElement, _el: CanvasElement) {
        const h = (className: string, icon: string, click?: (event: Event) => void) => {
            const wrap = document.createElement('div');
            wrap.className = className + ' element-handle';
            const i = document.createElement('i');
            i.className = icon;
            wrap.appendChild(i);
            if (click) wrap.addEventListener('click', click);
            node.appendChild(wrap);
        };

        /* top-left – TYPE switcher */
        h('type-handle', 'fa-solid fa-font');

        /* top-right – SCALE */
        h('scale-handle', 'fa-solid fa-up-down-left-right');

        /* bottom-left – REORDER (z-index) */
        h('reorder-handle', 'fa-solid fa-layer-group');

        /* bottom-right – RESIZE width/height */
        h('resize-handle', 'fa-solid fa-up-right-and-down-left-from-center');

        /* rotation handle, centred above */
        h('rotate-handle rotate-handle-position',
            'fa-solid fa-rotate');

        /* edge creation handle */
        h('edge-handle', 'fa-solid fa-link');

        /* “create node” handle */
        h('create-handle', 'fa-solid fa-plus');
    }

    applyPositionStyles(node: HTMLElement, el: CanvasElement) {
        const scale = el.scale || 1;
        const rotation = el.rotation || 0;
        const zIndex = Math.floor(el.zIndex) || 1;
        const blendMode = el.blendMode || 'normal';
        node.style.setProperty('--blend-mode', blendMode);
        if (el.static) {
            node.style.position = 'fixed';
            node.style.left = (el.fixedLeft || 0) + '%';
            node.style.top = (el.fixedTop || 0) + '%';
            // node.style.width = (el.width * scale) + "px";
            // node.style.height = (el.height * scale) + "px";
            node.style.setProperty('--translateX', String(this.viewState.translateX));
            node.style.setProperty('--translateY', String(this.viewState.translateY));
            node.style.setProperty('--zoom', String(this.viewState.scale));

            node.style.setProperty('--width', (el.width * scale) + 'px');
            node.style.setProperty('--height', (el.height * scale) + 'px');
            node.style.setProperty('--scale', String(scale));   // used by CSS for .content
            node.style.zIndex = String(zIndex);                  // plain style, not a CSS var
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        } else {
            node.style.position = 'absolute';
            node.style.left = (el.x - (el.width * scale) / 2) + "px";
            node.style.top = (el.y - (el.height * scale) / 2) + "px";
            // node.style.width = (el.width * scale) + "px";
            // node.style.height = (el.height * scale) + "px";
            node.style.setProperty('--width', (el.width * scale) + 'px');
            node.style.setProperty('--height', (el.height * scale) + 'px');
            node.style.setProperty('--scale', String(scale));   // used by CSS for .content
            node.style.zIndex = String(zIndex);
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        }
        const edges = this.findEdgesByElementId(el.id) || [];
        this.requestEdgeUpdate();
    }
    // ------------------------------------------------------------------
    //  Registry helpers (new)
    // ------------------------------------------------------------------
    /** Ensure a DOM node exists for el, mounted through its ElementView. */
    _ensureDomFor(el: CanvasElement) {
        let node = this.elementNodesMap[el.id];
        if (node) return node;

        const view = this.elementRegistry.viewFor(el.type);
        node = document.createElement('div');
        node.classList.add('canvas-element');
        node.dataset.elId = el.id;
        node.dataset.type = el.type;

        /* Let the view create its inside DOM */
        if (view) {
            const inner = view.mount(el, this);
            inner && node.appendChild(inner);
        } else {
            /* fallback – keep old hard-wired rendering for legacy types */
            this.setElementContent(node, el);
        }
        this.elementNodesMap[el.id] = node;
        return node;
    }

    computeIntersection(el: CanvasElement | { x: number; y: number }, otherEl: CanvasElement | { x: number; y: number }): { x: number; y: number } {
        // 1) Center and scale as before
        const cx = el.x;
        const cy = el.y;
        const scaleFactor = ('scale' in el) ? (el.scale || 1) : 1;
        const w = (('width' in el) ? (el.width || 10) : 10) * scaleFactor;
        const h = (('height' in el) ? (el.height || 10) : 10) * scaleFactor;
        const halfW = w / 2;
        const halfH = h / 2;

        // 2) Vector from el center to otherEl
        let dx = otherEl.x - cx;
        let dy = otherEl.y - cy;

        // If same point, return center
        if (dx === 0 && dy === 0) {
            return { x: cx, y: cy };
        }

        // 3) Un-rotate the direction vector into the rectangle's local axes
        const theta = ((('rotation' in el) ? (el.rotation || 0) : 0) * Math.PI) / 180;
        const cosθ = Math.cos(-theta);
        const sinθ = Math.sin(-theta);
        const localDX = dx * cosθ - dy * sinθ;
        const localDY = dx * sinθ + dy * cosθ;

        // 4) Compute intersection on an axis-aligned box in local space
        const scaleX = localDX !== 0 ? halfW / Math.abs(localDX) : Infinity;
        const scaleY = localDY !== 0 ? halfH / Math.abs(localDY) : Infinity;
        const scale = Math.min(scaleX, scaleY);

        const localIX = localDX * scale;
        const localIY = localDY * scale;

        // 5) Rotate the intersection point back into world axes
        const cosθf = Math.cos(theta);
        const sinθf = Math.sin(theta);
        const worldIX = localIX * cosθf - localIY * sinθf;
        const worldIY = localIX * sinθf + localIY * cosθf;

        // 6) Translate back to world coordinates
        return {
            x: cx + worldIX,
            y: cy + worldIY
        };
    }


    buildContextMenu(elId?: string) {
        const el = elId ? (this.findElementById(elId) || this.findEdgeElementById(elId)) : undefined;
        buildContextMenu(el as any, this);
    }

    hideContextMenu() {
        this.contextMenu.style.display = "none";
    }

    showContextMenu(x: number, y: number) {
        this.contextMenu.style.left = x + "px";
        this.contextMenu.style.top = y + "px";
        this.contextMenu.style.display = "flex";
    }


    async openEditModal(el?: CanvasElement) {
        console.log("[openEditModa] init", el);
        // If caller didn't pass one, use the single selected element (legacy path)
        if (!el && this.selectedElementId) el = this.findElementById(this.selectedElementId);
        if (!el) return;                              // nothing to edit

        try {
            console.log("[openEditModa] launch", el);
            // Launch the self-contained modal and wait for the user to finish
            const { status, el: updated } = await showModal(el, {
                /* Callback the modal can use for the “Generate” button */
                generateContent: (seed) => generateContent(seed, el, this)
            });

            // Persist changes if the user hit “Save”
            if (status === 'saved' && updated) {
                Object.assign(el, updated);               // merge returned changes
                this.updateElementNode(this.elementNodesMap[el.id], el, true);
                this.requestEdgeUpdate();                       // edge labels may have changed
                saveCanvas(this.canvasState);
                this._pushHistorySnapshot('edit element');

            }
        } catch (err) {
            console.error('[openEditModal] modal error:', err);
        }
    }
}

let activeCanvasController: CanvasController | null = null;
function updateCanvasController(controller: CanvasController) {
    activeCanvasController = window.CC = controller
}

(async function main() {
    const params = new URLSearchParams(window.location.search);
    const canvasId = params.get("canvas") || "canvas-002";
    const token = params.get("token");
    let rootCanvasState = {
        canvasId: canvasId,
        elements: [],
        edges: [],
        versionHistory: []
    };
    rootCanvasState = await loadInitialCanvas(rootCanvasState, token);
    updateCanvasController(new CanvasController(rootCanvasState));
})();
