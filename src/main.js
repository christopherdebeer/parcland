// main.js - The entry point that initializes the canvas application

// Import all managers and controllers
import CanvasController from './canvas-controller.js';

// Registry to track active controllers
class ControllerRegistry {
    constructor() {
        this.activeController = null;
        this.controllers = new Map();
    }

    setActive(controller) {
        this.activeController = controller;
        window.activeCanvasController = controller; // For backward compatibility
    }

    getActive() {
        return this.activeController;
    }

    register(id, controller) {
        this.controllers.set(id, controller);
    }

    get(id) {
        return this.controllers.get(id);
    }
}

// Create the global registry
const controllerRegistry = new ControllerRegistry();


const getAuthToken = async () => {
    const tokenKey = "PARC.LAND/BKPK_TOKEN";
    const params = new URLSearchParams(window.location.search);
    const paramToken = params.get("token");

    let token = paramToken || localStorage.getItem(tokenKey);
    if (!token) {
        localStorage.setItem(tokenKey, "TBC");
        token = "TBC";
    }
    return token;
};

/**
 * Initialize the application
 */
async function initializeApplication() {
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const canvasId = params.get("canvas") || "canvas-002";
    const paramToken = params.get("token");

    // Create default canvas state
    let rootCanvasState = {
        canvasId: canvasId,
        elements: [],
        edges: [],
        versionHistory: []
    };

    // Load initial canvas data
    rootCanvasState = await loadInitialCanvas(rootCanvasState);

    // Create the root controller (without initialization)
    const rootController = new CanvasController(rootCanvasState);
    
    // Register and set as active BEFORE initialization
    controllerRegistry.register(rootCanvasState.canvasId, rootController);
    controllerRegistry.setActive(rootController);
    
    // Initialize the controller after setting it as active
    rootController.initialize();

    // Set up global event handlers
    window.addEventListener('resize', () => {
        const active = controllerRegistry.getActive();
        if (active) {
            active.viewManager.handleResize();
        }
    });

    // Handle history changes (back/forward)
    window.addEventListener('popstate', (event) => {
        const params = new URLSearchParams(window.location.search);
        const canvasId = params.get("canvas");

        if (canvasId) {
            const controller = controllerRegistry.get(canvasId);
            if (controller) {
                // Switch to this controller
                const active = controllerRegistry.getActive();
                if (active) {
                    active.detach();
                }
                controller.reattach();
                controllerRegistry.setActive(controller);
            } else {
                // Need to load this canvas
                loadCanvas(canvasId).then(canvasState => {
                    const newController = new CanvasController(canvasState);
                    controllerRegistry.register(canvasId, newController);
                    controllerRegistry.setActive(newController);
                    newController.initialize();
                });
            }
        }
    });
}

/**
 * Load initial canvas data
 */
async function loadInitialCanvas(defaultState) {
    const savedLocal = localStorage.getItem("myCanvasData_" + defaultState.canvasId);
    const token = await getAuthToken();
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

/**
 * Load a specific canvas by ID
 */
async function loadCanvas(canvasId) {
    // Create default canvas state
    let canvasState = {
        canvasId: canvasId,
        elements: [],
        edges: [],
        versionHistory: []
    };

    // Load the canvas data
    return await loadInitialCanvas(canvasState);
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApplication);

// Export registry for use by other modules
export { controllerRegistry };
