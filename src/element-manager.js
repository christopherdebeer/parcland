// element-manager.js
class ElementManager {
    constructor(stateManager, domElements, dependencies = {}) {
        this.state = stateManager;
        this.container = domElements.container;
        this.staticContainer = domElements.staticContainer;
        this.edgeManager = dependencies.edgeManager;
        this.viewManager = dependencies.viewManager;

        // Subscribe to relevant state changes
        this.stateSubscriptions = [
            this.state.subscribe('element-updated', (data) => {
                this.updateElementNodeById(data.id, data.element);
            }),
            this.state.subscribe('selection-changed', (elementId) => {
                this.refreshAllElements();
            })
        ];
    }

    /**
     * Create a new DOM node for an element
     */
    createElementNode(el) {
        const node = document.createElement("div");
        node.classList.add("canvas-element");
        node.dataset.elId = el.id;
        return node;
    }

    /**
     * Update an element's DOM node
     */
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

        // Add handles if selected
        if (isSelected) {
            this.buildHandles(node, el);
        }
    }

    /**
     * Update an element by ID
     */
    updateElementNodeById(id, el) {
        const node = this.state.elementNodesMap[id];
        if (node) {
            const isSelected = (id === this.state.selectedElementId);
            this.updateElementNode(node, el, isSelected);
        }
    }

    /**
     * Set the content of an element based on its type
     */
    setElementContent(node, el) {
        const currentType = node.dataset.type || "";
        const currentContent = node.dataset.content || "";
        const currentSrc = node.dataset.src || "";
        const desiredSrc = el.src || "";

        // Skip if nothing has changed
        if (
            currentType === el.type &&
            currentContent === el.content &&
            currentSrc === desiredSrc
        ) {
            return;
        }

        console.log("Setting element content", el.id, el.type);
        node.dataset.type = el.type;
        node.dataset.content = el.content;
        node.dataset.src = desiredSrc;
        node.innerHTML = "";

        // Render based on type
        if (el.type === "text") {
            this.renderTextElement(node, el);
        } else if (el.type === "html") {
            this.renderHtmlElement(node, el);
        } else if (el.type === "markdown") {
            this.renderMarkdownElement(node, el);
        } else if (el.type === "img") {
            this.renderImageElement(node, el);
        } else if (el.type === "canvas-container") {
            this.renderCanvasContainerElement(node, el);
        } else if (el.type === "edit-prompt") {
            this.renderEditPromptElement(node, el);
        }

        // Add scroller class if content overflows
        const content = node.querySelector('.content');
        if (content) {
            if (content.clientHeight < content.scrollHeight) {
                content.classList.add('scroller');
            } else {
                content.classList.remove('scroller');
            }
        }
    }

    /**
     * Render a text element
     */
    renderTextElement(node, el) {
        const t = document.createElement('p');
        t.classList.add('content');
        t.textContent = el.content;
        t.style.color = el.color || "#000000";
        node.appendChild(t);
    }

    /**
     * Render an HTML element
     */
    renderHtmlElement(node, el) {
        const t = document.createElement('div');
        t.classList.add('content');
        t.innerHTML = el.content;
        node.appendChild(t);
        this.executeScriptElements(el, t);
    }

    /**
     * Render a markdown element
     */
    renderMarkdownElement(node, el) {
        const t = document.createElement('div');
        t.classList.add('content');
        t.innerHTML = marked.parse(el.content);
        t.style.color = el.color || "#000000";
        node.appendChild(t);
    }

    /**
     * Render an image element
     */
    renderImageElement(node, el) {
        const i = document.createElement("img");
        i.classList.add("content");
        i.dataset.image_id = el.imgId || "";
        i.title = el.content;
        i.onerror = (err) => {
            console.warn("Image failed to load", err);
        };

        if (!el.src && !i.src) {
            this.requestImageRegeneration(el);
        }
        i.src = el.src || `https://placehold.co/${Math.round(el.width)}x${Math.round(el.height)}?text=${encodeURIComponent(el.content)}&font=lora`;

        node.appendChild(i);
    }

    /**
     * Render a canvas container element
     */
    renderCanvasContainerElement(node, el) {
        const containerDiv = document.createElement('div');
        containerDiv.classList.add('content');
        containerDiv.classList.add('child-canvas-container');
        containerDiv.style.position = 'relative';
        containerDiv.style.display = 'flex';
        containerDiv.style.flexDirection = 'column';
        containerDiv.style.alignItems = 'center';
        containerDiv.style.justifyContent = 'center';
        containerDiv.style.width = '100%';
        containerDiv.style.height = '100%';
        containerDiv.style.border = '2px dashed #aaa';
        containerDiv.style.borderRadius = '8px';
        containerDiv.style.backgroundColor = 'rgba(240, 240, 240, 0.5)';
        containerDiv.style.backdropFilter = 'blur(2px)';

        // Create preview container
        const previewContainer = document.createElement('div');
        previewContainer.style.flex = '1';
        previewContainer.style.width = '100%';
        previewContainer.style.position = 'relative';
        previewContainer.style.overflow = 'hidden';

        // Show preview of child canvas content
        if (el.childCanvasState && el.childCanvasState.elements && el.childCanvasState.elements.length > 0) {
            const elementCount = el.childCanvasState.elements.length;
            const edgeCount = (el.childCanvasState.edges || []).length;
            previewContainer.innerHTML = `
                <div style='font-size:0.9em; color: #666; text-align: center; padding: 10px;'>
                    <i class="fa-solid fa-diagram-project"></i>
                    <div>Child Canvas</div>
                    <div style='font-size:0.8em; color: #888;'>
                        ${elementCount} element${elementCount !== 1 ? 's' : ''},
                        ${edgeCount} edge${edgeCount !== 1 ? 's' : ''}
                    </div>
                </div>
            `;
        } else {
            previewContainer.innerHTML = `
                <div style='font-size:0.9em; color: #888; text-align: center; padding: 10px;'>
                    <i class="fa-solid fa-square-plus"></i>
                    <div>Empty Child Canvas</div>
                    <div style='font-size:0.8em;'>Click to add content</div>
                </div>
            `;
        }

        // Add drill-in button
        const drillInBtn = document.createElement('button');
        drillInBtn.className = 'drill-in-button';
        drillInBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i> Drill In';
        drillInBtn.onclick = (ev) => {
            ev.stopPropagation();
            const childState = el.childCanvasState || {
                canvasId: el.id + "_child",
                elements: [], edges: []
            };
            this.state.requestDrillIn(childState);
        };

        containerDiv.appendChild(drillInBtn);
        node.appendChild(containerDiv);
    }

    /**
     * Render an edit prompt element
     */
    renderEditPromptElement(node, el) {
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

        // Add Save and Cancel buttons beneath the editor
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
            this.handleEditPromptDelete(el);
        };

        saveBtn.onclick = () => {
            this.handleEditPromptSave(node, el);
        };

        cancelBtn.onclick = () => {
            this.handleEditPromptCancel(el);
        };
    }

    /**
     * Handle deletion from edit prompt
     */
    handleEditPromptDelete(el) {
        const target = this.state.findElementOrEdgeById(el.target);
        this.state.removeElementById(target?.id);
        this.state.removeEdgeById(target?.id);
        this.state.removeElementById(el.id);

        this.refreshAllElements();
        this.state.saveCanvas();
    }

    /**
     * Handle saving from edit prompt
     */
    handleEditPromptSave(node, el) {
        const val = node.editor.getValue();
        const target = this.state.findElementOrEdgeById(el.target);

        if (target) {
            console.log(`[DEBUG] Saving edit prompt content to [${target.id}] as property [${el.property}]. with value: "${val}"`, target, el);
            if (target) {
                target[el.property] = val;
                if (this.edgeManager) {
                    this.edgeManager.renderEdges();
                }
                this.state.saveCanvas();
            }
        }

        this.state.removeElementById(el.id);
        this.refreshAllElements();
    }

    /**
     * Handle cancellation from edit prompt
     */
    handleEditPromptCancel(el) {
        this.state.removeElementById(el.id);
        this.refreshAllElements();
        this.state.saveCanvas();
    }

    /**
     * Execute script elements within HTML content
     */
    executeScriptElements(el, node) {
        const scriptElements = Array.from(node.querySelectorAll('script'));
        const loadScript = (script) => {
            console.log("Loading script", script);
            return new Promise((resolve, reject) => {
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Failed to load script: ${script.src}`));
                document.head.appendChild(script);
            });
        };

        for (const scriptElement of scriptElements) {
            console.log("Encountered script", scriptElement);
            if (scriptElement.type !== 'module' && !scriptElement.getAttribute('src') && scriptElement.textContent && scriptElement.textContent.trim()) {
                const code = scriptElement.textContent;
                const run = new Function('element', 'controller', 'node', code);
                run(el, this.state.getController(), node);
            } else {
                loadScript(scriptElement);
            }
        }
    }

    /**
     * Apply position styles to an element
     */
    applyPositionStyles(node, el) {
        const scale = el.scale || 1;
        const rotation = el.rotation || 0;
        const zIndex = Math.floor(el.zIndex) || 1;
        const blendMode = el.blendMode || 'normal';

        if (el.static) {
            node.style.position = 'fixed';
            node.style.left = (el.fixedLeft || 0) + '%';
            node.style.top = (el.fixedTop || 0) + '%';
            node.style.width = (el.width * scale) + "px";
            node.style.height = (el.height * scale) + "px";
            node.style.setProperty('--scale', zIndex);
            node.style.setProperty('--scale', scale);
            node.style.setProperty('--width', (el.width * scale) + "px");
            node.style.setProperty('--height', (el.height * scale) + "px");
            node.style.setProperty('--blend-mode', blendMode);
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        } else {
            node.style.position = 'absolute';
            node.style.left = (el.x - (el.width * scale) / 2) + "px";
            node.style.top = (el.y - (el.height * scale) / 2) + "px";
            node.style.width = (el.width * scale) + "px";
            node.style.height = (el.height * scale) + "px";
            node.style.setProperty('--scale', zIndex);
            node.style.setProperty('--scale', scale);
            node.style.setProperty('--width', (el.width * scale) + "px");
            node.style.setProperty('--height', (el.height * scale) + "px");
            node.style.setProperty('--blend-mode', blendMode);
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        }

        // Notify edge manager to update any connected edges
        if (this.edgeManager) {
            const edges = this.state.findEdgesByElementId(el.id) || [];
            if (edges.length > 0) {
                this.edgeManager.renderEdges();
            }
        }
    }

    /**
     * Build manipulation handles for a selected element
     */
    buildHandles(node, el) {
        const corners = [
            { className: "type-handle element-handle", icon: "fa-solid fa-font", handler: (ev) => this.typeHandlePointerDown(ev) },
            { className: "scale-handle element-handle top-right", icon: "fa-solid fa-up-down-left-right", handler: (ev) => this.scaleHandlePointerDown(ev) },
            { className: "reorder-handle bottom-left element-handle", icon: "fa-solid fa-layer-group", handler: (ev) => this.reorderHandlePointerDown(ev) },
            { className: "resize-handle bottom-right element-handle", icon: "fa-solid fa-up-right-and-down-left-from-center", handler: (ev) => this.resizeHandlePointerDown(ev) }
        ];

        corners.forEach(c => {
            const h = document.createElement("div");
            h.className = c.className;
            const i = document.createElement("i");
            i.className = c.icon;
            h.appendChild(i);
            h.addEventListener("pointerdown", c.handler.bind(this));
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

        // Add an edge handle for connecting elements
        const edgeHandle = document.createElement("div");
        edgeHandle.className = "edge-handle element-handle";
        const edgeIcon = document.createElement("i");
        edgeIcon.className = "fa-solid fa-link";
        edgeHandle.appendChild(edgeIcon);
        edgeHandle.addEventListener("pointerdown", (ev) => this.edgeHandlePointerDown(ev));
        node.appendChild(edgeHandle);
    }

    /**
     * Render all elements in the canvas state
     */
    renderElements() {
        console.log(`renderElements()`);
        const { elementNodesMap } = this.state;
        const existingIds = new Set(Object.keys(elementNodesMap));
        const usedIds = new Set();

        this.state.elements.forEach(el => {
            usedIds.add(el.id);
            let node = elementNodesMap[el.id];

            if (!node) {
                node = this.createElementNode(el);
                if (el.static) {
                    this.staticContainer.appendChild(node);
                } else {
                    this.container.appendChild(node);
                }
                elementNodesMap[el.id] = node;
            }

            const isSelected = (el.id === this.state.selectedElementId);
            try {
                this.updateElementNode(node, el, isSelected);
            } catch (err) {
                console.warn(`[WARN] Error updating node`, err, node, el);
            }
        });

        // Remove any nodes for elements that no longer exist
        existingIds.forEach(id => {
            if (!usedIds.has(id)) {
                elementNodesMap[id].remove();
                delete elementNodesMap[id];
            }
        });

        // Request edge rendering after elements are updated
        if (this.edgeManager) {
            this.edgeManager.renderEdges();
        }
    }

    /**
     * Create a new element
     */
    createNewElement(x, y, type = 'markdown', content = '', isCanvasContainer = false, data = {}) {
        const newId = "el-" + Date.now();
        const defaultMap = {
            text: "New Text",
            img: "Realistic tree on white background",
            html: "<div>Hello World</div>",
            markdown: "# New Markdown\nSome **content** here..."
        };

        let finalType = isCanvasContainer ? 'canvas-container' : type;
        let finalContent = content || defaultMap[finalType] || "Untitled";
        const scaleFactor = this.state.viewState.scale || 1;

        const elObj = {
            ...data,
            id: newId,
            x, y,
            width: (isCanvasContainer ? 200 : 120) / scaleFactor,
            height: (isCanvasContainer ? 150 : 40) / scaleFactor,
            rotation: 0,
            type: finalType,
            content: finalContent,
            versions: [],
            static: false,
            childCanvasState: (isCanvasContainer ? {
                canvasId: newId + "_child",
                elements: [],
                edges: [],
                versionHistory: [],
            } : null)
        };

        this.state.addElement(elObj);
        this.state.selectElement(newId);
        this.renderElements();
        this.state.saveCanvas();

        return newId;
    }

    /**
     * Toggle an element's static status
     */
    toggleStatic(el) {
        const node = this.state.elementNodesMap[el.id];
        if (!node) return;

        if (!el.static) {
            const rect = node.getBoundingClientRect();
            const topPct = (rect.top / window.innerHeight) * 100;
            const leftPct = (rect.left / window.innerWidth) * 100;
            el.fixedTop = topPct;
            el.fixedLeft = leftPct;
            el.static = true;

            // Move to static container
            this.staticContainer.appendChild(node);
        } else {
            const rect = node.getBoundingClientRect();
            const centerCanvas = this.viewManager.screenToCanvas(rect.left + rect.width / 2, rect.top + rect.height / 2);
            el.x = centerCanvas.x - (el.width * (el.scale || 1)) / 2;
            el.y = centerCanvas.y - (el.height * (el.scale || 1)) / 2;
            el.static = false;

            // Move to regular container
            this.container.appendChild(node);
        }

        // Update element in state
        this.state.updateElement(el.id, el);
    }

    /**
     * Request image regeneration
     */
    requestImageRegeneration(el) {
        this.state.regenerateImage(el);
    }

    /**
     * Refresh all elements in the DOM
     */
    refreshAllElements() {
        this.renderElements();
    }

    /**
     * Handle events for various element manipulation handles
     */
    // These would be implemented as needed and would communicate with the state manager
    typeHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyTypeHandlePointerDown(ev);
    }

    resizeHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyResizeHandlePointerDown(ev);
    }

    scaleHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyScaleHandlePointerDown(ev);
    }

    rotateHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyRotateHandlePointerDown(ev);
    }

    reorderHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyReorderHandlePointerDown(ev);
    }

    edgeHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyEdgeHandlePointerDown(ev);
    }

    /**
     * Clean up resources when this manager is no longer needed
     */
    destroy() {
        // Unsubscribe from all state subscriptions
        this.stateSubscriptions.forEach(unsubscribe => unsubscribe());
        this.stateSubscriptions = [];
    }
}

// Export the class
export default ElementManager;
