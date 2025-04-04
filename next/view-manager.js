// view-manager.js
class ViewManager {
    constructor(stateManager, domElements) {
        this.state = stateManager;
        this.container = domElements.container;
        this.edgesLayer = domElements.edgesLayer;
        this.canvas = domElements.canvas;

        // Constants for zoom limits
        this.MAX_SCALE = 10;
        this.MIN_SCALE = 0.1;

        // Subscribe to view state changes
        this.stateSubscriptions = [
            this.state.subscribe('view-state-changed', () => {
                this.updateCanvasTransform();
            })
        ];

        // Initialize from saved state if available
        this.loadLocalViewState();
    }

    /**
     * Load view state from local storage
     */
    loadLocalViewState() {
        try {
            const canvasId = this.state.canvasState.canvasId || "default";
            const key = "canvasViewState_" + canvasId;
            const saved = localStorage.getItem(key);

            if (saved) {
                const vs = JSON.parse(saved);
                this.state.setViewState({
                    scale: vs.scale || 1,
                    translateX: vs.translateX || 0,
                    translateY: vs.translateY || 0
                });
            }
        } catch (e) {
            console.warn("No local viewState found", e);
        }
    }

    /**
     * Save view state to local storage
     */
    saveLocalViewState() {
        try {
            const canvasId = this.state.canvasState.canvasId || "default";
            const key = "canvasViewState_" + canvasId;
            localStorage.setItem(key, JSON.stringify(this.state.viewState));
        } catch (e) {
            console.warn("Could not store local viewState", e);
        }
    }

    /**
     * Update canvas transform based on view state
     */
    updateCanvasTransform() {
        const { viewState } = this.state;

        // Update container transform
        this.container.style.transform = `translate(${viewState.translateX}px, ${viewState.translateY}px) scale(${viewState.scale})`;
        this.container.style.setProperty('--translateX', viewState.translateX);
        this.container.style.setProperty('--translateY', viewState.translateY);
        this.container.style.setProperty('--zoom', viewState.scale);

        // Get the canvas (visible) size
        const canvasRect = this.canvas.getBoundingClientRect();
        const W = canvasRect.width;
        const H = canvasRect.height;

        // Compute the visible region in canvas coordinates
        const visibleX = -viewState.translateX / viewState.scale;
        const visibleY = -viewState.translateY / viewState.scale;
        const visibleWidth = W / viewState.scale;
        const visibleHeight = H / viewState.scale;

        // Set the viewBox attribute on the SVG layer
        this.edgesLayer.setAttribute("viewBox", `${visibleX} ${visibleY} ${visibleWidth} ${visibleHeight}`);
    }

    /**
     * Convert screen coordinates to canvas coordinates
     */
    screenToCanvas(px, py) {
        const { viewState } = this.state;
        const canvasRect = this.canvas.getBoundingClientRect();
        const dx = px - canvasRect.left;
        const dy = py - canvasRect.top;

        return {
            x: (dx - viewState.translateX) / viewState.scale,
            y: (dy - viewState.translateY) / viewState.scale
        };
    }

    /**
     * Convert canvas coordinates to screen coordinates
     */
    canvasToScreen(cx, cy) {
        const { viewState } = this.state;
        const canvasRect = this.canvas.getBoundingClientRect();

        return {
            x: (cx * viewState.scale) + viewState.translateX + canvasRect.left,
            y: (cy * viewState.scale) + viewState.translateY + canvasRect.top
        };
    }

    /**
     * Pan the canvas by a delta amount
     */
    panCanvas(deltaX, deltaY) {
        const { viewState } = this.state;

        this.state.setViewState({
            translateX: viewState.translateX + deltaX,
            translateY: viewState.translateY + deltaY
        });

        this.saveLocalViewState();
    }

    /**
     * Zoom the canvas to a specific scale
     */
    zoomCanvas(newScale, zoomCenter) {
        const { viewState } = this.state;
        const oldScale = viewState.scale;

        // Clamp scale to limits
        newScale = Math.min(Math.max(newScale, this.MIN_SCALE), this.MAX_SCALE);

        // Calculate scale delta
        const scaleDelta = newScale - oldScale;

        // Update viewState with new scale and adjusted translation
        this.state.setViewState({
            scale: newScale,
            translateX: viewState.translateX - zoomCenter.x * scaleDelta,
            translateY: viewState.translateY - zoomCenter.y * scaleDelta
        });

        this.saveLocalViewState();
    }

    /**
     * Handle wheel zoom
     */
    handleWheelZoom(ev) {
        // Skip zoom if we're inside scrollable content
        if (ev.target.closest('.content')) {
            const content = ev.target.closest('.content');
            if (content.clientHeight !== content.scrollHeight) return;
        }

        const delta = -ev.deltaY;
        const zoomSpeed = 0.001;
        const prevScale = this.state.viewState.scale;
        const newScale = prevScale * (1 + delta * zoomSpeed);
        const zoomCenter = this.screenToCanvas(ev.clientX, ev.clientY);

        this.zoomCanvas(newScale, zoomCenter);
    }

    /**
     * Handle pinch zoom on the canvas
     */
    handlePinchZoom(initialScale, scaleFactor, pinchCenter) {
        const newScale = Math.min(Math.max(initialScale * scaleFactor, this.MIN_SCALE), this.MAX_SCALE);
        this.zoomCanvas(newScale, pinchCenter);
    }

    /**
     * Initialize canvas pan
     */
    startCanvasPan(clientX, clientY) {
        const { viewState } = this.state;
        return {
            initialTranslateX: viewState.translateX,
            initialTranslateY: viewState.translateY,
            startX: clientX,
            startY: clientY
        };
    }

    /**
     * Update canvas pan
     */
    updateCanvasPan(panState, clientX, clientY) {
        const dx = clientX - panState.startX;
        const dy = clientY - panState.startY;

        this.state.setViewState({
            translateX: panState.initialTranslateX + dx,
            translateY: panState.initialTranslateY + dy
        });
    }

    /**
     * Finish canvas pan
     */
    finishCanvasPan() {
        this.saveLocalViewState();
    }

    /**
     * Initialize canvas pinch
     */
    startCanvasPinch(touch1, touch2) {
        const { viewState } = this.state;
        const initialDistance = Math.hypot(touch2.x - touch1.x, touch2.y - touch1.y);
        const centerX = (touch1.x + touch2.x) / 2;
        const centerY = (touch1.y + touch2.y) / 2;
        const pinchCenterCanvas = this.screenToCanvas(centerX, centerY);

        return {
            initialScale: viewState.scale,
            initialDistance: initialDistance,
            pinchCenterScreen: { x: centerX, y: centerY },
            pinchCenterCanvas: pinchCenterCanvas
        };
    }

    /**
     * Update canvas pinch
     */
    updateCanvasPinch(pinchState, touch1, touch2) {
        const newDistance = Math.hypot(touch2.x - touch1.x, touch2.y - touch1.y);
        if (pinchState.initialDistance === 0) return;

        const scaleFactor = newDistance / pinchState.initialDistance;
        this.handlePinchZoom(
            pinchState.initialScale,
            scaleFactor,
            pinchState.pinchCenterCanvas
        );
    }

    /**
     * Set the canvas to a specific view state
     */
    setCanvasView(scale, translateX, translateY) {
        this.state.setViewState({ scale, translateX, translateY });
        this.saveLocalViewState();
    }

    /**
     * Reset the canvas view to default
     */
    resetCanvasView() {
        this.setCanvasView(1, 0, 0);
    }

    /**
     * Focus the canvas on a specific element
     */
    focusOnElement(elementId) {
        const element = this.state.findElementById(elementId);
        if (!element) return;

        const canvasRect = this.canvas.getBoundingClientRect();
        const centerX = canvasRect.width / 2;
        const centerY = canvasRect.height / 2;

        this.state.setViewState({
            translateX: centerX - (element.x * this.state.viewState.scale),
            translateY: centerY - (element.y * this.state.viewState.scale)
        });

        this.saveLocalViewState();
    }

    /**
     * Handle browser resize events
     */
    handleResize() {
        this.updateCanvasTransform();
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
export default ViewManager;