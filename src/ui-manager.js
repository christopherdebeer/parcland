// ui-manager.js
class UIManager {
    constructor(stateManager, domElements, dependencies = {}) {
        this.state = stateManager;
        this.domElements = domElements;
        this.elementManager = dependencies.elementManager;
        this.edgeManager = dependencies.edgeManager;
        this.viewManager = dependencies.viewManager;

        // Modal state
        this.currentElForVersions = null;
        this.currentVersionIndex = 0;
        this.activeEditTab = "content";

        // CodeMirror instances
        this.codeMirrorContent = null;
        this.codeMirrorSrc = null;

        // Initialize modal event listeners
        this.initializeModalHandlers();

        // Subscribe to state changes
        this.stateSubscriptions = [
            this.state.subscribe('selection-changed', (id) => {
                // Update UI based on selection
                if (id === null) {
                    this.hideContextMenu();
                }
            })
        ];
    }

    /**
     * Initialize modal event handlers
     */
    initializeModalHandlers() {
        const {
            modalCancelBtn,
            modalSaveBtn,
            modalGenerateBtn,
            modalVersionsPrevBtn,
            modalVersionsNextBtn
        } = this.domElements;

        // Modal cancel button
        modalCancelBtn.onclick = () => {
            this.hideEditModal();
        };

        // Modal save button
        modalSaveBtn.onclick = () => {
            this.saveModalContent();
        };

        // Modal generate button
        modalGenerateBtn.onclick = async () => {
            await this.generateModalContent();
        };

        // Modal clear button
        document.getElementById("modal-clear").onclick = () => {
            this.clearModalContent();
        };

        // Modal copy button
        document.getElementById("modal-copy").onclick = async () => {
            await this.copyModalContentToClipboard();
        };

        // Version navigation buttons
        modalVersionsPrevBtn.onclick = () => {
            this.navigateToPreviousVersion();
        };

        modalVersionsNextBtn.onclick = () => {
            this.navigateToNextVersion();
        };

        // Modal tab switching
        document.getElementById("tab-content").onclick = () => {
            this.switchModalTab("content");
        };

        document.getElementById("tab-src").onclick = () => {
            this.switchModalTab("src");
        };
    }

    /**
     * Show the context menu
     */
    showContextMenu(x, y, elementId = null) {
        const contextMenu = this.domElements.contextMenu;

        // Position the menu
        contextMenu.style.left = x + "px";
        contextMenu.style.top = y + "px";

        // Build menu content
        if (elementId) {
            this.buildContextMenu(elementId);
        }

        // Show the menu
        contextMenu.style.display = "flex";
    }

    /**
     * Hide the context menu
     */
    hideContextMenu() {
        this.domElements.contextMenu.style.display = "none";
    }

    /**
     * Build context menu for an element
     */
    buildContextMenu(elId) {
        const el = this.state.findElementById(elId) || this.state.findEdgeElementById(elId);
        if (!el) return;

        const contextMenu = this.domElements.contextMenu;
        contextMenu.innerHTML = "";

        // Type switches
        const typesContainer = document.createElement('div');
        typesContainer.classList.add('btn-container');
        contextMenu.appendChild(typesContainer);

        const types = [
            { type: 'img', icon: 'fa-solid fa-image' },
            { type: 'text', icon: 'fa-solid fa-font' },
            { type: 'html', icon: 'fa-solid fa-code' },
            { type: 'markdown', icon: 'fa-brands fa-markdown' },
            { type: 'canvas-container', icon: 'fa-regular fa-object-group' }
        ];

        types.forEach(t => {
            const btn = document.createElement("button");
            btn.innerHTML = `<i class="${t.icon}"></i>`;
            btn.title = `Type: ${t.type}`;
            if (el.type === t.type) btn.classList.add('selected');

            this.clickCapture(btn, () => {
                this.state.updateElement(el.id, { type: t.type });
                this.hideContextMenu();
            });

            typesContainer.appendChild(btn);
        });

        // Blend mode selector
        const blendSelect = document.createElement('select');
        contextMenu.appendChild(blendSelect);

        const blends = [
            'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
            'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
        ];

        blends.forEach(bm => {
            const option = document.createElement('option');
            option.value = bm;
            option.textContent = bm;
            blendSelect.appendChild(option);
        });

        blendSelect.value = el.blendMode || 'normal';
        blendSelect.onchange = (ev) => {
            this.state.updateElement(el.id, { blendMode: ev.target.value });
        };

        // Regen button for images
        if (el.type === "img") {
            const regenBtn = document.createElement("button");
            regenBtn.innerHTML = '<i class="fa-solid fa-arrow-rotate-right"></i> Regen';
            regenBtn.onclick = () => {
                this.state.regenerateImage(el);
                this.hideContextMenu();
            };
            contextMenu.appendChild(regenBtn);
        }

        // Color picker for text/markdown
        if (el.type === 'text' || el.type === 'markdown') {
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = el.color || "#000000";
            colorInput.addEventListener('change', (ev) => {
                this.state.updateElement(el.id, { color: ev.target.value });
            });
            contextMenu.appendChild(colorInput);
        }

        // Toggle static
        const staticBtn = document.createElement("button");
        staticBtn.innerHTML = el.static ? "Unset Static" : "Set Static";
        this.clickCapture(staticBtn, () => {
            this.elementManager.toggleStatic(el);
            this.hideContextMenu();
        });
        contextMenu.appendChild(staticBtn);

        // Open child canvas if applicable
        if (el.type === 'canvas-container' && el.childCanvasState) {
            const openCanvasBtn = document.createElement("button");
            openCanvasBtn.textContent = "Open Child Canvas";
            this.clickCapture(openCanvasBtn, () => {
                this.hideContextMenu();
                this.state.requestDrillIn(el.childCanvasState);
            });
            contextMenu.appendChild(openCanvasBtn);
        }

        // Edit button
        const editBtn = document.createElement("button");
        editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit';
        this.clickCapture(editBtn, () => {
            this.openEditModal(el);
            this.hideContextMenu();
        });
        contextMenu.appendChild(editBtn);

        // Edit inline button
        const editInlineBtn = document.createElement("button");
        editInlineBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Edit inline';
        this.clickCapture(editInlineBtn, (ev) => {
            this.createEditElement(ev, el, "content");
            this.hideContextMenu();
        });
        contextMenu.appendChild(editInlineBtn);

        // Delete button
        const deleteBtn = document.createElement("button");
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> Delete';
        this.clickCapture(deleteBtn, () => {
            if (el.id.startsWith('edge-')) {
                this.state.removeEdgeById(el.id);
            } else {
                this.state.removeElementById(el.id);
            }
            this.hideContextMenu();
        });
        contextMenu.appendChild(deleteBtn);

        // Duplicate button
        const duplicateBtn = document.createElement("button");
        duplicateBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Duplicate';
        this.clickCapture(duplicateBtn, () => {
            const newEl = { ...el };
            newEl.id = "el-" + Date.now();
            newEl.x += 20;
            newEl.y += 20;
            this.state.addElement(newEl);
            this.state.selectElement(newEl.id);
            this.hideContextMenu();
        });
        contextMenu.appendChild(duplicateBtn);

        // ID display
        const idEl = document.createElement("span");
        idEl.innerHTML = el.id;
        contextMenu.appendChild(idEl);
    }

    /**
     * Helper function to capture clicks properly
     */
    clickCapture(btn, handler) {
        btn.addEventListener("pointerdown", (ev) => {
            ev.stopPropagation();
            btn.setPointerCapture(ev.pointerId);
        });
        btn.onclick = handler;
    }

    /**
     * Create an inline edit element
     */
    createEditElement(ev, el, prop) {
        const canvasPt = this.viewManager.screenToCanvas(ev.clientX, ev.clientY);
        const elId = this.elementManager.createNewElement(canvasPt.x, canvasPt.y, "edit-prompt", el[prop], false, {
            target: el.id,
            property: prop,
        });

        const controller = this.state.getController();
        controller.switchMode('direct');

        this.edgeManager.createNewEdge(elId, el.id, "Editing...", { meta: true });
    }

    /**
     * Open the edit modal for an element
     */
    openEditModal(el) {
        const { editModal, editorContentContainer, editorSrcContainer } = this.domElements;

        editModal.style.display = "block";
        this.currentElForVersions = el;
        el.versions = el.versions || [];
        this.currentVersionIndex = el.versions.length;

        // Initialize CodeMirror instances if needed
        if (!this.codeMirrorContent) {
            this.codeMirrorContent = CodeMirror(editorContentContainer, {
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
            this.codeMirrorSrc = CodeMirror(editorSrcContainer, {
                value: "",
                lineNumbers: true,
                mode: "text",
                theme: "default",
                lineWrapping: true
            });
        }

        // Set the active tab based on element type
        if (el.type === "img" && el.src) {
            this.switchModalTab("src");
        } else {
            this.switchModalTab("content");
        }

        // Load the element content
        this.loadVersion(el, this.currentVersionIndex);
    }

    /**
     * Hide the edit modal
     */
    hideEditModal() {
        this.domElements.editModal.style.display = "none";
    }

    /**
     * Switch modal tab
     */
    switchModalTab(tab) {
        this.activeEditTab = tab;

        if (tab === "content") {
            document.getElementById("tab-content").classList.add("active");
            document.getElementById("tab-src").classList.remove("active");
            document.getElementById("editor-content").style.display = "block";
            document.getElementById("editor-src").style.display = "none";
        } else {
            document.getElementById("tab-src").classList.add("active");
            document.getElementById("tab-content").classList.remove("active");
            document.getElementById("editor-src").style.display = "block";
            document.getElementById("editor-content").style.display = "none";
        }
    }

    /**
     * Load a specific version of element content
     */
    loadVersion(el, index) {
        if (!el.versions) return;

        if (index < el.versions.length) {
            const older = el.versions[index];
            this.codeMirrorContent.setValue(older.content);
        } else {
            this.codeMirrorContent.setValue(el.content || "");
        }

        this.codeMirrorSrc.setValue(el.src || "");

        this.currentVersionIndex = index;
        this.renderVersionInfo(el);
    }

    /**
     * Render version info
     */
    renderVersionInfo(el) {
        const total = el.versions.length + 1;
        const shown = this.currentVersionIndex + 1;

        if (this.currentVersionIndex < el.versions.length) {
            this.domElements.modalVersionsInfo.textContent = `Viewing Older Version ${shown} of ${total}`;
        } else {
            this.domElements.modalVersionsInfo.textContent = `Viewing Current Version ${shown} of ${total}`;
        }
    }

    /**
     * Navigate to previous version
     */
    navigateToPreviousVersion() {
        if (!this.currentElForVersions) return;

        if (this.currentVersionIndex > 0) {
            this.currentVersionIndex--;
            this.loadVersion(this.currentElForVersions, this.currentVersionIndex);
        }
    }

    /**
     * Navigate to next version
     */
    navigateToNextVersion() {
        if (!this.currentElForVersions) return;

        if (this.currentVersionIndex < this.currentElForVersions.versions.length) {
            this.currentVersionIndex++;
            this.loadVersion(this.currentElForVersions, this.currentVersionIndex);
        }
    }

    /**
     * Save modal content
     */
    saveModalContent() {
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el) return;

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

        this.state.updateElement(el.id, el);
        this.hideEditModal();
    }

    /**
     * Generate content using AI
     */
    async generateModalContent() {
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el) return;

        this.clearModalError();
        this.domElements.modalGenerateBtn.disabled = true;

        const oldBtnContent = this.domElements.modalGenerateBtn.innerHTML;
        this.domElements.modalGenerateBtn.innerHTML = `Generating... <i class="fa-solid fa-spinner fa-spin"></i>`;

        try {
            let currentContent;
            if (this.activeEditTab === "content") {
                currentContent = this.codeMirrorContent.getValue();
            } else {
                currentContent = this.codeMirrorSrc.getValue();
            }

            const controller = this.state.getController();
            const generatedContent = await controller.generateContent(currentContent, el);

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
            this.domElements.modalGenerateBtn.disabled = false;
            this.domElements.modalGenerateBtn.innerHTML = oldBtnContent;
        }
    }

    /**
     * Clear modal content
     */
    clearModalContent() {
        if (this.activeEditTab === "content") {
            this.codeMirrorContent.setValue("");
        } else {
            this.codeMirrorSrc.setValue("");
        }
    }

    /**
     * Copy modal content to clipboard
     */
    async copyModalContentToClipboard() {
        try {
            if (this.activeEditTab === "content") {
                await navigator.clipboard.writeText(this.codeMirrorContent.getValue());
            } else {
                await navigator.clipboard.writeText(this.codeMirrorSrc.getValue());
            }
            alert("Copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy:", err);
            this.showModalError("Failed to copy to clipboard.");
        }
    }

    /**
     * Clear modal error message
     */
    clearModalError() {
        this.domElements.modalError.textContent = "";
    }

    /**
     * Show modal error message
     */
    showModalError(msg) {
        this.domElements.modalError.textContent = msg;
    }

    /**
     * Get CodeMirror mode for element type
     */
    getCodeMirrorMode(type) {
        switch (type) {
            case 'html': return 'htmlmixed';
            case 'markdown': return 'markdown';
            case 'text': return 'javascript';
            default: return 'javascript';
        }
    }

    /**
     * Create a confirmation dialog
     */
    showConfirmation(message, onConfirm, onCancel) {
        const confirmation = confirm(message);
        if (confirmation) {
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
        } else {
            if (typeof onCancel === 'function') {
                onCancel();
            }
        }
    }

    /**
     * Show a prompt dialog
     */
    showPrompt(message, defaultValue, onSubmit, onCancel) {
        const result = prompt(message, defaultValue);
        if (result !== null) {
            if (typeof onSubmit === 'function') {
                onSubmit(result);
            }
        } else {
            if (typeof onCancel === 'function') {
                onCancel();
            }
        }
    }

    /**
     * Show a notification
     */
    showNotification(message, type = 'info', duration = 3000) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.padding = '10px 20px';
        notification.style.background = type === 'error' ? '#ff4444' : '#4ad36a';
        notification.style.color = 'white';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
        notification.style.zIndex = '9999';
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s ease-in-out';

        // Add to DOM
        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => {
            notification.style.opacity = '1';
        }, 10);

        // Hide notification after duration
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, duration);
    }

    /**
     * Create a tooltip for an element
     */
    createTooltip(element, text) {
        element.title = text;

        // For more advanced tooltips, add additional functionality here
    }

    /**
     * Clean up resources when this manager is no longer needed
     */
    destroy() {
        // Unsubscribe from all state subscriptions
        this.stateSubscriptions.forEach(unsubscribe => unsubscribe());
        this.stateSubscriptions = [];

        // Clean up CodeMirror instances
        if (this.codeMirrorContent) {
            // No direct destroy method, but we can clean up the DOM
            this.codeMirrorContent = null;
        }

        if (this.codeMirrorSrc) {
            this.codeMirrorSrc = null;
        }
    }
}

// Export the class
export default UIManager;