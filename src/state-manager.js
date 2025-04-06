// state-manager.js
class StateManager {
    constructor(initialState = {}, parentStateManager = null) {
        this.canvasState = initialState;
        this.parentStateManager = parentStateManager;
        this.childCanvasElements = new Map(); // Track elements that contain child canvases

        // Initialize canvas state if not provided
        if (!this.canvasState.elements) {
            this.canvasState.elements = [];
        }
        if (!this.canvasState.edges) {
            this.canvasState.edges = [];
        }
        if (!this.canvasState.versionHistory) {
            this.canvasState.versionHistory = [];
        }

        // State properties
        this.selectedElementId = null;
        this.activeGesture = null;
        this.mode = 'navigate'; // 'navigate' or 'direct'

        // Component references
        this.elementNodesMap = {};
        this.edgeNodesMap = {};
        this.edgeLabelNodesMap = {};

        // View state
        this.viewState = {
            scale: 1,
            translateX: 0,
            translateY: 0
        };

        // Save state
        this.saveTimeout = null;
        this.debounceSaveDelay = 500;
        this.tokenKey = "PARC.LAND/BKPK_TOKEN";

        // Event listeners for state changes
        this.listeners = new Map();

        // Controller reference
        this.controller = null;

        // Handle notifications for element handles
        this.setupHandleNotifications();
    }

    /**
     * Set up handle notification methods
     */
    setupHandleNotifications() {
        // These will be set by EventManager
        this.notifyResizeHandlePointerDown = () => { };
        this.notifyScaleHandlePointerDown = () => { };
        this.notifyReorderHandlePointerDown = () => { };
        this.notifyTypeHandlePointerDown = () => { };
        this.notifyRotateHandlePointerDown = () => { };
        this.notifyEdgeHandlePointerDown = () => { };
    }

    /**
     * Set a reference to the controller
     */
    setController(controller) {
        this.controller = controller;
    }

    /**
     * Get a reference to the controller
     */
    getController() {
        return this.controller;
    }

    /**
     * Subscribe to a state event
     * @returns {Function} Unsubscribe function
     */
    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);

        // Return an unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            if (!callbacks) return;

            const index = callbacks.indexOf(callback);
            if (index !== -1) {
                callbacks.splice(index, 1);
            }
        };
    }

    /**
     * Notify subscribers of an event
     */
    notify(event, data) {
        if (!this.listeners.has(event)) return;

        // Copy the listeners array to avoid issues if a callback modifies it
        const callbacks = [...this.listeners.get(event)];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in ${event} listener:`, error);
            }
        });
    }

    /**
     * Get all elements
     */
    get elements() {
        return this.canvasState.elements || [];
    }

    /**
     * Get all edges
     */
    get edges() {
        return this.canvasState.edges || [];
    }

    /**
     * Find an element by ID
     */
    findElementById(id) {
        if (!id) return null;
        return this.elements.find(e => e.id === id);
    }

    /**
     * Find an edge by ID
     */
    findEdgeElementById(id) {
        if (!id) return null;
        return this.edges.find(e => e.id === id);
    }

    /**
     * Find either an element or edge by ID
     */
    findElementOrEdgeById(id) {
        return this.findElementById(id) || this.findEdgeElementById(id);
    }

    /**
     * Find edges connected to an element
     */
    findEdgesByElementId(id) {
        if (!id) return [];
        return this.edges.filter(e => e.source === id || e.target === id);
    }

    /**
 * Find all ancestor elements that lead to the given element
 * via edges, ordered from oldest ancestor to immediate parent.
 */
findAncestorElements(targetId, visited = new Set()) {
    if (!targetId || visited.has(targetId)) return [];
    visited.add(targetId);
  
    const incomingEdges = this.edges.filter(edge => edge.target === targetId);
    let ancestors = [];
  
    for (const edge of incomingEdges) {
      const sourceEl = this.findElementById(edge.source);
      if (sourceEl) {
        // Recurse upward through graph
        ancestors.push(...this.findAncestorElements(sourceEl.id, visited));
        ancestors.push(sourceEl);
      }
    }
  
    return ancestors;
  }

    /**
     * Register a child canvas element
     */
    registerChildCanvas(elementId, childCanvasId) {
        this.childCanvasElements.set(elementId, childCanvasId);
        this.notify('child-canvas-registered', { elementId, childCanvasId });
    }

    /**
     * Get child canvas state
     */
    getChildCanvasState(elementId) {
        const childCanvasId = this.childCanvasElements.get(elementId);
        if (childCanvasId) {
            return {
                canvasId: childCanvasId,
                sourceElementId: elementId,
                elements: [],
                edges: []
            };
        }
        return null;
    }

    /**
     * Add a new element
     */
    addElement(element) {
        if (!element.id) {
            element.id = "el-" + Date.now();
        }

        this.canvasState.elements.push(element);
        this.notify('element-added', element);
        return element.id;
    }

    /**
     * Update an element
     */
    updateElement(id, updates) {
        const element = this.findElementById(id);
        if (!element) return false;

        // Apply updates to the element
        Object.assign(element, updates);

        // Notify listeners
        this.notify('element-updated', { id, element });
        return true;
    }

    /**
     * Remove an element by ID
     */
    removeElementById(id) {
        if (!id) return false;

        const initialLength = this.canvasState.elements.length;
        this.canvasState.elements = this.canvasState.elements.filter(e => e.id !== id);

        if (initialLength !== this.canvasState.elements.length) {
            // Element was removed
            if (this.elementNodesMap[id]) {
                this.elementNodesMap[id].remove();
                delete this.elementNodesMap[id];
            }

            // Remove any edges connected to this element
            const connectedEdges = this.findEdgesByElementId(id);
            connectedEdges.forEach(edge => {
                this.removeEdgeById(edge.id);
            });

            // Remove child canvas reference if this was a container
            if (this.childCanvasElements.has(id)) {
                this.childCanvasElements.delete(id);
            }

            this.notify('element-removed', id);

            // If the removed element was selected, clear selection
            if (this.selectedElementId === id) {
                this.clearSelection();
            }

            return true;
        }

        return false;
    }

    /**
     * Add a new edge
     */
    addEdge(edge) {
        if (!edge.id) {
            edge.id = "edge-" + Date.now();
        }

        this.canvasState.edges.push(edge);
        this.notify('edge-added', edge);
        return edge.id;
    }

    /**
     * Update an edge
     */
    updateEdge(id, updates) {
        const edge = this.findEdgeElementById(id);
        if (!edge) return false;

        // Apply updates to the edge
        Object.assign(edge, updates);

        // Notify listeners
        this.notify('edge-updated', { id, edge });
        return true;
    }

    /**
     * Remove an edge by ID
     */
    removeEdgeById(id) {
        if (!id) return false;

        const initialLength = this.canvasState.edges.length;
        this.canvasState.edges = this.canvasState.edges.filter(e => e.id !== id);

        if (initialLength !== this.canvasState.edges.length) {
            // Edge was removed
            if (this.edgeNodesMap[id]) {
                this.edgeNodesMap[id].remove();
                delete this.edgeNodesMap[id];
            }

            if (this.edgeLabelNodesMap && this.edgeLabelNodesMap[id]) {
                this.edgeLabelNodesMap[id].remove();
                delete this.edgeLabelNodesMap[id];
            }

            this.notify('edge-removed', id);

            // If the removed edge was selected, clear selection
            if (this.selectedElementId === id) {
                this.clearSelection();
            }

            return true;
        }

        return false;
    }

    /**
     * Select an element or edge
     */
    selectElement(id) {
        if (this.selectedElementId !== id) {
            this.selectedElementId = id;
            this.notify('selection-changed', id);
        }
    }

    /**
     * Clear element selection
     */
    clearSelection() {
        if (this.selectedElementId) {
            this.selectedElementId = null;
            this.notify('selection-changed', null);
        }
    }

    /**
     * Set the active gesture
     */
    setActiveGesture(gesture) {
        if (this.activeGesture !== gesture) {
            this.activeGesture = gesture;
            this.notify('gesture-changed', gesture);
        }
    }

    /**
     * Clear the active gesture
     */
    clearActiveGesture() {
        if (this.activeGesture) {
            this.activeGesture = null;
            this.notify('gesture-changed', null);
        }
    }

    /**
     * Set the view state
     */
    setViewState(updates) {
        const prevState = { ...this.viewState };
        Object.assign(this.viewState, updates);

        // Only notify if there's an actual change
        if (JSON.stringify(prevState) !== JSON.stringify(this.viewState)) {
            this.notify('view-state-changed', this.viewState);
        }
    }

    /**
     * Request a drill-in to a child canvas
     */
    requestDrillIn(childCanvasState) {
        childCanvasState.parentContext = {
            elementId: childCanvasState.sourceElementId,
            canvasId: this.canvasState.canvasId
        };
        this.notify('drill-in-requested', childCanvasState);
    }

    /**
     * Serialize the canvas state to JSON
     */
    serializeCanvas() {
        return JSON.stringify(this.canvasState);
    }

    /**
     * Save canvas state with debouncing
     */
    saveCanvas() {
        // Clear any pending saves
        clearTimeout(this.saveTimeout);

        // Set a new timeout for saving
        this.saveTimeout = setTimeout(() => {
            this._saveCanvas();
        }, this.debounceSaveDelay);

        // Also save immediately to local storage
        this.saveCanvasLocalOnly();
    }

    /**
     * Perform the actual canvas saving
     */
    async _saveCanvas() {
        this.saveCanvasLocalOnly();

        // Get auth token
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

            // Notify that save was successful
            this.notify('canvas-saved', { remote: true, success: true });
        } catch (error) {
            console.error(`Error saving canvas ${canvasId} to API:`, error);

            // Notify that save failed
            this.notify('canvas-saved', { remote: true, success: false, error });
        }
    }

    /**
     * Save canvas state to local storage only
     */
    saveCanvasLocalOnly() {
        try {
            localStorage.setItem("myCanvasData_" + this.canvasState.canvasId, this.serializeCanvas());

            // Notify that local save was successful
            this.notify('canvas-saved', { remote: false, success: true });
        } catch (error) {
            console.error("Error saving to local storage:", error);

            // Notify that local save failed
            this.notify('canvas-saved', { remote: false, success: false, error });
        }
    }

    /**
     * Set a backpack item
     */
    async setBackpackItem(key, val) {
        const token = this.getAuthToken();
        if (!token) {
            console.warn("No auth token found, skipping API save");
            return;
        }

        try {
            const response = await fetch(`https://c15r-parcland_backpack.web.val.run/parc.land/${key}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: val,
            });

            const result = await response.json();
            console.log(`Backpack item ${key} saved to API`, result);
            return result;
        } catch (error) {
            console.error(`Error saving backpack item ${key} to API:`, error);
            throw error;
        }
    }

    /**
     * Get a backpack item
     */
    async getBackpackItem(key) {
        const token = this.getAuthToken();
        if (!token) {
            console.warn("No auth token found, skipping API get");
            return null;
        }

        try {
            const response = await fetch(`https://c15r-parcland_backpack.web.val.run/parc.land/${key}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch item: ${response.status}`);
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error(`Error getting backpack item ${key} from API:`, error);
            return null;
        }
    }

    /**
     * Load canvas from API or local storage
     */
    async loadCanvas(canvasId) {
        const tokenKey = this.tokenKey;
        let token = localStorage.getItem(tokenKey);
        if (!token) {
            localStorage.setItem(tokenKey, "TBC");
            token = "TBC";
        }

        const savedLocal = localStorage.getItem("myCanvasData_" + canvasId);

        try {
            const namespace = "websim";
            const response = await fetch(`https://c15r-parcland_backpack.web.val.run/${namespace}/${canvasId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.canvasState = data;
                this.notify('canvas-loaded', { remote: true, success: true });
                return data;
            } else {
                console.warn("Failed to load from API, fallback local");

                if (savedLocal) {
                    try {
                        const localData = JSON.parse(savedLocal);
                        this.canvasState = localData;
                        this.notify('canvas-loaded', { remote: false, success: true });
                        return localData;
                    } catch (parseError) {
                        console.error("Error parsing local storage data:", parseError);

                        // Create a default state
                        const defaultState = {
                            canvasId,
                            elements: [],
                            edges: [],
                            versionHistory: []
                        };

                        this.canvasState = defaultState;
                        this.notify('canvas-loaded', { remote: false, success: false, error: parseError });
                        return defaultState;
                    }
                } else {
                    // Create a default state
                    const defaultState = {
                        canvasId,
                        elements: [],
                        edges: [],
                        versionHistory: []
                    };

                    this.canvasState = defaultState;
                    this.notify('canvas-loaded', { remote: false, success: false, error: new Error("No local data found") });
                    return defaultState;
                }
            }
        } catch (error) {
            console.error("Error loading from API", error);

            if (savedLocal) {
                try {
                    const localData = JSON.parse(savedLocal);
                    this.canvasState = localData;
                    this.notify('canvas-loaded', { remote: false, success: true });
                    return localData;
                } catch (parseError) {
                    console.error("Error parsing local storage data:", parseError);

                    // Create a default state
                    const defaultState = {
                        canvasId,
                        elements: [],
                        edges: [],
                        versionHistory: []
                    };

                    this.canvasState = defaultState;
                    this.notify('canvas-loaded', { remote: false, success: false, error: parseError });
                    return defaultState;
                }
            } else {
                // Create a default state
                const defaultState = {
                    canvasId,
                    elements: [],
                    edges: [],
                    versionHistory: []
                };

                this.canvasState = defaultState;
                this.notify('canvas-loaded', { remote: false, success: false, error });
                return defaultState;
            }
        }
    }

    /**
     * Get auth token
     */
    getAuthToken() {
        const key = this.tokenKey;
        let token = localStorage.getItem(key);
        if (!token) {
            localStorage.setItem(key, "TBC");
            token = "TBC";
        }
        return token;
    }

    /**
     * Generate content using AI
     */
    async generateContent(content, el) {
        const { type, id } = el;
        const edges = this.findEdgesByElementId(id).filter(e => e.target === id).map(e => ({
            label: e.label,
            el: this.findElementById(e.source)
        }));

        console.log("Relevant edges", edges);
        const token = this.getAuthToken();

        if (!token || token === 'TBC') {
            return await this.generateContentOld(content, type);
        }

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
  ${edges.map(e => `<relation><label>${e.label || "undefined"}</label><content>${e.el?.content || ""}</content></relation>`).join("\n")}
  </related-context>

  <current-content>
  ${content}
  </current-content>

  Respond only with valid json (do not wrap in code block) following the ApiResponse schema:

  <schema>
  interface ApiResponse {
    thoughts: string;
    result: string;
  }
  </schema>
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
                this.notify('content-generated', { success: true, elementId: id });
                return resp.result;
            } catch (e) {
                console.error("Failed to parse json response", e);
                this.notify('content-generated', { success: false, error: e, elementId: id });
                return null;
            }
        } catch (error) {
            console.error('Error fetching AI response:', error);
            this.notify('content-generated', { success: false, error, elementId: id });
            return null;
        }
    }

    /**
     * Legacy content generation method
     */
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
            this.notify('content-generated', { success: true, legacy: true });
            return data.result;
        } catch (error) {
            console.error('Error fetching AI response (old fallback):', error);
            this.notify('content-generated', { success: false, error, legacy: true });
            return null;
        }
    }

    /**
     * Regenerate an image
     */
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

            if (newImg && newImg.imageUrl) {
                this.updateElement(el.id, { src: newImg.imageUrl });
                this.saveCanvasLocalOnly();
                this.notify('image-regenerated', { success: true, elementId: el.id });
                return true;
            } else {
                this.notify('image-regenerated', { success: false, error: new Error("No image URL returned"), elementId: el.id });
                return false;
            }
        } catch (err) {
            console.error("Failed to regenerate image", err);
            this.notify('image-regenerated', { success: false, error: err, elementId: el.id });
            return false;
        }
    }

    /**
     * Add version history entry
     */
    addVersionHistoryEntry(description = "Canvas updated") {
        const entry = {
            timestamp: Date.now(),
            description,
            state: JSON.stringify(this.canvasState)
        };

        this.canvasState.versionHistory.push(entry);

        // Keep only the last 50 versions
        if (this.canvasState.versionHistory.length > 50) {
            this.canvasState.versionHistory = this.canvasState.versionHistory.slice(-50);
        }

        this.notify('version-added', entry);
    }

    /**
     * Restore from version history
     */
    restoreFromVersion(index) {
        if (!this.canvasState.versionHistory ||
            index < 0 ||
            index >= this.canvasState.versionHistory.length) {
            return false;
        }

        try {
            const versionEntry = this.canvasState.versionHistory[index];
            const restoredState = JSON.parse(versionEntry.state);

            // Save current state to history before restoring
            this.addVersionHistoryEntry("Before restore");

            // Update the canvas state
            this.canvasState.elements = restoredState.elements;
            this.canvasState.edges = restoredState.edges;

            // Keep the version history and canvasId
            restoredState.versionHistory = this.canvasState.versionHistory;
            restoredState.canvasId = this.canvasState.canvasId;

            this.canvasState = restoredState;

            // Notify that state was restored
            this.notify('version-restored', { index, timestamp: versionEntry.timestamp });

            return true;
        } catch (error) {
            console.error("Error restoring from version:", error);
            return false;
        }
    }

    /**
     * Get a copy of the canvas state
     */
    getCanvasState() {
        return JSON.parse(JSON.stringify(this.canvasState));
    }

    /**
     * Clean up resources when this manager is no longer needed
     */
    destroy() {
        // Clear any pending saves
        clearTimeout(this.saveTimeout);

        // Clear all listeners
        this.listeners.clear();

        // Clear references
        this.controller = null;
        this.parentStateManager = null;
        this.childCanvasElements.clear();
    }
}

// Export the class
export default StateManager;
