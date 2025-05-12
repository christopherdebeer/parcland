import { interpret } from 'xstate';
import { gestureMachine } from './lib/gestureMachine.js';
import { installPointerAdapter } from './lib/pointerAdapter.js';
import { createGestureHelpers } from './lib/gesture-helpers.js';
import { buildContextMenu } from './lib/context-menu';
import { installCommandPalette } from './lib/command-palette.js';
import { generateContent, regenerateImage } from './lib/generation';
import { loadInitialCanvas, saveCanvas, saveCanvasLocalOnly } from './lib/storage';
import { showModal } from './lib/modal.js';
import { elementRegistry } from './lib/elementRegistry.js';

class CanvasController {
    constructor(canvasState) {
        updateCanvasController(this)
        this.canvasState = canvasState;
        if (!this.canvasState.edges) {
            this.canvasState.edges = [];
        }

        this.selectedElementIds = new Set();   // multiselect aware
        Object.defineProperty(this, 'selectedElementId', {  // legacy shim
            get: () => (this.selectedElementIds.size === 1 ? [...this.selectedElementIds][0] : null),
            set: (v) => { this.selectedElementIds.clear(); if (v) this.selectedElementIds.add(v); }
        });

        this.selectionBox = null;              // DOM element for the rubber‑band rectangle
        this.activeEditTab = "content"; // "content" or "src"

        this.viewState = {
            scale: 1,
            translateX: 0,
            translateY: 0
        };

        this.elementNodesMap = {};
        this.edgeNodesMap = {};

        this.canvas = document.getElementById("canvas");
        this.container = document.getElementById("canvas-container");
        this.staticContainer = document.getElementById("static-container");
        this.contextMenu = document.getElementById("context-menu");
        this.modeBtn = document.getElementById("mode");
        this.drillUpBtn = document.getElementById("drillUp");
        this.edgesLayer = document.getElementById("edges-layer");

        this.MAX_SCALE = 10;
        this.MIN_SCALE = 0.1;

        this.codeMirrorContent = null;
        this.codeMirrorSrc = null;

        this.tokenKey = "PARC.LAND/BKPK_TOKEN";

        this.modes = ['direct', 'navigate'];
        this.mode = 'direct';
        this.switchMode('navigate');

        /* ── UNDO / REDO stacks ─────────────────────────────────── */
        this._undo = [];          // stack of past states
        this._redo = [];          // stack of undone states
        this._maxHistory = 100;   // ring-buffer size

        // First entry = pristine state so the user can always go “Back to start”
        this._pushHistorySnapshot('Init');

        this.loadLocalViewState();
        const helperActions = createGestureHelpers(this);
        let safeActions = {};
        Object.entries(helperActions).forEach(([key, fn]) => {
            safeActions[key] = (ctx, ev, meta) => {
                console.log(`[Gesture Action: ${key}]`);
                try {
                    // run the real helper
                    return fn(ctx, ev, meta);
                } catch (err) {
                    console.error(`[Gesture Action Error: ${key}]`, err);
                    // emit an in‐machine event—this will bubble to your state machine
                    this.fsmService.send({ type: 'ERROR', action: key, error: err });
                    // swallow, so the machine’s transition still completes
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

        this.canvas.controller = this;

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
            window.CC = null;
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

    undo() { this._stepHistory(this._undo, this._redo, 'undo'); }
    redo() { this._stepHistory(this._redo, this._undo, 'redo'); }

    _snapshot(label = '') {
        return {
            label,
            data: structuredClone({
                canvasState: this.canvasState,
                viewState: this.viewState
            })
        };
    }

    _pushHistorySnapshot(label) {
        const snap = this._snapshot(label);
        this._undo.push(snap);
        if (this._undo.length > this._maxHistory) this._undo.shift();
        this._redo.length = 0;            // clear redo chain
    }

    _stepHistory(fromStack, toStack, direction) {
        if (fromStack.length === 0) return;
        const cur = this._snapshot();     // current → opposite stack
        toStack.push(cur);
        const { data } = fromStack.pop(); // restore previous
        this._restoreSnapshot(data);
    }

    _restoreSnapshot({ canvasState, viewState }) {
        this.canvasState = structuredClone(canvasState);
        //this.viewState   = structuredClone(viewState);

        // clear selection, keep mode
        this.selectedElementIds.clear();
        this.requestRender();
        //this.updateCanvasTransform();
    }


    createSelectionBox(startX, startY) {
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'lasso-box';
        Object.assign(this.selectionBox.style, {
            position: 'absolute',
            border: '1px dashed #00aaff',
            background: 'rgba(0,170,255,0.05)',
            left: `${startX}px`,
            top: `${startY}px`,
            width: '0px',
            height: '0px',
            zIndex: 10000,
            pointerEvents: 'none'
        });
        this.canvas.appendChild(this.selectionBox);
    }

    updateSelectionBox(startX, startY, curX, curY) {
        if (!this.selectionBox) this.createSelectionBox(startX, startY)
        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);
        Object.assign(this.selectionBox.style, {
            left: `${x}px`, top: `${y}px`,
            width: `${w}px`, height: `${h}px`
        });
    }

    removeSelectionBox() {
        if (this.selectionBox) { this.selectionBox.remove(); this.selectionBox = null; }
    }


    selectElement(id, additive = false) {
        if (!additive) this.selectedElementIds.clear();
        console.log("[Controller] selectElement", id, { additive })
        const el = this.findElementById(id);
        if (el?.group) {
            // pull in every element with the same group ID
            const gid = el.group;
            this.canvasState.elements
                .filter(e => e.group === gid)
                .forEach(e => this.selectedElementIds.add(e.id));
        } else {
            // fall back to single‐element toggle
            if (this.selectedElementIds.has(id) && additive) {
                this.selectedElementIds.delete(id);
            } else {
                this.selectedElementIds.add(id);
            }
        }

        this.requestRender();
    }

    clearSelection() {
        if (this.selectedElementIds.size) {
            this.selectedElementIds.clear();
            this.requestRender();
        }
    }

    isElementSelected(id) {
        return this.selectedElementIds.has(id);
    }

    getGroupBBox() {
        if (this.selectedElementIds.size === 0) return null;
        const els = [...this.selectedElementIds].map(id => this.findElementById(id));
        const xs = els.map(e => e.x - (e.width * (e.scale || 1)) / 2);
        const ys = els.map(e => e.y - (e.height * (e.scale || 1)) / 2);
        const xe = els.map(e => e.x + (e.width * (e.scale || 1)) / 2);
        const ye = els.map(e => e.y + (e.height * (e.scale || 1)) / 2);
        return {
            x1: Math.min(...xs), y1: Math.min(...ys),
            x2: Math.max(...xe), y2: Math.max(...ye),
            cx: (Math.min(...xs) + Math.max(...xe)) / 2,
            cy: (Math.min(...ys) + Math.max(...ye)) / 2
        };
    }

    switchMode(m) {
        if (m && this.mode === m) return;
        this.mode = m;
        this.updateModeUI();
        this.fsmService?.send('TOGGLE_MODE');
    }

    updateModeUI() {
        this.canvas.setAttribute("mode", this.mode);
        this.modeBtn.innerHTML = `<i class="fa-solid fa-${this.mode === 'direct' ? 'arrow-pointer' : 'hand'}"></i> ${this.mode === 'direct' ? 'Editing' : 'Viewing'}`;
    }

    loadLocalViewState() {
        try {
            const key = "canvasViewState_" + (this.canvasState.canvasId || "default");
            const saved = localStorage.getItem(key);
            if (saved) {
                const vs = JSON.parse(saved);
                this.viewState.scale = vs.scale || 1;
                this.viewState.translateX = vs.translateX || 0;
                this.viewState.translateY = vs.translateY || 0;
            }
        } catch (e) {
            console.warn("No local viewState found", e);
        }
    }

    saveLocalViewState() {
        try {
            const key = "canvasViewState_" + (this.canvasState.canvasId || "default");
            localStorage.setItem(key, JSON.stringify(this.viewState));
        } catch (e) {
            console.warn("Could not store local viewState", e);
        }
    }

    updateCanvasTransform() {
        if (this.canvas.controller !== this) return;

        this.container.style.transform = `translate(${this.viewState.translateX}px, ${this.viewState.translateY}px) scale(${this.viewState.scale})`;
        this.container.style.setProperty('--translateX', this.viewState.translateX);
        this.container.style.setProperty('--translateY', this.viewState.translateY);
        this.container.style.setProperty('--zoom', this.viewState.scale);

        // Get the canvas (visible) size
        const canvasRect = this.canvas.getBoundingClientRect();
        const W = canvasRect.width;
        const H = canvasRect.height;

        // Compute the visible region in canvas coordinates:
        const visibleX = -this.viewState.translateX / this.viewState.scale;
        const visibleY = -this.viewState.translateY / this.viewState.scale;
        const visibleWidth = W / this.viewState.scale;
        const visibleHeight = H / this.viewState.scale;

        // Set the viewBox attribute on the SVG layer so that its coordinate system
        // matches the visible region.
        this.edgesLayer.setAttribute("viewBox", `${visibleX} ${visibleY} ${visibleWidth} ${visibleHeight}`);
        // console.log("[DEBUG] SVG viewBox updated to:", visibleX, visibleY, visibleWidth, visibleHeight);
    }

    recenterOnElement(elId) {
        const el = this.findElementById(elId);
        if (!el) {
            console.warn(`Element with ID "${elId}" not found.`);
            return;
        }

        // Compute the center of the element in canvas coordinates
        const scale = this.viewState.scale || 1;
        const elCenterX = el.x;
        const elCenterY = el.y;

        // Get canvas size in pixels
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasCenterX = canvasRect.width / 2;
        const canvasCenterY = canvasRect.height / 2;

        // Compute new translation to center the element
        this.viewState.translateX = canvasCenterX - (elCenterX * scale);
        this.viewState.translateY = canvasCenterY - (elCenterY * scale);

        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    renderElementsImmediately() {
        if (this.canvas.controller !== this) return;
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
                view?.unmount?.(node.firstChild);
                node.remove();

                delete this.elementNodesMap[id];
            }
        });

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

    updateEdgePosition(edge, line) {
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
            line.setAttribute("x1", sourcePoint.x);
            line.setAttribute("y1", sourcePoint.y);
            line.setAttribute("x2", targetPoint.x);
            line.setAttribute("y2", targetPoint.y);
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
            textEl.setAttribute("x", midX);
            textEl.setAttribute("y", midY);
            textEl.textContent = labelText;

        } else {
            this.canvasState.edges = this.canvasState.edges.filter(ed => ed.id !== edge.id);
            line.remove();
        }
    }

    createElementNode(el) {
        const node = document.createElement("div");
        node.classList.add("canvas-element");
        node.dataset.elId = el.id;
        return node;
    }

    updateElementNode(node, el, isSelected, skipHandles) {
        const view = elementRegistry.viewFor(el.type);
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
        this.setElementContent(node, el);

        if (!skipHandles) {
            // Remove old handles (if any)
            const oldHandles = Array.from(node.querySelectorAll('.element-handle'));
            oldHandles.forEach(h => h.remove());
            if (isSelected) {
                this.buildHandles(node, el);
            }
        }
    }

    async executeScriptElements(el, node) {
        const scriptElements = Array.from(node.querySelectorAll('script'));
        const loadScript = (script) => {
            console.log("Loading script", script);
            return new Promise((resolve, reject) => {
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
                document.head.appendChild(script);
            });
        };

        for (const scriptElement of scriptElements) {
            console.log("Encountered script", scriptElement);
            if (scriptElement.type !== 'module' && !scriptElement.getAttribute('src') && scriptElement.textContent && scriptElement.textContent.trim()) {
                const code = scriptElement.textContent;
                try {
                    const run = new Function('element', 'controller', 'node', code);
                    run(el, this, node);
                } catch (err) {
                    console.warn("Error executing script", el, node, err)
                }

            }
            else {
                loadScript(scriptElement);
            }
        }
    }

    findElementOrEdgeById(id) {
        console.log(`[DEBUG] findElementOrEdgeById("${id}")`);
        return this.findElementById(id) || this.findEdgeElementById(id);
    }

    findElementById(id) {
        return this.canvasState.elements.find(e => e.id === id);
    }

    findEdgesByElementId(id) {
        return this.canvasState.edges.filter(e => e.source === id || e.target === id);
    }

    findEdgeElementById(id) {
        return this.canvasState.edges.find(e => e.id === id);
    }

    createNewElement(x, y, type = 'markdown', content = '', isCanvasContainer = false, data = {}) {
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

    createNewEdge(sourceId, targetId, label, data = {}, style = {}) {
        // Create a new edge object.
        const newEdge = {
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

    createEditElement(ev, el, prop) {
        const canvasPt = this.screenToCanvas(ev.clientX, ev.clientY);
        const elId = this.createNewElement(canvasPt.x, canvasPt.y, "edit-prompt", el[prop], false, {
            target: el.id,
            property: prop,
        });
        this.switchMode('direct');
        this.createNewEdge(elId, el.id, "Editing...", { meta: true });
    }

    clickCapture(btn, handler) {
        btn.addEventListener("pointerdown", (ev) => {
            ev.stopPropagation();
            btn.setPointerCapture(ev.pointerId);
        });
        btn.onclick = handler;
    }

    toggleStatic(el) {
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

    screenToCanvas(px, py) {
        const dx = px - this.canvas.offsetLeft;
        const dy = py - this.canvas.offsetTop;
        return {
            x: (dx - this.viewState.translateX) / this.viewState.scale,
            y: (dy - this.viewState.translateY) / this.viewState.scale
        };
    }

    setElementContent(node, el) {
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
            t.innerHTML = marked.parse(el.content);
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
                    saveCanvasLocalOnly();
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
            if (!node.editor) {
                node.editor = CodeMirror(container, {
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
                const val = node.editor.getValue();
                const target = this.findElementOrEdgeById(el.target);
                if (target) {
                    console.log(`[DEBUG] Saving edit prompt content to [${target.id}] as property [${el.property}]. with value: "${val}"`, target, el);
                    if (target) {
                        target[el.property] = val;
                        this.requestEdgeUpdate();
                        saveCanvas(this.canvasState);
                    }
                }
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== el.id);
                this.requestRender();
            };
            cancelBtn.onclick = () => {
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== el.id);
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

    deleteElementById(id) {
        this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== id);
        if (this.elementNodesMap[id]) {
            this.elementNodesMap[id].remove();
            delete this.elementNodesMap[id];
        }
        this._pushHistorySnapshot('delete element');

    }

    async handleDrillIn(el) {
        console.log("handleDrillIn()", el)
        if (!el.refCanvasId) return alert("No canvas reference found.");
        const canvasState = await loadInitialCanvas({
            canvasId: el.refCanvasId,
            elements: [],
            edges: [],
            versionHistory: [],
            parentCanvas: this.canvasState.canvasId,
        });
        this.detach()
        const childController = new CanvasController(canvasState, this);
        updateCanvasController(childController);
        childController.recenterOnElement(el.id);
        window.history.pushState({}, "", "?canvas=" + el.refCanvasId);
    }

    async handleDrillUp(ev) {
        ev.stopPropagation();
        const canvasId = this.canvasState.parentCanvas;
        if (!canvasId) return;
        const canvasState = await loadInitialCanvas({
            canvasId: canvasId,
            elements: [],
            edges: [],
            versionHistory: [],
        });
        this.detach();
        const controller = new CanvasController(canvasState);
        updateCanvasController(controller);
        if (this.canvasState.parentElement) {
            controller.recenterOnElement(this.canvasState.parentElement)
        }
        window.history.pushState({}, "", "?canvas=" + canvasId);
    };

    buildHandles(node, el) {
        const h = (className, icon, click) => {
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

    applyPositionStyles(node, el) {
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
            node.style.setProperty('--translateX', this.viewState.translateX);
            node.style.setProperty('--translateY', this.viewState.translateY);
            node.style.setProperty('--zoom', this.viewState.scale);

            node.style.setProperty('--width', (el.width * scale) + 'px');
            node.style.setProperty('--height', (el.height * scale) + 'px');
            node.style.setProperty('--scale', scale);   // used by CSS for .content
            node.style.zIndex = zIndex;                  // plain style, not a CSS var
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        } else {
            node.style.position = 'absolute';
            node.style.left = (el.x - (el.width * scale) / 2) + "px";
            node.style.top = (el.y - (el.height * scale) / 2) + "px";
            // node.style.width = (el.width * scale) + "px";
            // node.style.height = (el.height * scale) + "px";
            node.style.setProperty('--width', (el.width * scale) + 'px');
            node.style.setProperty('--height', (el.height * scale) + 'px');
            node.style.setProperty('--scale', scale);   // used by CSS for .content
            node.style.zIndex = zIndex;
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        }
        const edges = this.findEdgesByElementId(el.id) || [];
        this.requestEdgeUpdate();
    }
    // ------------------------------------------------------------------
    //  Registry helpers (new)
    // ------------------------------------------------------------------
    /** Ensure a DOM node exists for el, mounted through its ElementView. */
    _ensureDomFor(el) {
        let node = this.elementNodesMap[el.id];
        if (node) return node;

        const view = elementRegistry.viewFor(el.type);
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

    computeIntersection(el, otherEl) {
        // 1) Center and scale as before
        const cx = el.x;
        const cy = el.y;
        const scaleFactor = el.scale || 1;
        const w = (el.width || 10) * scaleFactor;
        const h = (el.height || 10) * scaleFactor;
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
        const theta = ((el.rotation || 0) * Math.PI) / 180;
        const cosθ = Math.cos(-theta);
        const sinθ = Math.sin(-theta);
        const localDX = dx * cosθ - dy * sinθ;
        const localDY = dx * sinθ + dy * cosθ;
    
        // 4) Compute intersection on an axis-aligned box in local space
        const scaleX = localDX !== 0 ? halfW / Math.abs(localDX) : Infinity;
        const scaleY = localDY !== 0 ? halfH / Math.abs(localDY) : Infinity;
        const scale  = Math.min(scaleX, scaleY);
    
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
    

    buildContextMenu(elId) {
        const el = this.findElementById(elId) || this.findEdgeElementById(elId);
        buildContextMenu(el, this);
    }

    hideContextMenu() {
        this.contextMenu.style.display = "none";
    }

    showContextMenu(x, y) {
        this.contextMenu.style.left = x + "px";
        this.contextMenu.style.top = y + "px";
        this.contextMenu.style.display = "flex";
    }


    async openEditModal(el) {
        console.log("[openEditModa] init", el);
        // If caller didn’t pass one, use the single selected element (legacy path)
        if (!el) el = this.findElementById(this.selectedElementId);
        if (!el) return;                              // nothing to edit

        try {
            console.log("[openEditModa] launch", el);
            // Launch the self-contained modal and wait for the user to finish
            const { status, el: updated } = await showModal(el, {
                /* Callback the modal can use for the “Generate” button */
                generateContent: (seed) => generateContent(seed, el)
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

let activeCanvasController = null;
function updateCanvasController(controller) {
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
