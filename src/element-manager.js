// element-manager.js
class ElementManager {
    constructor(stateManager, domElements, dependencies = {}) {
        this.state = stateManager;
        this.container = domElements.container;
        this.staticContainer = domElements.staticContainer;
        this.edgeManager = dependencies.edgeManager;
        this.viewManager = dependencies.viewManager;

        this.stateSubscriptions = [
            this.state.subscribe('element-updated', (data) => {
                this.updateElementNodeById(data.id, data.element);
            }),
            this.state.subscribe('selection-changed', (elementId) => {
                this.refreshAllElements();
            })
        ];
    }

    createNewElement(x, y, type='markdown', content='', isCanvasContainer=false, data={}) {
      const newId = "el-" + Date.now();
      const defaultMap = {
        text: "New text element",
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
      this.state.addElement(elObj);
      this.state.selectElement(newId);
      this.renderElements();
      this.constoller.saveCanvas();
      return newId;
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

        const oldHandles = Array.from(node.querySelectorAll('.element-handle'));
        oldHandles.forEach(h => h.remove());

        if (isSelected) {
            this.buildHandles(node, el);
        }
    }

    updateElementNodeById(id, el) {
        const node = this.state.elementNodesMap[id];
        if (node) {
            const isSelected = (id === this.state.selectedElementId);
            this.updateElementNode(node, el, isSelected);
        }
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

        console.log("Setting element content", el.id, el.type);
        node.dataset.type = el.type;
        node.dataset.content = el.content;
        node.dataset.src = desiredSrc;
        node.innerHTML = "";

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

        const content = node.querySelector('.content');
        if (content) {
            if (content.clientHeight < content.scrollHeight) {
                content.classList.add('scroller');
            } else {
                content.classList.remove('scroller');
            }
        }
    }

    renderTextElement(node, el) {
        const t = document.createElement('p');
        t.classList.add('content');
        t.textContent = el.content;
        t.style.color = el.color || "#000000";
        node.appendChild(t);
    }

    renderHtmlElement(node, el) {
        const t = document.createElement('div');
        t.classList.add('content');
        t.innerHTML = el.content;
        node.appendChild(t);
        this.executeScriptElements(el, t);
    }

    renderMarkdownElement(node, el) {
        const t = document.createElement('div');
        t.classList.add('content');
        t.innerHTML = marked.parse(el.content);
        t.style.color = el.color || "#000000";
        node.appendChild(t);
    }

    renderImageElement(node, el) {
        const i = document.createElement("img");
        i.classList.add("content");
        i.dataset.image_id = el.imgId || "";
        i.title = el.content;
        i.onerror = (err) => console.warn("Image failed to load", err);
        if (!el.src && !i.src) {
            this.requestImageRegeneration(el);
        }
        i.src = el.src || `https://placehold.co/${Math.round(el.width)}x${Math.round(el.height)}?text=${encodeURIComponent(el.content)}&font=lora`;
        node.appendChild(i);
    }

    renderCanvasContainerElement(node, el) {
        const containerDiv = document.createElement('div');
        containerDiv.classList.add('content', 'child-canvas-container');
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

        const previewContainer = document.createElement('div');
        previewContainer.style.flex = '1';
        previewContainer.style.width = '100%';
        previewContainer.style.position = 'relative';
        previewContainer.style.overflow = 'hidden';

        if (el.childCanvasState && el.childCanvasState.elements?.length > 0) {
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

        const drillInBtn = document.createElement('button');
        drillInBtn.className = 'drill-in-button';
        drillInBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i> Drill In';
        drillInBtn.onclick = (ev) => {
            ev.stopPropagation();
            const childState = el.childCanvasState || {
                canvasId: el.id + "_child",
                elements: [],
                edges: []
            };
            this.state.requestDrillIn(childState);
        };

        containerDiv.appendChild(previewContainer);
        containerDiv.appendChild(drillInBtn);
        node.appendChild(containerDiv);
    }

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

        deleteBtn.onclick = () => this.handleEditPromptDelete(el);
        saveBtn.onclick = () => this.handleEditPromptSave(node, el);
        cancelBtn.onclick = () => this.handleEditPromptCancel(el);
    }

    handleEditPromptDelete(el) {
        const target = this.state.findElementOrEdgeById(el.target);
        this.state.removeElementById(target?.id);
        this.state.removeEdgeById(target?.id);
        this.state.removeElementById(el.id);
        this.refreshAllElements();
        this.state.saveCanvas();
    }

    handleEditPromptSave(node, el) {
        const val = node.editor.getValue();
        const target = this.state.findElementOrEdgeById(el.target);
        if (target) {
            target[el.property] = val;
            if (this.edgeManager) {
                this.edgeManager.renderEdges();
            }
            this.state.saveCanvas();
        }
        this.state.removeElementById(el.id);
        this.refreshAllElements();
    }

    handleEditPromptCancel(el) {
        this.state.removeElementById(el.id);
        this.refreshAllElements();
        this.state.saveCanvas();
    }

    applyPositionStyles(node, el) {
        const scale = el.scale || 1;
        const rotation = el.rotation || 0;
        const zIndex = Math.floor(el.zIndex) || 1;
        const blendMode = el.blendMode || 'normal';

        node.style.position = el.static ? 'fixed' : 'absolute';
        node.style.left = el.static ? (el.fixedLeft || 0) + '%' : (el.x - (el.width * scale) / 2) + "px";
        node.style.top = el.static ? (el.fixedTop || 0) + '%' : (el.y - (el.height * scale) / 2) + "px";
        node.style.width = (el.width * scale) + "px";
        node.style.height = (el.height * scale) + "px";
        node.style.setProperty('--scale', scale);
        node.style.setProperty('--width', (el.width * scale) + "px");
        node.style.setProperty('--height', (el.height * scale) + "px");
        node.style.setProperty('--blend-mode', blendMode);
        node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
    }

    buildHandles(node, el) {
        const addHandle = (className, iconClass, handler) => {
            const h = document.createElement("div");
            h.className = `${className} element-handle`;
            const i = document.createElement("i");
            i.className = iconClass;
            h.appendChild(i);
            h.addEventListener("pointerdown", handler);
            node.appendChild(h);
        };

        addHandle("type-handle", "fa-solid fa-font", (ev) => this.typeHandlePointerDown(ev));
        addHandle("scale-handle top-right", "fa-solid fa-up-down-left-right", (ev) => this.scaleHandlePointerDown(ev));
        addHandle("reorder-handle bottom-left", "fa-solid fa-layer-group", (ev) => this.reorderHandlePointerDown(ev));
        addHandle("resize-handle bottom-right", "fa-solid fa-up-right-and-down-left-from-center", (ev) => this.resizeHandlePointerDown(ev));
        addHandle("rotate-handle rotate-handle-position", "fa-solid fa-rotate", (ev) => this.rotateHandlePointerDown(ev));
        addHandle("edge-handle", "fa-solid fa-link", (ev) => this.edgeHandlePointerDown(ev));
        addHandle("create-node-handle", "fa-solid fa-plus", (ev) => this.createNodeHandlePointerDown(ev));
    }

    createNodeHandlePointerDown(ev) {
        ev.stopPropagation();
        this.state.notifyCreateNodeHandlePointerDown(ev);
    }

    typeHandlePointerDown(ev) { ev.stopPropagation(); this.state.notifyTypeHandlePointerDown(ev); }
    resizeHandlePointerDown(ev) { ev.stopPropagation(); this.state.notifyResizeHandlePointerDown(ev); }
    scaleHandlePointerDown(ev) { ev.stopPropagation(); this.state.notifyScaleHandlePointerDown(ev); }
    rotateHandlePointerDown(ev) { ev.stopPropagation(); this.state.notifyRotateHandlePointerDown(ev); }
    reorderHandlePointerDown(ev) { ev.stopPropagation(); this.state.notifyReorderHandlePointerDown(ev); }
    edgeHandlePointerDown(ev) { ev.stopPropagation(); this.state.notifyEdgeHandlePointerDown(ev); }

    requestImageRegeneration(el) {
        this.state.regenerateImage(el);
    }

    refreshAllElements() {
        this.renderElements();
    }

    renderElements() {
        const { elementNodesMap } = this.state;
        const existingIds = new Set(Object.keys(elementNodesMap));
        const usedIds = new Set();

        this.state.elements.forEach(el => {
            usedIds.add(el.id);
            let node = elementNodesMap[el.id];

            if (!node) {
                node = this.createElementNode(el);
                (el.static ? this.staticContainer : this.container).appendChild(node);
                elementNodesMap[el.id] = node;
            }

            const isSelected = (el.id === this.state.selectedElementId);
            try {
                this.updateElementNode(node, el, isSelected);
            } catch (err) {
                console.warn(`[WARN] Error updating node`, err, node, el);
            }
        });

        existingIds.forEach(id => {
            if (!usedIds.has(id)) {
                elementNodesMap[id].remove();
                delete elementNodesMap[id];
            }
        });

        if (this.edgeManager) {
            this.edgeManager.renderEdges();
        }
    }

    destroy() {
        this.stateSubscriptions.forEach(unsubscribe => unsubscribe());
        this.stateSubscriptions = [];
    }
}

export default ElementManager;
