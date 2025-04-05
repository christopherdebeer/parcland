// /src/ui-manager.js

/**
 * Manages UI elements like context menus, modals, and buttons.
 */
class UIManager {
    constructor(canvasContainer, stateManager, canvasController) {
        this.canvasContainer = canvasContainer;
        this.stateManager = stateManager;
        this.canvasController = canvasController; // Retain for context or potential future use

        // Existing UI Elements
        this.contextMenu = null;
        this.editModal = null;
        this.editTextArea = null;
        this.saveButton = null;
        this.closeButton = null;
        this.modeButton = null;
        this.drillUpButton = null;

        // New Raw Data Modal Elements
        this.rawDataModal = null;
        this.rawDataTextArea = null;
        this.rawDataSaveButton = null;
        this.rawDataCloseButton = null;
        this.editingElementId = null; // To store the ID of the element being edited (for either modal)

        this._createUIElements();
        this._createRawDataModal(); // Create the new modal
        this._bindUIEvents();

        // Subscribe to state changes to update UI elements if needed (e.g., drill-up button visibility)
        this.stateSubscriptions = [
             this.stateManager.subscribe('controller-changed', (controller) => this.updateDrillUpButtonVisibility(controller)),
             // Add other necessary subscriptions
        ];

        // Initial setup
         this.updateDrillUpButtonVisibility(this.canvasController); // Set initial state
         this.updateModeButton(this.stateManager.getState().mode); // Set initial mode button text
    }

    _createUIElements() {
        // Create or find existing UI elements (Context Menu, Edit Modal, Mode Button, Drill Up Button)

        // Context Menu (Create dynamically when needed)
        this.contextMenu = document.createElement('div');
        this.contextMenu.id = 'contextMenu';
        this.contextMenu.className = 'context-menu'; // Assuming a CSS class for styling
        this.contextMenu.style.position = 'absolute';
        this.contextMenu.style.display = 'none';
        this.contextMenu.style.zIndex = '1000'; // Ensure it's on top
        document.body.appendChild(this.contextMenu);


        // Edit Modal (Assuming structure exists in index.html or created similarly)
        this.editModal = document.getElementById('editModal'); // Or create dynamically
         if (!this.editModal) {
             console.warn("Edit modal element not found, creating dynamically.");
             // Add dynamic creation logic here if needed, similar to rawDataModal
             // For now, assume it exists in HTML or create a placeholder:
             this.editModal = document.createElement('div');
             this.editModal.id = 'editModal';
             this.editModal.className = 'modal';
             this.editModal.style.display = 'none';
             this.editModal.innerHTML = `
                 <div class="modal-content">
                     <span class="close-button edit-close">&times;</span>
                     <h2>Edit Element</h2>
                     <textarea id="editTextArea" rows="10" style="width: 95%;"></textarea>
                     <button id="saveButton">Save</button>
                 </div>`;
             document.body.appendChild(this.editModal);
         }
        this.editTextArea = document.getElementById('editTextArea');
        this.saveButton = document.getElementById('saveButton');
        this.closeButton = this.editModal?.querySelector('.edit-close'); // Use optional chaining

        // Mode Button
        this.modeButton = document.getElementById('modeButton'); // Assuming it exists in HTML
         if (!this.modeButton) {
             console.warn("Mode button element not found.");
         }

        // Drill Up Button
        this.drillUpButton = document.getElementById('drillUpButton'); // Assuming it exists in HTML
        if (!this.drillUpButton) {
            console.warn("Drill up button element not found.");
        } else {
             this.drillUpButton.style.display = 'none'; // Initially hidden
        }
    }

     _createRawDataModal() {
         // Create modal structure dynamically
         this.rawDataModal = document.createElement('div');
         this.rawDataModal.id = 'rawDataModal';
         this.rawDataModal.className = 'modal'; // Reuse existing modal styles
         this.rawDataModal.style.display = 'none'; // Initially hidden

         const modalContent = `
             <div class="modal-content">
                 <span class="close-button raw-data-close">&times;</span>
                 <h2>Edit Raw Element Data</h2>
                 <textarea id="rawDataTextArea" rows="15" style="width: 95%; font-family: monospace;"></textarea>
                 <button id="rawDataSaveButton">Save</button>
             </div>
         `;
         this.rawDataModal.innerHTML = modalContent;
         document.body.appendChild(this.rawDataModal); // Append to body

         // Get references to modal elements
         this.rawDataTextArea = this.rawDataModal.querySelector('#rawDataTextArea');
         this.rawDataSaveButton = this.rawDataModal.querySelector('#rawDataSaveButton');
         this.rawDataCloseButton = this.rawDataModal.querySelector('.raw-data-close');
     }


    _bindUIEvents() {
        // Edit Modal events
        if (this.closeButton) {
            this.closeButton.onclick = () => this.hideEditModal();
        }
        if (this.saveButton) {
             this.saveButton.onclick = () => this._handleEditSave();
         }

        // Raw Data Modal events
         if (this.rawDataCloseButton) {
            this.rawDataCloseButton.onclick = () => this.hideRawDataModal();
         }
         if(this.rawDataSaveButton) {
             this.rawDataSaveButton.onclick = () => this._handleRawDataSave();
         }

        // Hide context menu on click outside
        document.addEventListener('click', (event) => {
            if (this.contextMenu && !this.contextMenu.contains(event.target)) {
                this.hideContextMenu();
            }
        });

        // Hide modals on click outside (optional, added for both)
        window.addEventListener('click', (event) => {
            if (this.editModal && event.target === this.editModal) {
                this.hideEditModal();
            }
             if (this.rawDataModal && event.target === this.rawDataModal) {
                 this.hideRawDataModal();
             }
        });


        // Mode Button event
        if (this.modeButton) {
             this.modeButton.onclick = () => {
                 const currentMode = this.stateManager.getState().mode;
                 const nextMode = currentMode === 'direct' ? 'navigate' : 'direct';
                 this.stateManager.setMode(nextMode);
                 this.updateModeButton(nextMode);
             };
         }

         // Drill Up Button event
         if (this.drillUpButton) {
             this.drillUpButton.onclick = () => {
                 if (this.canvasController && this.canvasController.parentController) {
                     this.canvasController.drillUp();
                 }
             };
         }
    }

    updateModeButton(mode) {
        if (this.modeButton) {
            this.modeButton.textContent = mode === 'direct' ? 'Mode: Direct Edit' : 'Mode: Navigate';
        }
    }

    updateDrillUpButtonVisibility(controller) {
        if (this.drillUpButton) {
            // Use the controller passed from the event, or the current one
            const currentController = controller || this.canvasController;
            this.drillUpButton.style.display = currentController && currentController.parentController ? 'block' : 'none';
        }
    }


    // --- Context Menu Methods ---

    showContextMenu(x, y, elementId = null) {
        this.contextMenu.innerHTML = ''; // Clear previous items

        // Example: Add Element (always available)
        // const addElementItem = document.createElement('div');
        // addElementItem.className = 'context-menu-item';
        // addElementItem.textContent = 'Add Element';
        // addElementItem.onclick = (e) => {
        //     e.stopPropagation();
        //     // Logic to add a new element at position (x, y) translated to canvas coords
        //     const canvasCoords = this.canvasController.viewManager.screenToCanvasCoordinates(x, y);
        //     this.canvasController.createElement({ type: 'text', x: canvasCoords.x, y: canvasCoords.y, content: 'New Element' });
        //     this.hideContextMenu();
        // };
        // this.contextMenu.appendChild(addElementItem);


        if (elementId) {
            // Options available when clicking on an element
            const element = this.stateManager.getElement(elementId);

            // Edit Option (reuse existing logic if applicable)
             const editItem = document.createElement('div');
             editItem.className = 'context-menu-item';
             editItem.textContent = 'Edit Content';
             editItem.onclick = (e) => {
                 e.stopPropagation();
                 this.showEditModal(elementId);
                 this.hideContextMenu();
             };
             this.contextMenu.appendChild(editItem);


            // NEW: View/Edit Raw Data Option
            const viewRawDataItem = document.createElement('div');
            viewRawDataItem.className = 'context-menu-item';
            viewRawDataItem.textContent = 'View/Edit Raw Data';
            viewRawDataItem.onclick = (e) => {
                e.stopPropagation();
                this.showRawDataModal(elementId); // Call the method to show the new modal
                this.hideContextMenu();
            };
            this.contextMenu.appendChild(viewRawDataItem);


            // Delete Option
             const deleteItem = document.createElement('div');
             deleteItem.className = 'context-menu-item';
             deleteItem.textContent = 'Delete Element';
             deleteItem.onclick = (e) => {
                 e.stopPropagation();
                 if (confirm(`Are you sure you want to delete element ${elementId}?`)) {
                      this.stateManager.removeElement(elementId); // Assuming removeElement handles edges too
                 }
                 this.hideContextMenu();
             };
             this.contextMenu.appendChild(deleteItem);

              // Add other element-specific options here...
               if(element && element.type === 'canvas-container') {
                   const drillInItem = document.createElement('div');
                   drillInItem.className = 'context-menu-item';
                   drillInItem.textContent = 'Drill In';
                   drillInItem.onclick = (e) => {
                       e.stopPropagation();
                       this.canvasController.drillIntoCanvas(elementId);
                       this.hideContextMenu();
                   };
                   this.contextMenu.appendChild(drillInItem);
               }

        } else {
            // Options available when clicking on the canvas background
             // Example: Paste? Add element?
        }


        // Position and show the menu
        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.style.display = 'block';
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.style.display = 'none';
        }
    }

    // --- Edit Modal Methods ---

    showEditModal(elementId) {
         if (!this.editModal || !this.editTextArea) {
             console.error("Edit modal elements not initialized.");
             return;
         }
        this.editingElementId = elementId; // Store the ID
        const elementData = this.stateManager.getElement(elementId);
        if (elementData) {
            // Populate based on element type, assuming 'content' field for simplicity
            this.editTextArea.value = elementData.content || '';
            this.editModal.style.display = 'block';
        } else {
            console.error("Element not found for editing:", elementId);
        }
    }

    hideEditModal() {
         if (!this.editModal) return;
        this.editingElementId = null; // Clear the ID
        this.editModal.style.display = 'none';
    }

    _handleEditSave() {
         if (!this.editingElementId || !this.editTextArea) return;

        const currentElementData = this.stateManager.getElement(this.editingElementId);
         if (!currentElementData) {
             console.error("Element to save not found:", this.editingElementId);
             this.hideEditModal(); // Hide modal even if save fails
             return;
         }

        // Create update payload - only update 'content' for this simple modal
        // More complex modals might update other properties.
        const updatedFields = {
            content: this.editTextArea.value
        };

        this.stateManager.updateElement(this.editingElementId, { ...currentElementData, ...updatedFields });
        this.hideEditModal();
    }

     // --- Raw Data Modal Methods ---

     showRawDataModal(elementId) {
         if (!this.rawDataModal || !this.rawDataTextArea) {
             console.error("Raw data modal elements not initialized.");
             return;
         }
         this.editingElementId = elementId; // Store the ID
         const elementData = this.stateManager.getElement(this.editingElementId);
         if (!elementData) {
             console.error("Element not found for raw edit:", this.editingElementId);
             return;
         }

         try {
             // Pretty-print JSON
             this.rawDataTextArea.value = JSON.stringify(elementData, null, 2);
         } catch (error) {
             console.error("Error stringifying element data:", error);
             this.rawDataTextArea.value = "Error displaying element data.";
         }

         this.rawDataModal.style.display = 'block';
     }

     hideRawDataModal() {
         if (!this.rawDataModal) return;
         this.editingElementId = null; // Clear the ID
         this.rawDataModal.style.display = 'none';
     }

     _handleRawDataSave() {
         if (!this.editingElementId || !this.rawDataTextArea) return;

         try {
             const updatedData = JSON.parse(this.rawDataTextArea.value);

             // Basic validation (ensure core properties aren't wiped out, ID matches)
             if (!updatedData || typeof updatedData !== 'object' || !updatedData.id || updatedData.id !== this.editingElementId) {
                 alert('Invalid data structure or ID mismatch. Ensure "id" property exists and matches the element being edited.');
                 return;
             }

             // Directly update the element state with the parsed object
             this.stateManager.updateElement(this.editingElementId, updatedData);

             this.hideRawDataModal();
         } catch (error) {
             console.error("Error parsing or saving raw data:", error);
             alert(`Error saving data: Invalid JSON format.\n${error.message}`);
         }
     }


    // --- Cleanup ---

    destroy() {
        // Remove dynamically created elements
        if (this.contextMenu && this.contextMenu.parentNode) {
            this.contextMenu.parentNode.removeChild(this.contextMenu);
            this.contextMenu = null;
        }
         if (this.rawDataModal && this.rawDataModal.parentNode) {
             this.rawDataModal.parentNode.removeChild(this.rawDataModal);
             this.rawDataModal = null;
         }
        // If edit modal was created dynamically, remove it too
        // if (/* check if editModal was dynamically created */ && this.editModal && this.editModal.parentNode) {
        //     this.editModal.parentNode.removeChild(this.editModal);
        //     this.editModal = null;
        // }


        // Remove event listeners added to document/window
        // Assuming the click listeners were bound in _bindUIEvents
        // Note: Storing bound functions might be needed for accurate removal if not using arrow functions directly
        // Example: document.removeEventListener('click', this._handleDocumentClick);

        // Unsubscribe from state changes
        this.stateSubscriptions.forEach(unsubscribe => unsubscribe());
        this.stateSubscriptions = [];

        console.log("UIManager destroyed");
    }
}

export default UIManager;
