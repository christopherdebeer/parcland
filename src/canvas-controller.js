// canvas-controller.js
import StateManager from './state-manager.js';
import ViewManager from './view-manager.js';
import ElementManager from './element-manager.js';
import EdgeManager from './edge-manager.js';
import EventManager from './event-manager.js';
import UIManager from './ui-manager.js';
import { controllerRegistry } from './main.js';

/**
 * Main controller that coordinates all modules
 */
class CanvasController {
  constructor(canvasState, parentController = null) {
    this.parentController = parentController;
    this.childControllers = new Map(); // Track child canvas controllers
    this.canvasState = canvasState;
  }
  initialize() {
    // Initialize DOM elements
    this.domElements = this.initializeDomElements();
    
    // Initialize state manager
    this.stateManager = new StateManager(this.canvasState, this.parentController?.stateManager);
    this.stateManager.setController(this);
    
    // Initialize view manager
    this.viewManager = new ViewManager(this.stateManager, this.domElements);
    
    // Setup initial dependencies object
    const dependencies = {
      viewManager: this.viewManager
    };
    
    // Initialize element manager with initial dependencies
    this.elementManager = new ElementManager(this.stateManager, this.domElements, dependencies);
    
    // Add element manager to dependencies
    dependencies.elementManager = this.elementManager;
    
    // Initialize edge manager with updated dependencies
    this.edgeManager = new EdgeManager(this.stateManager, this.domElements, dependencies);
    
    // Add edge manager to dependencies
    dependencies.edgeManager = this.edgeManager;
    
    // Initialize UI manager with updated dependencies
    this.uiManager = new UIManager(this.stateManager, this.domElements, dependencies);
    
    // Add UI manager to dependencies
    dependencies.uiManager = this.uiManager;
    
    // Initialize event manager with all dependencies
    this.eventManager = new EventManager(this.stateManager, this.domElements, dependencies);
    
    // Set up state manager subscriptions
    this.setupStateSubscriptions();
    
    // Initialize the canvas
    this.init();
    
  }
  
  /**
   * Initialize DOM elements
   */
  initializeDomElements() {
    return {
      canvas: document.getElementById("canvas"),
      container: document.getElementById("canvas-container"),
      staticContainer: document.getElementById("static-container"),
      contextMenu: document.getElementById("context-menu"),
      modeBtn: document.getElementById("mode"),
      editModal: document.getElementById("edit-modal"),
      drillUpBtn: document.getElementById("drillUp"),
      edgesLayer: document.getElementById("edges-layer"),
      editorContentContainer: document.getElementById("editor-content"),
      editorSrcContainer: document.getElementById("editor-src"),
      modalCancelBtn: document.getElementById("modal-cancel"),
      modalSaveBtn: document.getElementById("modal-save"),
      modalGenerateBtn: document.getElementById("modal-generate"),
      modalVersionsPrevBtn: document.getElementById("versions-prev"),
      modalVersionsNextBtn: document.getElementById("versions-next"),
      modalVersionsInfo: document.getElementById("versions-info"),
      modalError: document.getElementById("modal-error")
    };
  }
  
  /**
   * Set up state manager subscriptions
   */
  setupStateSubscriptions() {
    // Subscribe to drill-in requests
    this.stateSubscriptions = [
      this.stateManager.subscribe('drill-in-requested', (childCanvasState) => {
        this.drillIntoChildCanvas(childCanvasState);
      })
    ];
  }
  
  /**
   * Initialize the canvas
   */
  init() {
    // Display drill-up button if we have a parent
    if (this.parentController) {
      this.domElements.drillUpBtn.style.display = 'block';
      this.domElements.drillUpBtn.onclick = () => this.drillUp();
    } else {
      this.domElements.drillUpBtn.style.display = 'none';
    }
    
    // Set up mode button
    this.domElements.modeBtn.onclick = (ev) => {
      ev.stopPropagation();
      const newMode = (this.stateManager.mode === 'direct') ? 'navigate' : 'direct';
      this.switchMode(newMode);
    };
    
    // Set default mode
    this.switchMode('navigate');
    
    // Initialize view state
    this.viewManager.updateCanvasTransform();
    
    // Set up event listeners
    this.eventManager.setupEventListeners();
    
    // Render the canvas
    this.renderAll();
  }
  
  /**
   * Render all elements and edges
   */
  renderAll() {
    this.elementManager.renderElements();
    this.edgeManager.renderEdges();
  }
  
  /**
   * Switch between direct and navigate modes
   */
  switchMode(mode) {
    this.stateManager.mode = mode;
    this.domElements.canvas.setAttribute("mode", mode);
    this.domElements.modeBtn.innerHTML = `<i class="fa-solid fa-${
      mode === 'direct' ? 'hand' : 'arrows-alt'
    }"></i> ${mode}`;
  }
  
  /**
   * Detach this controller (hide canvas)
   */
  detach() {
    this.domElements.canvas.style.display = 'none';
  }
  
  /**
   * Reattach this controller (show canvas)
   */
  reattach() {
    this.domElements.canvas.style.display = 'block';
    this.viewManager.updateCanvasTransform();
    this.renderAll();
  }
  
  /**
   * Drill into a child canvas
   */
  drillIntoChildCanvas(childCanvasState) {
    // Add parent element reference
    childCanvasState.parentElementId = childCanvasState.sourceElementId;

    const childController = new CanvasController(childCanvasState, this);
    this.childControllers.set(childCanvasState.canvasId, childController);

    // Initialize the child controller
    childController.initialize();

    // Properly position child canvas
    const parentElement = this.findElementById(childCanvasState.parentElementId);
    if (parentElement) {
      childController.viewManager.setInitialTransform({
        x: parentElement.x,
        y: parentElement.y,
        scale: this.viewManager.viewState.scale
      });
    }

    this.detach();
    controllerRegistry.setActive(childController);
    window.history.pushState({}, "", "?canvas=" + childCanvasState.canvasId);
  }
  
  /**
   * Check if element contains child canvas
   */
  hasChildCanvas(elementId) {
    return this.childControllers.has(elementId);
  }

  /**
   * Drill up to parent canvas
   */
  drillUp() {
    if (this.parentController) {
      this.detach();
      controllerRegistry.setActive(this.parentController);
      this.parentController.reattach();
      window.history.pushState({}, "", "?canvas=" + this.parentController.stateManager.canvasState.canvasId);
    }
  }
  
  /**
   * Create a new element
   */
  createNewElement(x, y, type = 'markdown', content = '', isCanvasContainer = false, data = {}) {
    return this.elementManager.createNewElement(x, y, type, content, isCanvasContainer, data);
  }
  
  /**
   * Create a new edge
   */
  createNewEdge(sourceId, targetId, label, data = {}, style = {}) {
    return this.edgeManager.createNewEdge(sourceId, targetId, label, data, style);
  }
  
  /**
   * Save the canvas
   */
  saveCanvas() {
    this.stateManager.saveCanvas();
  }
  
  /**
   * Select an element
   */
  selectElement(id) {
    this.stateManager.selectElement(id);
  }
  
  /**
   * Find an element by ID
   */
  findElementById(id) {
    return this.stateManager.findElementById(id);
  }
  
  /**
   * Find an edge by ID
   */
  findEdgeElementById(id) {
    return this.stateManager.findEdgeElementById(id);
  }
  
  /**
   * Screen coordinates to canvas coordinates
   */
  screenToCanvas(x, y) {
    return this.viewManager.screenToCanvas(x, y);
  }
  
  /**
   * Open edit modal for an element
   */
  openEditModal(el) {
    this.uiManager.openEditModal(el);
  }
  
  /**
   * Show context menu for an element
   */
  showContextMenu(x, y, elementId) {
    this.uiManager.showContextMenu(x, y, elementId);
  }
  
  /**
   * Hide context menu
   */
  hideContextMenu() {
    this.uiManager.hideContextMenu();
  }
  
  /**
   * Generate content for an element
   */
  async generateContent(content, el) {
    return this.stateManager.generateContent(content, el);
  }
  
  /**
   * Regenerate an image
   */
  regenerateImage(el) {
    this.stateManager.regenerateImage(el);
  }
  
  /**
   * Destroy this controller and clean up resources
   */
  destroy() {
    // Clean up subscriptions
    this.stateSubscriptions.forEach(unsubscribe => unsubscribe());
    
    // Clean up child controllers
    this.childControllers.forEach(controller => controller.destroy());
    this.childControllers.clear();

    // Clean up managers
    this.eventManager.destroy();
    this.uiManager.destroy();
    this.edgeManager.destroy();
    this.elementManager.destroy();
    this.viewManager.destroy();
    
    // Unregister this controller
    controllerRegistry.controllers.delete(this.stateManager.canvasState.canvasId);
  }
}

export default CanvasController;
