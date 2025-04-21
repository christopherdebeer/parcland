import { buildContextMenu } from './lib/context-menu';

class CanvasController {
    constructor(canvasState, parentController = null) {
        updateCanvasController(this)
        this.canvasState = canvasState;
        if (!this.canvasState.edges) {
            this.canvasState.edges = [];
        }
        this.parentController = parentController;
        this.selectedElementId = null;
        this.activeGesture = null;
        this.initialTouches = [];
        this.activeEditTab = "content"; // "content" or "src"
        // For edge modal editing:
        this.edgeBeingEdited = null;

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
        this.editModal = document.getElementById("edit-modal");
        this.drillUpBtn = document.getElementById("drillUp");
        this.edgesLayer = document.getElementById("edges-layer");

        // For modal editors using CodeMirror on divs
        this.editorContentContainer = document.getElementById("editor-content");
        this.editorSrcContainer = document.getElementById("editor-src");

        this.modalCancelBtn = document.getElementById("modal-cancel");
        this.modalSaveBtn = document.getElementById("modal-save");
        this.modalGenerateBtn = document.getElementById("modal-generate");

        this.modalVersionsPrevBtn = document.getElementById("versions-prev");
        this.modalVersionsNextBtn = document.getElementById("versions-next");
        this.modalVersionsInfo = document.getElementById("versions-info");
        this.modalError = document.getElementById("modal-error");

        this.lastTapPosition = { x: 0, y: 0 };
        this.dragStartPos = { x: 0, y: 0 };
        this.elementStartPos = { x: 0, y: 0 };
        this.elementStartSize = { width: 0, height: 0 };
        this.elementStartRotation = 0;
        this.centerForRotation = { x: 0, y: 0 };
        this.initialPinchDistance = 0;
        this.elementPinchStartSize = { width: 0, height: 0 };
        this.elementPinchStartCenter = { x: 0, y: 0 };
        this.pinchCenterStartCanvas = { x: 0, y: 0 };
        this.initialCanvasScale = 1;
        this.pinchCenterScreen = { x: 0, y: 0 };
        this.pinchCenterCanvas = { x: 0, y: 0 };

        this.MAX_SCALE = 10;
        this.MIN_SCALE = 0.1;

        this.activeEdgeCreation = null;

        this.codeMirrorContent = null;
        this.codeMirrorSrc = null;

        this.saveTimeout = null;
        this.debounceSaveDelay = 500;

        this.tokenKey = "PARC.LAND/BKPK_TOKEN";

        this.modes = ['direct', 'navigate'];
        this.mode = 'navigate';
        this.switchMode('navigate');

        this.loadLocalViewState();
        this.setupEventListeners();

        if (this.parentController) {
            this.drillUpBtn.style.display = 'block';
        } else {
            this.drillUpBtn.style.display = 'none';
        }

        this.updateCanvasTransform();
        this.renderElements();
    }

    blockPropagation(ev) {
        console.log("[DEBUG] Blocking event propagation on", ev.target);
        ev.stopPropagation();
    }

    // --- NEW FIX: keep touches in sync and abort false pinches ---
    removeActivePointer(pointerId) {
        // Remove this pointer from the active touches list
        this.initialTouches = this.initialTouches.filter(t => t.id !== pointerId);
        // If we're in a pinch gesture but now have fewer than 2 touches, cancel it
        if (this.initialTouches.length < 2 && this.activeGesture && this.activeGesture.startsWith("pinch")) {
            this.activeGesture = null;
        }
    }

    setupEventListeners() {
        this.modeBtn.onclick = (ev) => {
            ev.stopPropagation();
            const newMode = (this.mode === 'direct') ? 'navigate' : 'direct';
            this.switchMode(newMode);
        };

        this.drillUpBtn.onclick = () => {
            if (this.parentController) {
                updateCanvasController(this.parentController)
                window.history.pushState({}, "", "?canvas=" + activeCanvasController.canvasState.canvasId);
            }
        };

        this.canvas.addEventListener("pointerdown", (ev) => this.onPointerDownCanvas(ev), { passive: false });
        this.canvas.addEventListener("pointermove", (ev) => this.onPointerMoveCanvas(ev), { passive: false });
        this.canvas.addEventListener("pointerup", (ev) => this.onPointerUpCanvas(ev), { passive: false });
        this.canvas.addEventListener("pointercancel", (ev) => this.onPointerUpCanvas(ev), { passive: false });
        this.canvas.addEventListener("wheel", (ev) => this.onWheelCanvas(ev), { passive: false });

        this.container.addEventListener("pointerdown", (ev) => this.onPointerDownElement(ev), { passive: false });
        this.container.addEventListener("pointermove", (ev) => this.onPointerMoveElement(ev), { passive: false });
        this.container.addEventListener("pointerup", (ev) => this.onPointerUpElement(ev), { passive: false });
        this.container.addEventListener("pointercancel", (ev) => this.onPointerUpElement(ev), { passive: false });

        this.staticContainer.addEventListener("pointerdown", (ev) => this.onPointerDownElement(ev), { passive: false });
        this.staticContainer.addEventListener("pointermove", (ev) => this.onPointerMoveElement(ev), { passive: false });
        this.staticContainer.addEventListener("pointerup", (ev) => this.onPointerUpElement(ev), { passive: false });
        this.staticContainer.addEventListener("pointercancel", (ev) => this.onPointerUpElement(ev), { passive: false });

        this.edgesLayer.addEventListener("pointerdown", this.blockPropagation.bind(this));
        this.edgesLayer.addEventListener("pointerup", this.blockPropagation.bind(this));
        this.edgesLayer.addEventListener("pointerup", (ev) => this.onPointerUpEdges(ev), { passive: false });

        this.contextMenu.addEventListener("pointerdown", (ev) => {
            console.log("contextMenu");
            ev.stopPropagation();
        });

        this.modalCancelBtn.onclick = () => {
            this.editModal.style.display = "none";
        };

        this.modalSaveBtn.onclick = () => {
            const el = this.findElementById(this.selectedElementId);
            if (el) {
                if (this.activeEditTab === "content") {
                    const newContent = this.codeMirrorContent.getValue();
                    if (el.content) {
                        el.versions = el.versions || [];
                        el.versions.push({ content: el.content, timestamp: Date.now() });
                    }
                    el.content = newContent;
                    if (el.type !== "img") {
                        el.src = undefined;
                    }
                } else if (this.activeEditTab === "src") {
                    const newSrc = this.codeMirrorSrc.getValue();
                    el.src = newSrc;
                }
                this.updateElementNode(this.elementNodesMap[el.id], el, true);
                this.saveCanvas();
            }
            this.editModal.style.display = "none";
        };

        this.modalGenerateBtn.onclick = async () => {
            const el = this.findElementById(this.selectedElementId);
            if (!el) return;
            this.clearModalError();
            this.modalGenerateBtn.disabled = true;
            const oldBtnContent = this.modalGenerateBtn.innerHTML;
            this.modalGenerateBtn.innerHTML = `Generating... <i class="fa-solid fa-spinner fa-spin"></i>`;
            try {
                let currentContent;
                if (this.activeEditTab === "content") {
                    currentContent = this.codeMirrorContent.getValue();
                } else {
                    currentContent = this.codeMirrorSrc.getValue();
                }
                const generatedContent = await this.generateContent(currentContent, el);
                if (generatedContent) {
                    if (this.activeEditTab === "content") {
                        this.codeMirrorContent.setValue(generatedContent);
                    } else {
                        this.codeMirrorSrc.setValue(generatedContent);
                    }
                } else {
                    this.showModalError("No content generated or an error occurred.");
                }
            } catch (err) {
                console.error("Generate error", err);
                this.showModalError("An error occurred while generating content.");
            } finally {
                this.modalGenerateBtn.disabled = false;
                this.modalGenerateBtn.innerHTML = oldBtnContent;
            }
        };

        document.getElementById("modal-clear").onclick = () => {
            if (this.activeEditTab === "content") {
                this.codeMirrorContent.setValue("");
            } else {
                this.codeMirrorSrc.setValue("");
            }
        };

        document.getElementById("modal-copy").onclick = async () => {
            try {
                if (this.activeEditTab === "content") {
                    await navigator.clipboard.writeText(this.codeMirrorContent.getValue());
                } else {
                    await navigator.clipboard.writeText(this.codeMirrorSrc.getValue());
                }
                alert("Copied to clipboard!");
            } catch (err) {
                console.error("Failed to copy:", err);
            }
        };

        this.modalVersionsPrevBtn.onclick = () => {
            if (!this.currentElForVersions) return;
            if (this.currentVersionIndex > 0) {
                this.currentVersionIndex--;
                this.loadVersion(this.currentElForVersions, this.currentVersionIndex);
            }
        };
        this.modalVersionsNextBtn.onclick = () => {
            if (!this.currentElForVersions) return;
            if (this.currentVersionIndex < this.currentElForVersions.versions.length) {
                this.currentVersionIndex++;
                this.loadVersion(this.currentElForVersions, this.currentVersionIndex);
            }
        };

        // Modal tab switching
        document.getElementById("tab-content").onclick = () => {
            this.activeEditTab = "content";
            document.getElementById("tab-content").classList.add("active");
            document.getElementById("tab-src").classList.remove("active");
            document.getElementById("editor-content").style.display = "block";
            document.getElementById("editor-src").style.display = "none";
        };
        document.getElementById("tab-src").onclick = () => {
            this.activeEditTab = "src";
            document.getElementById("tab-src").classList.add("active");
            document.getElementById("tab-content").classList.remove("active");
            document.getElementById("editor-src").style.display = "block";
            document.getElementById("editor-content").style.display = "none";
        };
    }

    switchMode(m) {
        this.mode = m;
        this.canvas.setAttribute("mode", this.mode);
        this.modeBtn.innerHTML = `<i class="fa-solid fa-${this.mode === 'direct' ? 'hand' : 'arrows-alt'}"></i> ${this.mode}`;
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

    renderElements() {
        console.log(`renderElements()`);
        const existingIds = new Set(Object.keys(this.elementNodesMap));
        const usedIds = new Set();

        this.canvasState.elements.forEach(el => {
            usedIds.add(el.id);
            let node = this.elementNodesMap[el.id];
            if (!node) {
                node = this.createElementNode(el);
                if (el.static) {
                    this.staticContainer.appendChild(node);
                } else {
                    this.container.appendChild(node);
                }
                this.elementNodesMap[el.id] = node;
            }
            const isSelected = (el.id === this.selectedElementId);
            try {
                this.updateElementNode(node, el, isSelected);
            } catch (err) {
                console.warn(`[WARN] Error updating node`, err, node, el)
            }
        });
        existingIds.forEach(id => {
            if (!usedIds.has(id)) {
                this.elementNodesMap[id].remove();
                delete this.elementNodesMap[id];
            }
        });
        // After elements are rendered/updated, update the edges
        this.renderEdges();
    }

    renderEdges() {
        // console.log("renderEdges()");

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

    updateElementNode(node, el, isSelected) {
        this.applyPositionStyles(node, el);
        node.setAttribute("type", el.type);
        node.classList.remove("selected");
        if (isSelected) {
            node.classList.add("selected");
        }
        this.setElementContent(node, el);
        // Remove old handles (if any)
        const oldHandles = Array.from(node.querySelectorAll('.element-handle'));
        oldHandles.forEach(h => h.remove());
        if (isSelected) {
            this.buildHandles(node, el);
        }
    }

    executeScriptElements(el, node) {
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
                const run = new Function('element', 'controller', 'node', code);
                run(el, this, node);
            }
            else {
                loadScript(scriptElement);
            }
        }
    }

    selectElement(id) {
        this.selectedElementId = id;
        this.renderElements();
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
            childCanvasState: (isCanvasContainer ? {
                canvasId: newId + "_child",
                elements: [],
                versionHistory: []
            } : null)
        };
        this.canvasState.elements.push(elObj);
        this.selectElement(newId);
        this.renderElements();
        this.saveCanvas();
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
    }

    onPointerDownCanvas(ev) {
        console.log('onPointerDownCanvas(ev)', ev);
        // Hide menus on pointer down
        this.hideContextMenu();
        // If tap is not on a canvas element, deselect
        if (!ev.target.closest(".canvas-element") && this.selectedElementId) {
            this.selectedElementId = null;
            this.renderElements();
        }
        this.initialTouches.push({ id: ev.pointerId, x: ev.clientX, y: ev.clientY });
        if (this.initialTouches.length === 1 && !this.activeGesture) {
            this.activeGesture = "pan";
            this.initialTranslateX = this.viewState.translateX;
            this.initialTranslateY = this.viewState.translateY;
            this.canvas.setPointerCapture(ev.pointerId);
            this.dragStartPos = { x: ev.clientX, y: ev.clientY };
        } else if (this.initialTouches.length === 2) {
            const t1 = this.initialTouches[0];
            const t2 = this.initialTouches[1];
            this.initialPinchDistance = Math.hypot(t2.x - t1.x, t2.y - t1.y);
            this.pinchCenterScreen = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
            this.pinchCenterCanvas = this.screenToCanvas(this.pinchCenterScreen.x, this.pinchCenterScreen.y);
            if (this.mode === 'direct' && this.selectedElementId) {
                this.activeGesture = "pinch-element";
                const el = this.findElementById(this.selectedElementId);
                if (el) {
                    this.elementPinchStartSize.width = el.width;
                    this.elementPinchStartSize.height = el.height;
                    this.elementPinchStartCenter = { x: el.x, y: el.y };
                    this.pinchCenterStartCanvas = { x: this.pinchCenterCanvas.x, y: this.pinchCenterCanvas.y };
                }
            } else {
                this.activeGesture = "pinch-canvas";
                this.initialCanvasScale = this.viewState.scale;
            }
        }
    }

    onPointerMoveCanvas(ev) {
        // console.log('onPointerMoveCanvas(ev)', ev)
        if (!this.activeGesture) return;
        if (this.activeGesture === 'pan' && this.initialTouches.length === 1) {
            const touch = this.initialTouches[0];
            if (touch.id === ev.pointerId) {
                const dx = ev.clientX - touch.x;
                const dy = ev.clientY - touch.y;
                this.viewState.translateX = this.initialTranslateX + dx;
                this.viewState.translateY = this.initialTranslateY + dy;
                this.updateCanvasTransform();
                this.saveLocalViewState();
            }
        } else if ((this.activeGesture === 'pinch-canvas' || this.activeGesture === 'pinch-element') && this.initialTouches.length === 2) {
            const tIndex = this.initialTouches.findIndex(t => t.id === ev.pointerId);
            if (tIndex !== -1) {
                this.initialTouches[tIndex].x = ev.clientX;
                this.initialTouches[tIndex].y = ev.clientY;
            }
            const [newT1, newT2] = this.initialTouches;
            const newDist = Math.hypot(newT2.x - newT1.x, newT2.y - newT1.y);
            if (this.initialPinchDistance === 0) return;
            const scaleFactor = newDist / this.initialPinchDistance;
            if (this.activeGesture === 'pinch-canvas') {
                const oldScale = this.viewState.scale;
                const newScale = Math.min(Math.max(this.initialCanvasScale * scaleFactor, this.MIN_SCALE), this.MAX_SCALE);
                const scaleDelta = newScale - oldScale;
                this.viewState.scale = newScale;
                this.viewState.translateX -= this.pinchCenterCanvas.x * scaleDelta;
                this.viewState.translateY -= this.pinchCenterCanvas.y * scaleDelta;
                this.updateCanvasTransform();
                this.saveLocalViewState();
            } else {
                const el = this.findElementById(this.selectedElementId);
                if (el && el.static !== true) {
                    const originalDx = this.elementPinchStartCenter.x - this.pinchCenterStartCanvas.x;
                    const originalDy = this.elementPinchStartCenter.y - this.pinchCenterStartCanvas.y;
                    const scaledDx = originalDx * scaleFactor;
                    const scaledDy = originalDy * scaleFactor;
                    el.x = this.pinchCenterStartCanvas.x + scaledDx;
                    el.y = this.pinchCenterStartCanvas.y + scaledDy;
                    el.width = this.elementPinchStartSize.width * scaleFactor;
                    el.height = this.elementPinchStartSize.height * scaleFactor;
                    this.renderElements();
                }
            }
        }
    }

    onPointerUpCanvas(ev) {
        console.log('onPointerUpCanvas(ev)', ev);
        if (ev.target.closest('.canvas-element')) return;
        if (this.activeGesture === "create-edge" || this.activeGesture === 'create-node') {
            console.log("[ DEBUG] Edge/node creation in progress exiting canvas pointer up handler");
            return;
        }
        this.onPointerUpDoubleTap(ev, 'canvas');
        this.activeGesture = null;
        // clear all touches on canvas up
        this.initialTouches = [];
        if (this.mode === 'direct') this.switchMode("navigate");
    }

    onPointerUpDoubleTap(ev, context, handler) {
        const now = Date.now();
        const tapX = ev.clientX;
        const tapY = ev.clientY;
        const lastTapTime = this[`lastTapTime-${context}`] || 0;
        const timeDiff = now - lastTapTime;
        const dist = Math.hypot(tapX - this.lastTapPosition.x, tapY - this.lastTapPosition.y);
        const DOUBLE_TAP_THRESHOLD = 300;
        const TAP_MOVE_TOLERANCE = 10;
        if (timeDiff < DOUBLE_TAP_THRESHOLD && dist < TAP_MOVE_TOLERANCE) {
            console.log("[DEBUG] Double tap detected");
            ev.preventDefault();
            ev.stopPropagation();
            if (handler && typeof handler === 'function') {
                handler(ev, context);
            } else if (ev.target.closest("text")) {
                const canvasPt = this.screenToCanvas(tapX, tapY);
                console.log("[DEBUG] Double tap on edge label. Canvas coordinates:", canvasPt);
                this.addMenuTapPosX = canvasPt.x;
                this.addMenuTapPosY = canvasPt.y;
                // TODO
            } else if (!ev.target.closest(".canvas-element")) {
                const canvasPt = this.screenToCanvas(tapX, tapY);
                console.log("[DEBUG] Double tap on canvas background. Canvas coordinates:", canvasPt);
                this.addMenuTapPosX = canvasPt.x;
                this.addMenuTapPosY = canvasPt.y;
                const c = prompt("Quick create markdown content?");
                if (c) {
                    this.createNewElement(canvasPt.x, canvasPt.y, "markdown", c);
                }
            } else {
                if (this.mode === 'navigate') {
                    this.switchMode("direct");
                } else {
                    const rect = this.canvas.getBoundingClientRect();
                    this.buildContextMenu(this.selectedElementId);
                    this.showContextMenu(ev.clientX - rect.left, ev.clientY - rect.top);
                }
            }
        }
        this[`lastTapTime-${context}`] = now;
        this.lastTapPosition = { x: tapX, y: tapY };
    }

    onWheelCanvas(ev) {
        if (ev.target.closest('.content')) {
            const content = ev.target.closest('.content');
            if (content.clientHeight !== content.scrollHeight) return;
        }
        const delta = -ev.deltaY;
        const zoomSpeed = 0.001;
        const prevScale = this.viewState.scale;
        const newScale = prevScale * (1 + delta * zoomSpeed);
        const scale = Math.min(Math.max(newScale, this.MIN_SCALE), this.MAX_SCALE);
        const scaleDelta = scale - prevScale;
        const zoomCenter = this.screenToCanvas(ev.clientX, ev.clientY);
        console.log("[DEBUG] Wheel event fired on canvas", { ev, scale, prevScale, zoomCenter });
        this.viewState.scale = scale;

        this.viewState.translateX -= zoomCenter.x * scaleDelta;
        this.viewState.translateY -= zoomCenter.y * scaleDelta;
        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    onPointerDownElement(ev) {
        if (this.mode === 'direct') this.initialTouches.push({ id: ev.pointerId, x: ev.clientX, y: ev.clientY });

        console.log("onPointerDownElement(ev)", ev.target);
        const target = ev.target;
        const targetEl = target.closest(".canvas-element");
        if (!targetEl) return;

        const isHandle = target.classList.contains("resize-handle") ||
            target.classList.contains("rotate-handle") ||
            target.classList.contains("reorder-handle") ||
            target.classList.contains("scale-handle") ||
            target.classList.contains("type-handle") ||
            target.classList.contains("edge-handle");
        if (isHandle) return;
        const elementId = targetEl.dataset.elId;
        if (this.selectedElementId !== elementId) {
            this.selectElement(elementId);
        }
        this.dragStartPos = { x: ev.clientX, y: ev.clientY };
        const el = this.findElementById(elementId);
        this.elementStartPos = { x: el.x, y: el.y };
        if (this.mode !== 'direct') return;
        this.activeGesture = "move-element";

        ev.stopPropagation();
    }

    onPointerMoveElement(ev) {
        // console.log("onPointerMoveElement(ev)", ev.target)
        if (!this.activeGesture) return;
        if (this.activeGesture === "move-element") {
            ev.stopPropagation();
            const el = this.findElementById(this.selectedElementId);
            if (!el || el.static === true) return;
            const dx = ev.clientX - this.dragStartPos.x;
            const dy = ev.clientY - this.dragStartPos.y;
            el.x = this.elementStartPos.x + (dx / this.viewState.scale);
            el.y = this.elementStartPos.y + (dy / this.viewState.scale);
            this.updateElementNode(this.elementNodesMap[el.id], el, true);
        }
        else if (this.activeGesture === "resize-element") {
            ev.stopPropagation();
            const el = this.findElementById(this.selectedElementId);
            if (!el || el.static === true) return;
            const dx = (ev.clientX - this.dragStartPos.x) / this.viewState.scale;
            const dy = (ev.clientY - this.dragStartPos.y) / this.viewState.scale;
            el.width = Math.max(20, this.elementStartSize.width + dx);
            el.height = Math.max(20, this.elementStartSize.height + dy);
            this.updateElementNode(this.elementNodesMap[el.id], el, true);
        }
        else if (this.activeGesture === "scale-element") {
            ev.stopPropagation();
            const el = this.findElementById(this.selectedElementId);
            if (!el) return;
            const sensitivity = 0.5;
            const dx = (ev.clientX - this.dragStartPos.x) / this.viewState.scale * sensitivity;
            const dy = (ev.clientY - this.dragStartPos.y) / this.viewState.scale * sensitivity;
            el.scale = Math.max((dx + dy) / 2, 0.2);
            this.updateElementNode(this.elementNodesMap[el.id], el, true);
        }
        else if (this.activeGesture === "reorder-element") {
            ev.stopPropagation();
            const el = this.findElementById(this.selectedElementId);
            if (!el) return;
            const dx = (ev.clientX - this.dragStartPos.x) / this.viewState.scale;
            const dy = (ev.clientY - this.dragStartPos.y) / this.viewState.scale;
            const lineLength = Math.sqrt(dx * dx + dy * dy);
            const scalingFactor = 0.1;
            el.zIndex = lineLength * scalingFactor;
            this.updateElementNode(this.elementNodesMap[el.id], el, true);
        }
        else if (this.activeGesture === "rotate-element") {
            ev.stopPropagation();
            const el = this.findElementById(this.selectedElementId);
            if (!el) return;
            const canvasPt = this.screenToCanvas(ev.clientX, ev.clientY);
            const startCanvasPt = this.screenToCanvas(this.dragStartPos.x, this.dragStartPos.y);
            const v1x = startCanvasPt.x - this.centerForRotation.x;
            const v1y = startCanvasPt.y - this.centerForRotation.y;
            const v2x = canvasPt.x - this.centerForRotation.x;
            const v2y = canvasPt.y - this.centerForRotation.y;
            const a1 = Math.atan2(v1y, v1x);
            const a2 = Math.atan2(v2y, v2x);
            const da = a2 - a1;
            const deg = da * (180 / Math.PI);
            el.rotation = this.elementStartRotation + deg;
            this.updateElementNode(this.elementNodesMap[el.id], el, true);
        }
    }

    onPointerUpElement(ev) {
        console.log("onPointerUpElement(ev)", ev.target);
        if (this.activeGesture === "create-edge" || this.activeGesture === 'create-node') {
            console.log("edge/node creation in progress exiting element pointer up handler");
            return;
        }
        this.onPointerUpDoubleTap(ev, 'element');
        if ([
            "move-element", "resize-element", "rotate-element",
            "reorder-element", "scale-element"
        ].includes(this.activeGesture)) {
            ev.stopPropagation();
            this.saveCanvas();
        }
        // --- NEW: clean up this pointer from tracking ---
        this.removeActivePointer(ev.pointerId);
        this.activeGesture = null;
    }

    onPointerUpEdges(ev) {
        console.log("onPointerUpEdges(ev)", ev.target);
        const id = ev.target.dataset.id;
        if (id) {
            this.onPointerUpDoubleTap(ev, "edge", (ev) => {
                console.log(`[DEBUG] Double click on edge (label?)`, ev.target);
                this.selectedElementId = id;
                const edge = this.findEdgeElementById(ev.target.dataset.id);
                const canvasPt = this.screenToCanvas(ev.clientX, ev.clientY);
                const elId = this.createNewElement(canvasPt.x, canvasPt.y, "edit-prompt", edge.label || "", false, {
                    target: edge.id,
                    property: "label",
                });
                this.switchMode('direct');
                this.createNewEdge(elId, edge.id, "Editing...", { meta: true });
            });
        }
        // --- NEW: remove this pointer from tracking ---
        this.removeActivePointer(ev.pointerId);
    }

    rotateHandlePointerDown(ev) {
        ev.stopPropagation();
        if (this.mode !== 'direct') return;
        const el = this.findElementById(this.selectedElementId);
        if (!el) return;
        this.activeGesture = "rotate-element";
        this.container.setPointerCapture(ev.pointerId);
        this.elementStartRotation = el.rotation;
        this.centerForRotation = {
            x: el.x + el.width / 2,
            y: el.y + el.height / 2
        };
        this.dragStartPos = { x: ev.clientX, y: ev.clientY };
    }

    resizeHandlePointerDown(ev) {
        ev.stopPropagation();
        if (this.mode !== 'direct') return;
        const el = this.findElementById(this.selectedElementId);
        if (!el || el.static === true) return;
        this.activeGesture = "resize-element";
        this.container.setPointerCapture(ev.pointerId);
        this.dragStartPos = { x: ev.clientX, y: ev.clientY };
        this.elementStartSize = { width: el.width, height: el.height };
        this.elementStartPos = { x: el.x, y: el.y };
    }

    scaleHandlePointerDown(ev) {
        ev.stopPropagation();
        if (this.mode !== 'direct') return;
        const el = this.findElementById(this.selectedElementId);
        if (!el) return;
        this.activeGesture = "scale-element";
        this.container.setPointerCapture(ev.pointerId);
        this.dragStartPos = { x: ev.clientX, y: ev.clientY };
        this.elementStartSize = { width: el.width, height: el.height };
        this.elementStartPos = { x: el.x, y: el.y };
    }

    reorderHandlePointerDown(ev) {
        ev.stopPropagation();
        if (this.mode !== 'direct') return;
        const el = this.findElementById(this.selectedElementId);
        if (!el) return;
        this.activeGesture = "reorder-element";
        this.container.setPointerCapture(ev.pointerId);
        this.dragStartPos = { x: ev.clientX, y: ev.clientY };
        this.elementStartSize = { width: el.width, height: el.height };
        this.elementStartPos = { x: el.x, y: el.y };
    }

    typeHandlePointerDown(ev) {
        ev.stopPropagation();
        if (this.mode !== 'direct') return;
        if (!this.selectedElementId) return;
        const rect = this.canvas.getBoundingClientRect();
        this.buildContextMenu(this.selectedElementId);
        this.showContextMenu(ev.clientX - rect.left, ev.clientY - rect.top);
    }

    edgeHandlePointerDown(ev, type) {
        ev.stopPropagation();
        if (this.mode !== 'direct') return;
        if (!this.selectedElementId) return;
        console.log("starting edge creation...");
        // Start the edge creation gesture.
        this.activeGesture = type;
        this.activeEdgeCreation = { sourceId: this.selectedElementId, tempLine: null };
        const sourceEl = this.findElementById(this.activeEdgeCreation.sourceId);
        if (sourceEl) {
            // Create a temporary dashed line element.
            const tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
            tempLine.setAttribute("stroke", type === 'create-edge' ? 'blue' : 'green');
            tempLine.setAttribute("stroke-width", "4");
            tempLine.setAttribute("stroke-dasharray", "5,5");
            tempLine.setAttribute("x1", sourceEl.x);
            tempLine.setAttribute("y1", sourceEl.y);
            tempLine.setAttribute("x2", sourceEl.x);
            tempLine.setAttribute("y2", sourceEl.y);
            this.activeEdgeCreation.tempLine = tempLine;
            this.edgesLayer.appendChild(tempLine);
        }
        // Add global pointermove and pointerup listeners for the edge gesture.
        document.addEventListener("pointermove", this.edgePointerMoveHandler = (ev) => this.onEdgePointerMove(ev, type));
        document.addEventListener("pointerup", this.edgePointerUpHandler = (ev) => this.onEdgePointerUp(ev, type));
    }

    onEdgePointerMove(ev, type) {
        console.log("onEdgePointerMove(ev)");
        if (this.activeGesture !== type || !this.activeEdgeCreation) return;
        const pt = this.screenToCanvas(ev.clientX, ev.clientY);
        this.activeEdgeCreation.tempLine.setAttribute("x2", pt.x);
        this.activeEdgeCreation.tempLine.setAttribute("y2", pt.y);
    }

    async onEdgePointerUp(ev, type) {
        console.log("onEdgePointerUp(ev)", this.activeGesture, this.activeEdgeCreation);
        if (this.activeGesture !== type || !this.activeEdgeCreation) return;
        let targetEl, targetElement, targetId;
        if (type === 'create-edge') {
            targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
            targetElement = targetEl && targetEl.closest(".canvas-element");
        }
        console.log("targetEl", targetEl, targetElement);
        if (targetElement) {
            const targetId = targetElement.dataset.elId;
            if (targetId && targetId !== this.activeEdgeCreation.sourceId) {
                this.createNewEdge(this.activeEdgeCreation.sourceId, targetId, "");
            } else {
                console.warn("Invalid target element or self-reference");
            }
        } else {
            console.warn("No target element found");
        }
        if (this.activeEdgeCreation.tempLine) {
            this.activeEdgeCreation.tempLine.remove();
        }

        if (type === 'create-node') {
            const canvasPt = this.screenToCanvas(ev.clientX, ev.clientY);
            const textPrompt = prompt("Enter text for the new element:", "");
            if (textPrompt) {
                const elId = this.createNewElement(canvasPt.x, canvasPt.y, "markdown", "generating...", false);
                const el = this.findElementById(elId);
                const edge = this.createNewEdge(this.activeEdgeCreation.sourceId, elId, textPrompt);
                this.activeEdgeCreation = null;
                const resp = await this.generateContent(textPrompt, el);
                el.content = resp;
                console.log({ el, edge, resp, textPrompt });
                this.updateElementNode(this.elementNodesMap[el.id], el, true);
            }
        }

        this.activeEdgeCreation = null;
        this.activeGesture = null;

        document.removeEventListener("pointermove", this.edgePointerMoveHandler);
        document.removeEventListener("pointerup", this.edgePointerUpHandler);
        this.renderElements();
        this.saveCanvas();
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
                this.regenerateImage(el);
            }
            i.src = el.src || `https://placehold.co/${Math.round(el.width)}x${Math.round(el.height)}?text=${encodeURIComponent(el.content)}&font=lora`;

            node.appendChild(i);
        } else if (el.type === "canvas-container") {
            const containerDiv = document.createElement('div');
            containerDiv.classList.add('content');
            containerDiv.style.position = 'relative';
            containerDiv.innerHTML = `<div style='font-size:0.8em; color:#555;'>Ref: ${el.refCanvasId || "none"}</div>`;

            const drillInBtn = document.createElement('button');
            drillInBtn.textContent = "Drill In";
            drillInBtn.style.position = "absolute";
            drillInBtn.style.bottom = "5px";
            drillInBtn.style.right = "5px";
            drillInBtn.style.zIndex = "10";
            drillInBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (!el.refCanvasId) return alert("No canvas reference found.");
                const canvasState = await loadInitialCanvas({
                    canvasId: el.refCanvasId,
                    elements: [],
                    edges: [],
                    versionHistory: [],
                    parentCanvas: this.canvasState.canvasId,
                });
                const childController = new CanvasController(canvasState, this);
                updateCanvasController(childController);
                window.history.pushState({}, "", "?canvas=" + el.refCanvasId);
            };
            containerDiv.appendChild(drillInBtn);
            node.appendChild(containerDiv);
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
                this.renderElements();
                this.saveCanvas();
            };

            saveBtn.onclick = () => {
                const val = node.editor.getValue();
                const target = this.findElementOrEdgeById(el.target);
                if (target) {
                    console.log(`[DEBUG] Saving edit prompt content to [${target.id}] as property [${el.property}]. with value: "${val}"`, target, el);
                    if (target) {
                        target[el.property] = val;
                        this.renderEdges();
                        this.saveCanvas();
                    }
                }
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== el.id);
                this.renderElements();
            };
            cancelBtn.onclick = () => {
                this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== el.id);
                this.renderElements();
                this.saveCanvas();
            };
        }
        const c = node.querySelector('.content');
        if (c.clientHeight < c.scrollHeight) {
            c.classList.add('scroller');
        } else {
            c.classList.remove('scroller');
        }
    }

    buildHandles(node, el) {
        const corners = [
            { className: "type-handle element-handle", icon: "fa-solid fa-font", handler: (ev) => this.typeHandlePointerDown(ev) },
            { className: "scale-handle element-handle top-right", icon: "fa-solid fa-up-down-left-right", handler: (ev) => this.scaleHandlePointerDown(ev) },
            { className: "reorder-handle bottom-left element-handle", icon: "fa-solid fa-layer-group", handler: (ev) => this.reorderHandlePointerDown(ev) },
            { className: "resize-handle bottom-right element-handle", icon: "fa-solid fa-up-right-and-down-left-from-center", handler: (ev) => this.resizeHandlePointerDown(ev) }
        ];
        corners.forEach(corner => {
            const h = document.createElement("div");
            h.className = corner.className;
            const i = document.createElement("i");
            i.className = corner.icon;
            h.appendChild(i);
            h.addEventListener("pointerdown", corner.handler);
            node.appendChild(h);
        });
        // Add rotate handle
        const rotateHandle = document.createElement("div");
        rotateHandle.className = "rotate-handle rotate-handle-position element-handle";
        const rotateIcon = document.createElement("i");
        rotateIcon.className = "fa-solid fa-rotate";
        rotateHandle.appendChild(rotateIcon);
        rotateHandle.addEventListener("pointerdown", (ev) => this.rotateHandlePointerDown(ev));
        node.appendChild(rotateHandle);

        // Add an edge handle for connecting elements.
        const edgeHandle = document.createElement("div");
        edgeHandle.className = "edge-handle element-handle";
        const edgeIcon = document.createElement("i");
        edgeIcon.className = "fa-solid fa-link";
        edgeHandle.appendChild(edgeIcon);
        edgeHandle.addEventListener("pointerdown", (ev) => this.edgeHandlePointerDown(ev, 'create-edge'));
        node.appendChild(edgeHandle);

        // Add an new node handle for creating linked element.
        const createHandle = document.createElement("div");
        createHandle.className = "create-handle element-handle";
        const createIcon = document.createElement("i");
        createIcon.className = "fa-solid fa-plus";
        createHandle.appendChild(createIcon);
        createHandle.addEventListener("pointerdown", (ev) => this.edgeHandlePointerDown(ev, 'create-node'));
        node.appendChild(createHandle);
    }

    applyPositionStyles(node, el) {
        const scale = el.scale || 1;
        const rotation = el.rotation || 0;
        const zIndex = Math.floor(el.zIndex) || 1;
        const blendMode = el.blendMode || 'normal';
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
        this.renderEdges();
    }

    computeIntersection(el, otherEl) {
        // Our elements' x and y represent the center coordinates.
        const cx = el.x;
        const cy = el.y;
        // IMPORTANT: Factor in the element's scale to compute its visible dimensions.
        const scaleFactor = el.scale || 1;
        const w = (el.width || 10) * scaleFactor;
        const h = (el.height || 10) * scaleFactor;

        // Compute the vector from el's center toward the other element.
        let dx = otherEl.x - cx;
        let dy = otherEl.y - cy;

        // If the centers coincide, return the center.
        if (dx === 0 && dy === 0) {
            return { x: cx, y: cy };
        }

        const halfW = w / 2;
        const halfH = h / 2;

        // Compute scale factors for hitting the vertical and horizontal borders.
        let scaleX = Infinity, scaleY = Infinity;
        if (dx !== 0) {
            scaleX = halfW / Math.abs(dx);
        }
        if (dy !== 0) {
            scaleY = halfH / Math.abs(dy);
        }

        // The proper scale is the smaller one, ensuring we hit the closest border.
        const scale = Math.min(scaleX, scaleY);

        // The intersection point is computed by scaling the direction vector.
        const ix = cx + dx * scale;
        const iy = cy + dy * scale;
        return { x: ix, y: iy };
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

    async regenerateImage(el) {
        try {
            const response = await fetch("https://c15r-replicate_base.web.val.run/generate", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${this.getAuthToken()}`
                },
                body: JSON.stringify({
                    prompt: el.content,
                    width: el.width,
                    height: el.height,
                })
            });
            const newImg = await response.json();
            el.src = newImg.imageUrl;
            this.saveCanvasLocalOnly();
            this.renderElements();
        } catch (err) {
            console.error("Failed to regenerate image", err);
        }
    }

    openEditModal(el) {
        this.editModal.style.display = "block";
        this.currentElForVersions = el;
        el.versions = el.versions || [];
        this.currentVersionIndex = el.versions.length;
        if (!this.codeMirrorContent) {
            this.codeMirrorContent = CodeMirror(this.editorContentContainer, {
                value: "",
                lineNumbers: true,
                mode: this.getCodeMirrorMode(el.type),
                theme: "default",
                lineWrapping: true
            });
        } else {
            this.codeMirrorContent.setOption('mode', this.getCodeMirrorMode(el.type));
        }
        if (!this.codeMirrorSrc) {
            this.codeMirrorSrc = CodeMirror(this.editorSrcContainer, {
                value: "",
                lineNumbers: true,
                mode: "text",
                theme: "default",
                lineWrapping: true
            });
        }
        if (el.type === "img" && el.src) {
            this.activeEditTab = "src";
            document.getElementById("tab-src").classList.add("active");
            document.getElementById("tab-content").classList.remove("active");
            document.getElementById("editor-src").style.display = "block";
            document.getElementById("editor-content").style.display = "none";
        } else {
            this.activeEditTab = "content";
            document.getElementById("tab-content").classList.add("active");
            document.getElementById("tab-src").classList.remove("active");
            document.getElementById("editor-content").style.display = "block";
            document.getElementById("editor-src").style.display = "none";
        }
        this.loadVersion(el, this.currentVersionIndex);
    }

    loadVersion(el, index) {
        if (!el.versions) return;
        if (index < el.versions.length) {
            const older = el.versions[index];
            this.codeMirrorContent.setValue(older.content);
        } else {
            this.codeMirrorContent.setValue(el.content || "");
        }
        this.currentVersionIndex = index;
        this.renderVersionInfo(el);
    }

    renderVersionInfo(el) {
        const total = el.versions.length + 1;
        const shown = this.currentVersionIndex + 1;
        if (this.currentVersionIndex < el.versions.length) {
            this.modalVersionsInfo.textContent = `Viewing Older Version ${shown} of ${total}`;
        } else {
            this.modalVersionsInfo.textContent = `Viewing Current Version ${shown} of ${total}`;
        }
    }

    clearModalError() {
        this.modalError.textContent = "";
    }

    showModalError(msg) {
        this.modalError.textContent = msg;
    }

    getCodeMirrorMode(type) {
        switch (type) {
            case 'html': return 'htmlmixed';
            case 'markdown': return 'markdown';
            case 'text': return 'javascript';
            default: return 'javascript';
        }
    }

    async generateContent(content, el) {
        const { type, id } = el;
        const edges = this.findEdgesByElementId(id).filter(e => e.target === id).map(e => ({ label: e.label, el: this.findElementById(e.source) }));
        console.log("Relevant edges", edges);
        const token = this.getAuthToken();
        if (!token || token === 'TBC') return await this.generateContentOld(content, type);
        try {
            const response = await fetch('https://c15r--2ac72f16e02411efa75ee6cdfca9ef9f.web.val.run', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    model: "claude-3-5-sonnet-20241022",
                    max_tokens: 4096,
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: `You will be given an element which is rendered into visual canvas. Either follow the user request or improve the provided content. The element content type should be <type>${type}</type>.

Please provide your response in two parts:
1. Your thought process about how to handle this request
2. The actual result/content

Here is the user request or content to process:

<related-context>
${edges.map(e => `<relation><label>${e.label || "undefined"}</label><content>${e.el.content}</content>`).join("\n")}
<related-context>

<current-content>
${content}
</current-content>

Respond only with valid json (do not wrap in code block) following the ApiResponse schema:

<schema>
interface ApiResponse {
  thoughts: string;
  result: string;
}
<schema>
`
                                }
                            ]
                        }
                    ]
                }),
            });
            console.log("response.ok", response.ok);
            const data = await response.text();
            console.log("AI response:", data);
            try {
                const resp = JSON.parse(data);
                return resp.result;
            } catch (e) {
                console.error("Failed to parse json response", e);
                return null;
            }
        } catch (error) {
            console.error('Error fetching AI response:', error);
            return null;
        }
    }

    async generateContentOld(content, type) {
        try {
            const response = await fetch('/api/ai_completion', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    instructions: `You will be given an element which is rendered into a visual canvas. 
Either follow the user request or improve the provided content. 
The element content type should be <content-type>${type}</content-type>.

Response should be valid JSON conforming to response schema:

<schema>
interface Response {
  thinking: string;
  result: string;
}
</schema>

<user_request_or_content>
${content}
</user_request_or_content>`
                }),
            });
            const data = await response.json();
            return data.result;
        } catch (error) {
            console.error('Error fetching AI response (old fallback):', error);
            return null;
        }
    }

    serializeCanvas() {
        return JSON.stringify(this.canvasState);
    }

    async saveCanvas() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this._saveCanvas();
        }, this.debounceSaveDelay);
    }

    async _saveCanvas() {
        this.saveCanvasLocalOnly();
        const token = this.getAuthToken();
        if (!token) {
            console.warn("No auth token found, skipping API save");
            return;
        }
        const canvasId = this.canvasState.canvasId;
        const namespace = "websim";
        try {
            const response = await fetch(`https://c15r-parcland_backpack.web.val.run/${namespace}/${canvasId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: this.serializeCanvas()
            });
            const result = await response.json();
            console.log(`Canvas ${canvasId} saved to API`, result);
        } catch (error) {
            console.error(`Error saving canvas ${canvasId} to API:`, error);
        }
    }

    async setBackpackItem(key, val) {
        const token = this.getAuthToken();
        if (!token) {
            console.warn("No auth token found, skipping API save");
            return;
        }
        try {
            const response = await fetch(`https://c15r-parcland_backpack.web.val.run/websim/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: val,
            });
            const result = await response.json();
            console.log(`Backpack item ${key} saved to API`, result);
        } catch (error) {
            console.error(`Error saving backpack item ${key} to API:`, error);
        }
    }

    saveCanvasLocalOnly() {
        localStorage.setItem("myCanvasData_" + this.canvasState.canvasId, this.serializeCanvas());
    }

    getAuthToken() {
        const key = this.tokenKey;
        let token = localStorage.getItem(key);
        if (!token) {
            localStorage.setItem(key, "TBC");
            token = "TBC";
        }
        return token;
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
    updateCanvasController( new CanvasController(rootCanvasState, null) );
})();

async function loadInitialCanvas(defaultState, paramToken) {
    const tokenKey = "PARC.LAND/BKPK_TOKEN";
    let token = paramToken || localStorage.getItem(tokenKey);
    if (!token) {
        token = "TBC";
    }
    localStorage.setItem(tokenKey, token);
    const savedLocal = localStorage.getItem("myCanvasData_" + defaultState.canvasId);
    try {
        const namespace = "websim";
        const response = await fetch(`https://c15r-parcland_backpack.web.val.run/${namespace}/${defaultState.canvasId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        } else {
            console.warn("Failed to load from API, fallback local");
            if (savedLocal) {
                return JSON.parse(savedLocal);
            } else {
                return defaultState;
            }
        }
    } catch (error) {
        console.error("Error loading from API", error);
        if (savedLocal) {
            return JSON.parse(savedLocal);
        } else {
            return defaultState;
        }
    }
}
