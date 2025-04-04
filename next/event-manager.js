// event-manager.js
class EventManager {
    constructor(stateManager, domElements, dependencies = {}) {
      this.state = stateManager;
      this.domElements = domElements;
      
      // Dependencies
      this.viewManager = dependencies.viewManager;
      this.elementManager = dependencies.elementManager;
      this.edgeManager = dependencies.edgeManager;
      this.uiManager = dependencies.uiManager;
      
      // Event state tracking
      this.lastTapTime = {};
      this.lastTapPosition = { x: 0, y: 0 };
      this.pointerDownHandlers = new Map();
      this.pointerMoveHandlers = new Map();
      this.pointerUpHandlers = new Map();
      
      // Gesture state
      this.activeGesture = null;
      this.initialTouches = [];
      this.tempEventHandlers = [];
      
      // Gesture data for current gesture
      this.gestureData = {
        dragStartPos: { x: 0, y: 0 },
        elementStartPos: { x: 0, y: 0 },
        elementStartSize: { width: 0, height: 0 },
        elementStartRotation: 0,
        centerForRotation: { x: 0, y: 0 },
        initialPinchDistance: 0,
        initialCanvasScale: 1,
        pinchCenterScreen: { x: 0, y: 0 },
        pinchCenterCanvas: { x: 0, y: 0 },
        activeEdgeCreation: null,
        initialTranslateX: 0,
        initialTranslateY: 0,
        elementPinchStartSize: { width: 0, height: 0 },
        elementPinchStartCenter: { x: 0, y: 0 },
        pinchCenterStartCanvas: { x: 0, y: 0 },
        addMenuTapPosX: 0,
        addMenuTapPosY: 0
      };
      
      // Edge creation handlers
      this.edgePointerMoveHandler = null;
      this.edgePointerUpHandler = null;
      
      // Constants
      this.DOUBLE_TAP_THRESHOLD = 300;
      this.TAP_MOVE_TOLERANCE = 10;
      
      // Subscribe to state changes
      this.stateSubscriptions = [
        this.state.subscribe('gesture-changed', (gesture) => {
          this.activeGesture = gesture;
        })
      ];
    }
    
    /**
     * Set up all event listeners
     */
    setupEventListeners() {
      const { canvas, container, staticContainer, edgesLayer, modeBtn, drillUpBtn, contextMenu } = this.domElements;
      
      // Canvas events
      canvas.addEventListener("pointerdown", this.onPointerDownCanvas.bind(this));
      canvas.addEventListener("pointermove", this.onPointerMoveCanvas.bind(this));
      canvas.addEventListener("pointerup", this.onPointerUpCanvas.bind(this));
      canvas.addEventListener("pointercancel", this.onPointerUpCanvas.bind(this));
      canvas.addEventListener("wheel", this.onWheelCanvas.bind(this));
      
      // Container events (elements)
      container.addEventListener("pointerdown", this.onPointerDownElement.bind(this));
      container.addEventListener("pointermove", this.onPointerMoveElement.bind(this));
      container.addEventListener("pointerup", this.onPointerUpElement.bind(this));
      container.addEventListener("pointercancel", this.onPointerUpElement.bind(this));
      
      // Static container events
      staticContainer.addEventListener("pointerdown", this.onPointerDownElement.bind(this));
      staticContainer.addEventListener("pointermove", this.onPointerMoveElement.bind(this));
      staticContainer.addEventListener("pointerup", this.onPointerUpElement.bind(this));
      staticContainer.addEventListener("pointercancel", this.onPointerUpElement.bind(this));
      
      // Edges layer events
      edgesLayer.addEventListener("pointerdown", this.blockPropagation.bind(this));
      edgesLayer.addEventListener("pointerup", this.onPointerUpEdgeLayer.bind(this));
      
      // Context menu should stop propagation
      contextMenu.addEventListener("pointerdown", (ev) => {
        console.log("contextMenu");
        ev.stopPropagation();
      });
      
      // Mode button
      modeBtn.onclick = (ev) => {
        ev.stopPropagation();
        const controller = this.state.getController();
        const newMode = (this.state.mode === 'direct') ? 'navigate' : 'direct';
        controller.switchMode(newMode);
      };
      
      // Drill up button
      if (drillUpBtn) {
        drillUpBtn.onclick = () => {
          const controller = this.state.getController();
          controller.drillUp();
        };
      }
      
      // Register handle event handlers
      this.registerHandleEventHandlers();
      
      // Window resize event
      window.addEventListener('resize', () => {
        this.viewManager.handleResize();
      });
      
      // Prevent default context menu
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
      });
    }
    
    /**
     * Register event handlers for element handles
     */
    registerHandleEventHandlers() {
      // Register event handler for resize handle
      this.state.notifyResizeHandlePointerDown = (ev) => {
        this.handleResizeHandlePointerDown(ev);
      };
      
      // Register event handler for scale handle
      this.state.notifyScaleHandlePointerDown = (ev) => {
        this.handleScaleHandlePointerDown(ev);
      };
      
      // Register event handler for reorder handle
      this.state.notifyReorderHandlePointerDown = (ev) => {
        this.handleReorderHandlePointerDown(ev);
      };
      
      // Register event handler for type handle
      this.state.notifyTypeHandlePointerDown = (ev) => {
        this.handleTypeHandlePointerDown(ev);
      };
      
      // Register event handler for rotate handle
      this.state.notifyRotateHandlePointerDown = (ev) => {
        this.handleRotateHandlePointerDown(ev);
      };
      
      // Register event handler for edge handle
      this.state.notifyEdgeHandlePointerDown = (ev) => {
        this.handleEdgeHandlePointerDown(ev);
      };
    }
    
    /**
     * Block event propagation
     */
    blockPropagation(ev) {
      console.log("[DEBUG] Blocking event propagation on", ev.target);
      ev.stopPropagation();
    }
    
    /**
     * Handle pointer down on canvas
     */
    onPointerDownCanvas(ev) {
      // Hide menus on pointer down
      this.uiManager.hideContextMenu();
      
      // If tap is not on a canvas element, deselect
      if (!ev.target.closest(".canvas-element") && this.state.selectedElementId) {
        this.state.clearSelection();
      }
      
      // Track touch for gesture recognition
      this.initialTouches.push({ id: ev.pointerId, x: ev.clientX, y: ev.clientY });
      
      if (this.initialTouches.length === 1 && !this.activeGesture) {
        // Start canvas pan gesture
        this.state.setActiveGesture("pan");
        this.gestureData.initialTranslateX = this.state.viewState.translateX;
        this.gestureData.initialTranslateY = this.state.viewState.translateY;
        this.domElements.canvas.setPointerCapture(ev.pointerId);
        this.gestureData.dragStartPos = { x: ev.clientX, y: ev.clientY };
      } else if (this.initialTouches.length === 2) {
        // Start pinch gesture
        const t1 = this.initialTouches[0];
        const t2 = this.initialTouches[1];
        this.gestureData.initialPinchDistance = Math.hypot(t2.x - t1.x, t2.y - t1.y);
        this.gestureData.pinchCenterScreen = { x: (t1.x + t2.x)/2, y: (t1.y + t2.y)/2 };
        this.gestureData.pinchCenterCanvas = this.viewManager.screenToCanvas(
          this.gestureData.pinchCenterScreen.x, 
          this.gestureData.pinchCenterScreen.y
        );
        
        if (this.state.mode === 'direct' && this.state.selectedElementId) {
          // Pinch to resize element
          this.state.setActiveGesture("pinch-element");
          const el = this.state.findElementById(this.state.selectedElementId);
          if (el) {
            this.gestureData.elementPinchStartSize = { width: el.width, height: el.height };
            this.gestureData.elementPinchStartCenter = { x: el.x, y: el.y };
            this.gestureData.pinchCenterStartCanvas = { 
              x: this.gestureData.pinchCenterCanvas.x, 
              y: this.gestureData.pinchCenterCanvas.y 
            };
          }
        } else {
          // Pinch to zoom canvas
          this.state.setActiveGesture("pinch-canvas");
          this.gestureData.initialCanvasScale = this.state.viewState.scale;
        }
      }
    }
    
    /**
     * Handle pointer move on canvas
     */
    onPointerMoveCanvas(ev) {
      if (!this.activeGesture) return;
      
      if (this.activeGesture === 'pan' && this.initialTouches.length === 1) {
        // Handle canvas panning
        const touch = this.initialTouches[0];
        if (touch.id === ev.pointerId) {
          const dx = ev.clientX - touch.x;
          const dy = ev.clientY - touch.y;
          
          this.state.setViewState({
            translateX: this.gestureData.initialTranslateX + dx,
            translateY: this.gestureData.initialTranslateY + dy
          });
          
          this.viewManager.saveLocalViewState();
        }
      } else if ((this.activeGesture === 'pinch-canvas' || this.activeGesture === 'pinch-element') && this.initialTouches.length === 2) {
        // Handle pinch gestures
        const tIndex = this.initialTouches.findIndex(t => t.id === ev.pointerId);
        if (tIndex !== -1) {
          this.initialTouches[tIndex].x = ev.clientX;
          this.initialTouches[tIndex].y = ev.clientY;
        }
        
        const [newT1, newT2] = this.initialTouches;
        const newDist = Math.hypot(newT2.x - newT1.x, newT2.y - newT1.y);
        
        if (this.gestureData.initialPinchDistance === 0) return;
        
        const scaleFactor = newDist / this.gestureData.initialPinchDistance;
        
        if (this.activeGesture === 'pinch-canvas') {
          // Pinch to zoom canvas
          this.viewManager.handlePinchZoom(
            this.gestureData.initialCanvasScale,
            scaleFactor,
            this.gestureData.pinchCenterCanvas
          );
        } else {
          // Pinch to resize element
          const el = this.state.findElementById(this.state.selectedElementId);
          if (el && el.static !== true) {
            const originalDx = this.gestureData.elementPinchStartCenter.x - this.gestureData.pinchCenterStartCanvas.x;
            const originalDy = this.gestureData.elementPinchStartCenter.y - this.gestureData.pinchCenterStartCanvas.y;
            const scaledDx = originalDx * scaleFactor;
            const scaledDy = originalDy * scaleFactor;
            
            this.state.updateElement(el.id, {
              x: this.gestureData.pinchCenterStartCanvas.x + scaledDx,
              y: this.gestureData.pinchCenterStartCanvas.y + scaledDy,
              width: this.gestureData.elementPinchStartSize.width * scaleFactor,
              height: this.gestureData.elementPinchStartSize.height * scaleFactor
            });
          }
        }
      }
    }
    
    /**
     * Handle pointer up on canvas
     */
    onPointerUpCanvas(ev) {
      if (ev.target.closest('.canvas-element')) return;
      
      if (this.activeGesture === "create-edge") {
        console.log("[DEBUG] Edge creation in progress exiting canvas pointer up handler");
        return;
      }
      
      console.log('onPointerUpCanvas(ev)', ev);
      this.onPointerUpDoubleTap(ev, 'canvas');
      
      // Clean up gesture state
      this.state.clearActiveGesture();
      this.initialTouches = [];
      
      // Switch back to navigate mode if in direct mode
      if (this.state.mode === 'direct') {
        const controller = this.state.getController();
        controller.switchMode("navigate");
      }
    }
    
    /**
     * Handle double tap detection
     */
    onPointerUpDoubleTap(ev, context, handler) {
      const now = Date.now();
      const tapX = ev.clientX;
      const tapY = ev.clientY;
      const lastTapTime = this.lastTapTime[context] || 0;
      const timeDiff = now - lastTapTime;
      const dist = Math.hypot(tapX - this.lastTapPosition.x, tapY - this.lastTapPosition.y);
      
      if (timeDiff < this.DOUBLE_TAP_THRESHOLD && dist < this.TAP_MOVE_TOLERANCE) {
        console.log("[DEBUG] Double tap detected");
        ev.stopPropagation();
        
        if (handler && typeof handler === 'function') {
          handler(ev, context);
        } else if (ev.target.closest("text")) {
          // Handle double tap on edge label
          const canvasPt = this.viewManager.screenToCanvas(tapX, tapY);
          console.log("[DEBUG] Double tap on edge label. Canvas coordinates:", canvasPt);
          this.handleEdgeLabelDoubleTap(ev, canvasPt);
        } else if (!ev.target.closest(".canvas-element")) {
          // Handle double tap on canvas background
          const canvasPt = this.viewManager.screenToCanvas(tapX, tapY);
          console.log("[DEBUG] Double tap on canvas background. Canvas coordinates:", canvasPt);
          this.handleCanvasDoubleTap(canvasPt);
        } else {
          // Handle double tap on canvas element
          if (this.state.mode === 'navigate') {
            const controller = this.state.getController();
            controller.switchMode("direct");
          } else {
            // Show context menu
            const rect = this.domElements.canvas.getBoundingClientRect();
            this.uiManager.buildContextMenu(this.state.selectedElementId);
            this.uiManager.showContextMenu(ev.clientX - rect.left, ev.clientY - rect.top);
          }
        }
      }
      
      this.lastTapTime[context] = now;
      this.lastTapPosition = { x: tapX, y: tapY };
    }
    
    /**
     * Handle double tap on canvas background
     */
    handleCanvasDoubleTap(canvasPt) {
      // Store the tap position for potential menu use
      this.gestureData.addMenuTapPosX = canvasPt.x;
      this.gestureData.addMenuTapPosY = canvasPt.y;
      
      // Quick create markdown content
      const c = prompt("Quick create markdown content?");
      if (c) {
        const controller = this.state.getController();
        controller.createNewElement(canvasPt.x, canvasPt.y, "markdown", c);
      }
    }
    
    /**
     * Handle double tap on edge label
     */
    handleEdgeLabelDoubleTap(ev, canvasPt) {
      const id = ev.target.dataset.id;
      if (id) {
        this.state.selectElement(id);
        const edge = this.state.findEdgeElementById(id);
        
        const controller = this.state.getController();
        const elId = controller.createNewElement(canvasPt.x, canvasPt.y, "edit-prompt", edge.label || "", false, {
          target: edge.id,
          property: "label",
        });
        
        controller.switchMode('direct');
        controller.createNewEdge(elId, edge.id, "Editing...", { meta: true });
      }
    }
    
    /**
     * Handle wheel event on canvas
     */
    onWheelCanvas(ev) {
      this.viewManager.handleWheelZoom(ev);
    }
    
    /**
     * Handle pointer down on element
     */
    onPointerDownElement(ev) {
      const target = ev.target;
      const targetEl = target.closest(".canvas-element");
      if (!targetEl) return;
      
      ev.stopPropagation();
      
      const isHandle = target.classList.contains("resize-handle") ||
                       target.classList.contains("rotate-handle") ||
                       target.classList.contains("reorder-handle") ||
                       target.classList.contains("scale-handle") ||
                       target.classList.contains("type-handle") ||
                       target.classList.contains("edge-handle");
      
      if (isHandle) return;
      
      const elementId = targetEl.dataset.elId;
      if (this.state.selectedElementId !== elementId) {
        this.state.selectElement(elementId);
      }
      
      this.gestureData.dragStartPos = { x: ev.clientX, y: ev.clientY };
      const el = this.state.findElementById(elementId);
      if (el) {
        this.gestureData.elementStartPos = { x: el.x, y: el.y };
      }
      
      if (this.state.mode !== 'direct') return;
      
      this.state.setActiveGesture("move-element");
    }
    
    /**
     * Handle pointer move on element
     */
    onPointerMoveElement(ev) {
      if (!this.activeGesture) return;
      
      if (this.activeGesture === "move-element") {
        ev.stopPropagation();
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el || el.static === true) return;
        
        const dx = ev.clientX - this.gestureData.dragStartPos.x;
        const dy = ev.clientY - this.gestureData.dragStartPos.y;
        
        const newX = this.gestureData.elementStartPos.x + (dx / this.state.viewState.scale);
        const newY = this.gestureData.elementStartPos.y + (dy / this.state.viewState.scale);
        
        this.state.updateElement(el.id, { x: newX, y: newY });
      }
      else if (this.activeGesture === "resize-element") {
        ev.stopPropagation();
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el || el.static === true) return;
        
        const dx = (ev.clientX - this.gestureData.dragStartPos.x) / this.state.viewState.scale;
        const dy = (ev.clientY - this.gestureData.dragStartPos.y) / this.state.viewState.scale;
        
        const newWidth = Math.max(20, this.gestureData.elementStartSize.width + dx);
        const newHeight = Math.max(20, this.gestureData.elementStartSize.height + dy);
        
        this.state.updateElement(el.id, { width: newWidth, height: newHeight });
      }
      else if (this.activeGesture === "scale-element") {
        ev.stopPropagation();
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el) return;
        
        const sensitivity = 0.5;
        const dx = (ev.clientX - this.gestureData.dragStartPos.x) / this.state.viewState.scale * sensitivity;
        const dy = (ev.clientY - this.gestureData.dragStartPos.y) / this.state.viewState.scale * sensitivity;
        
        const newScale = Math.max((dx + dy)/2, 0.2);
        this.state.updateElement(el.id, { scale: newScale });
      }
      else if (this.activeGesture === "reorder-element") {
        ev.stopPropagation();
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el) return;
        
        const dx = (ev.clientX - this.gestureData.dragStartPos.x) / this.state.viewState.scale;
        const dy = (ev.clientY - this.gestureData.dragStartPos.y) / this.state.viewState.scale;
        
        const lineLength = Math.sqrt(dx*dx + dy*dy);
        const scalingFactor = 0.1;
        const newZIndex = lineLength * scalingFactor;
        
        this.state.updateElement(el.id, { zIndex: newZIndex });
      }
      else if (this.activeGesture === "rotate-element") {
        ev.stopPropagation();
        const el = this.state.findElementById(this.state.selectedElementId);
        if (!el) return;
        
        const canvasPt = this.viewManager.screenToCanvas(ev.clientX, ev.clientY);
        const startCanvasPt = this.viewManager.screenToCanvas(
          this.gestureData.dragStartPos.x, 
          this.gestureData.dragStartPos.y
        );
        
        const v1x = startCanvasPt.x - this.gestureData.centerForRotation.x;
        const v1y = startCanvasPt.y - this.gestureData.centerForRotation.y;
        const v2x = canvasPt.x - this.gestureData.centerForRotation.x;
        const v2y = canvasPt.y - this.gestureData.centerForRotation.y;
        
        const a1 = Math.atan2(v1y, v1x);
        const a2 = Math.atan2(v2y, v2x);
        const da = a2 - a1;
        const deg = da * (180/Math.PI);
        
        const newRotation = this.gestureData.elementStartRotation + deg;
        this.state.updateElement(el.id, { rotation: newRotation });
      }
      else if (this.activeGesture === "create-edge") {
        ev.stopPropagation();
        
        if (this.gestureData.activeEdgeCreation && this.gestureData.activeEdgeCreation.tempLine) {
          const pt = this.viewManager.screenToCanvas(ev.clientX, ev.clientY);
          this.gestureData.activeEdgeCreation.tempLine.setAttribute("x2", pt.x);
          this.gestureData.activeEdgeCreation.tempLine.setAttribute("y2", pt.y);
        }
      }
    }
    
    /**
     * Handle pointer up on element
     */
    onPointerUpElement(ev) {
      if (this.activeGesture === "create-edge") {
        console.log("edge creation in progress exiting element pointer up handler");
        return;
      }
      
      console.log("onPointerUpElement(ev)", ev.target);
      this.onPointerUpDoubleTap(ev, 'element');
      
      if ([
        "move-element", "resize-element", "rotate-element",
        "reorder-element", "scale-element"
      ].includes(this.activeGesture)) {
        ev.stopPropagation();
        this.state.saveCanvas();
      }
      
      this.state.clearActiveGesture();
    }
    
    /**
     * Handle pointer up on edge layer
     */
    onPointerUpEdgeLayer(ev) {
      console.log("[DEBUG] Edges layer pointerup", ev.target.dataset.id, ev.target);
      const id = ev.target.dataset.id;
      if (id) {
        this.onPointerUpDoubleTap(ev, "edge", (ev) => {
          console.log(`[DEBUG] Double click on edge (label?)`, ev.target);
          this.state.selectElement(id);
          const edge = this.state.findEdgeElementById(ev.target.dataset.id);
          const canvasPt = this.viewManager.screenToCanvas(ev.clientX, ev.clientY);
          
          const controller = this.state.getController();
          const elId = controller.createNewElement(canvasPt.x, canvasPt.y, "edit-prompt", edge.label || "", false, {
            target: edge.id,
            property: "label",
          });
          
          controller.switchMode('direct');
          controller.createNewEdge(elId, edge.id, "Editing...", { meta: true });
        });
      }
    }
    
    /**
     * Handle resize handle pointer down
     */
    handleResizeHandlePointerDown(ev) {
      ev.stopPropagation();
      if (this.state.mode !== 'direct') return;
      
      const el = this.state.findElementById(this.state.selectedElementId);
      if (!el || el.static === true) return;
      
      this.state.setActiveGesture("resize-element");
      this.domElements.container.setPointerCapture(ev.pointerId);
      this.gestureData.dragStartPos = { x: ev.clientX, y: ev.clientY };
      this.gestureData.elementStartSize = { width: el.width, height: el.height };
      this.gestureData.elementStartPos = { x: el.x, y: el.y };
    }
    
    /**
     * Handle scale handle pointer down
     */
    handleScaleHandlePointerDown(ev) {
      ev.stopPropagation();
      if (this.state.mode !== 'direct') return;
      
      const el = this.state.findElementById(this.state.selectedElementId);
      if (!el) return;
      
      this.state.setActiveGesture("scale-element");
      this.domElements.container.setPointerCapture(ev.pointerId);
      this.gestureData.dragStartPos = { x: ev.clientX, y: ev.clientY };
      this.gestureData.elementStartSize = { width: el.width, height: el.height };
      this.gestureData.elementStartPos = { x: el.x, y: el.y };
    }
    
    /**
     * Handle reorder handle pointer down
     */
    handleReorderHandlePointerDown(ev) {
      ev.stopPropagation();
      if (this.state.mode !== 'direct') return;
      
      const el = this.state.findElementById(this.state.selectedElementId);
      if (!el) return;
      
      this.state.setActiveGesture("reorder-element");
      this.domElements.container.setPointerCapture(ev.pointerId);
      this.gestureData.dragStartPos = { x: ev.clientX, y: ev.clientY };
      this.gestureData.elementStartSize = { width: el.width, height: el.height };
      this.gestureData.elementStartPos = { x: el.x, y: el.y };
    }
    
    /**
     * Handle type handle pointer down
     */
    handleTypeHandlePointerDown(ev) {
      ev.stopPropagation();
      if (this.state.mode !== 'direct') return;
      if (!this.state.selectedElementId) return;
      
      const rect = this.domElements.canvas.getBoundingClientRect();
      this.uiManager.buildContextMenu(this.state.selectedElementId);
      this.uiManager.showContextMenu(ev.clientX - rect.left, ev.clientY - rect.top);
    }
    
    /**
     * Handle rotate handle pointer down
     */
    handleRotateHandlePointerDown(ev) {
      ev.stopPropagation();
      if (this.state.mode !== 'direct') return;
      
      const el = this.state.findElementById(this.state.selectedElementId);
      if (!el) return;
      
      this.state.setActiveGesture("rotate-element");
      this.domElements.container.setPointerCapture(ev.pointerId);
      this.gestureData.elementStartRotation = el.rotation || 0;
      this.gestureData.centerForRotation = {
        x: el.x,
        y: el.y
      };
      this.gestureData.dragStartPos = { x: ev.clientX, y: ev.clientY };
    }
    
    /**
     * Handle edge handle pointer down
     */
    handleEdgeHandlePointerDown(ev) {
      ev.stopPropagation();
      if (this.state.mode !== 'direct') return;
      if (!this.state.selectedElementId) return;

      console.log("starting edge creation...");

      // Start the edge creation gesture
      this.state.setActiveGesture("create-edge");

      // Create the temp line for edge creation
      const sourceId = this.state.selectedElementId;
      const sourceEl = this.state.findElementById(sourceId);

      if (sourceEl) {
        // Create a temporary dashed line element
        const tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tempLine.setAttribute("stroke", "blue");
        tempLine.setAttribute("stroke-width", "4");
        tempLine.setAttribute("stroke-dasharray", "5,5");
        tempLine.setAttribute("x1", sourceEl.x);
        tempLine.setAttribute("y1", sourceEl.y);
        tempLine.setAttribute("x2", sourceEl.x);
        tempLine.setAttribute("y2", sourceEl.y);

        this.gestureData.activeEdgeCreation = { sourceId, tempLine };
        this.domElements.edgesLayer.appendChild(tempLine);
      }

      // Add global pointermove and pointerup listeners for the edge gesture
      this.edgePointerMoveHandler = this.onEdgePointerMove.bind(this);
      this.edgePointerUpHandler = this.onEdgePointerUp.bind(this);

      document.addEventListener("pointermove", this.edgePointerMoveHandler);
      document.addEventListener("pointerup", this.edgePointerUpHandler);

      // Track temporary event handlers for cleanup
      this.tempEventHandlers.push(
        { type: "pointermove", fn: this.edgePointerMoveHandler },
        { type: "pointerup", fn: this.edgePointerUpHandler }
      );
    }

    /**
     * Handle edge pointer move
     */
    onEdgePointerMove(ev) {
      if (this.activeGesture !== "create-edge" || !this.gestureData.activeEdgeCreation) return;

      const pt = this.viewManager.screenToCanvas(ev.clientX, ev.clientY);
      this.gestureData.activeEdgeCreation.tempLine.setAttribute("x2", pt.x);
      this.gestureData.activeEdgeCreation.tempLine.setAttribute("y2", pt.y);
    }

    /**
     * Handle edge pointer up
     */
    onEdgePointerUp(ev) {
      if (this.activeGesture !== "create-edge" || !this.gestureData.activeEdgeCreation) return;

      const targetEl = document.elementFromPoint(ev.clientX, ev.clientY);
      let targetElement = targetEl && targetEl.closest(".canvas-element");

      if (targetElement) {
        const targetId = targetElement.dataset.elId;
        if (targetId && targetId !== this.gestureData.activeEdgeCreation.sourceId) {
          const controller = this.state.getController();
          controller.createNewEdge(this.gestureData.activeEdgeCreation.sourceId, targetId, "");
        }
      }

      // Clean up edge creation
      if (this.gestureData.activeEdgeCreation.tempLine) {
        this.gestureData.activeEdgeCreation.tempLine.remove();
      }
      this.gestureData.activeEdgeCreation = null;
      this.state.clearActiveGesture();

      // Remove temporary event handlers
      document.removeEventListener("pointermove", this.edgePointerMoveHandler);
      document.removeEventListener("pointerup", this.edgePointerUpHandler);

      // Update view
      this.state.renderElements();
      this.state.saveCanvas();
    }
}
