import type { ViewState, CanvasElement } from '../types';

/**
 * Manages viewport state and transformations.
 *
 * Provides:
 * - View state (scale, translate) management
 * - Coordinate transformations (screen ↔ canvas)
 * - Viewport persistence via localStorage
 * - Element recentering operations
 */
export class ViewportManager {
    private viewState: ViewState;
    private canvas: HTMLElement;
    private container: HTMLElement;
    private edgesLayer: SVGSVGElement;
    private canvasId: string;
    private findElementById: (id: string) => CanvasElement | undefined;
    private onTransformChange?: () => void;

    readonly MAX_SCALE: number = 10;
    readonly MIN_SCALE: number = 0.1;

    /**
     * Creates a new ViewportManager
     *
     * @param canvas - The canvas DOM element
     * @param container - The container DOM element for transforms
     * @param edgesLayer - The SVG layer for edges
     * @param canvasId - Canvas identifier for localStorage key
     * @param findElementById - Function to find elements by ID
     * @param initialViewState - Optional initial view state
     * @param onTransformChange - Optional callback when transform changes
     */
    constructor(
        canvas: HTMLElement,
        container: HTMLElement,
        edgesLayer: SVGSVGElement,
        canvasId: string,
        findElementById: (id: string) => CanvasElement | undefined,
        initialViewState?: ViewState,
        onTransformChange?: () => void
    ) {
        this.canvas = canvas;
        this.container = container;
        this.edgesLayer = edgesLayer;
        this.canvasId = canvasId;
        this.findElementById = findElementById;
        this.onTransformChange = onTransformChange;

        this.viewState = initialViewState || {
            scale: 1,
            translateX: 0,
            translateY: 0
        };

        // Load saved view state if available
        this.loadLocalViewState();
    }

    /**
     * Get current view state
     * IMPORTANT: Returns the actual mutable reference for backward compatibility.
     * External code may mutate viewState.translateX/Y/scale directly.
     * After mutating, call notifyViewStateChanged() to update the canvas.
     */
    getViewState(): ViewState {
        return this.viewState;
    }

    /**
     * Set view state
     */
    setViewState(state: Partial<ViewState>): void {
        this.viewState = {
            ...this.viewState,
            ...state
        };
        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    /**
     * Notify that viewState was mutated externally.
     * Call this after directly mutating viewState properties.
     */
    notifyViewStateChanged(): void {
        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    /**
     * Convert screen coordinates to canvas coordinates
     *
     * @param px - Screen X coordinate
     * @param py - Screen Y coordinate
     * @returns Canvas coordinates
     */
    screenToCanvas(px: number, py: number): { x: number; y: number } {
        const dx = px - this.canvas.offsetLeft;
        const dy = py - this.canvas.offsetTop;
        return {
            x: (dx - this.viewState.translateX) / this.viewState.scale,
            y: (dy - this.viewState.translateY) / this.viewState.scale
        };
    }

    /**
     * Recenter the viewport on a specific element
     *
     * @param elId - Element ID to center on
     */
    recenterOnElement(elId: string): void {
        const el = this.findElementById(elId);
        if (!el) {
            console.warn(`Element with ID "${elId}" not found.`);
            return;
        }

        // Compute the center of the element in canvas coordinates
        const scale = this.viewState.scale || 1;
        const elCenterX = el.x;
        const elCenterY = el.y;

        // Get canvas size in pixels
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasCenterX = canvasRect.width / 2;
        const canvasCenterY = canvasRect.height / 2;

        // Compute new translation to center the element
        this.viewState.translateX = canvasCenterX - (elCenterX * scale);
        this.viewState.translateY = canvasCenterY - (elCenterY * scale);

        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    /**
     * Load view state from localStorage
     */
    loadLocalViewState(): void {
        try {
            const key = "canvasViewState_" + this.canvasId;
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

    /**
     * Save view state to localStorage
     */
    saveLocalViewState(): void {
        try {
            const key = "canvasViewState_" + this.canvasId;
            localStorage.setItem(key, JSON.stringify(this.viewState));
        } catch (e) {
            console.warn("Could not store local viewState", e);
        }
    }

    /**
     * Update the canvas transform based on current view state
     */
    updateCanvasTransform(): void {
        // Apply transform to container
        this.container.style.transform = `translate(${this.viewState.translateX}px, ${this.viewState.translateY}px) scale(${this.viewState.scale})`;
        this.container.style.setProperty('--translateX', String(this.viewState.translateX));
        this.container.style.setProperty('--translateY', String(this.viewState.translateY));
        this.container.style.setProperty('--zoom', String(this.viewState.scale));

        // Get the canvas (visible) size
        const canvasRect = this.canvas.getBoundingClientRect();
        const W = canvasRect.width;
        const H = canvasRect.height;

        // Compute the visible region in canvas coordinates
        const visibleX = -this.viewState.translateX / this.viewState.scale;
        const visibleY = -this.viewState.translateY / this.viewState.scale;
        const visibleWidth = W / this.viewState.scale;
        const visibleHeight = H / this.viewState.scale;

        // Set the viewBox attribute on the SVG layer so that its coordinate system
        // matches the visible region
        this.edgesLayer.setAttribute(
            "viewBox",
            `${String(visibleX)} ${String(visibleY)} ${String(visibleWidth)} ${String(visibleHeight)}`
        );

        // Notify listeners of transform change
        if (this.onTransformChange) {
            this.onTransformChange();
        }
    }

    /**
     * Pan the viewport by delta amounts
     *
     * @param dx - Delta X in screen pixels
     * @param dy - Delta Y in screen pixels
     */
    pan(dx: number, dy: number): void {
        this.viewState.translateX += dx;
        this.viewState.translateY += dy;
        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    /**
     * Zoom the viewport
     *
     * @param scaleDelta - Amount to scale by (multiplier)
     * @param centerX - Optional X coordinate to zoom towards (screen coords)
     * @param centerY - Optional Y coordinate to zoom towards (screen coords)
     */
    zoom(scaleDelta: number, centerX?: number, centerY?: number): void {
        const newScale = Math.max(
            this.MIN_SCALE,
            Math.min(this.MAX_SCALE, this.viewState.scale * scaleDelta)
        );

        if (centerX !== undefined && centerY !== undefined) {
            // Zoom towards a specific point
            const canvasPt = this.screenToCanvas(centerX, centerY);
            this.viewState.scale = newScale;
            const newScreenPt = {
                x: canvasPt.x * newScale + this.viewState.translateX + this.canvas.offsetLeft,
                y: canvasPt.y * newScale + this.viewState.translateY + this.canvas.offsetTop
            };
            this.viewState.translateX += centerX - newScreenPt.x;
            this.viewState.translateY += centerY - newScreenPt.y;
        } else {
            // Simple zoom
            this.viewState.scale = newScale;
        }

        this.updateCanvasTransform();
        this.saveLocalViewState();
    }

    /**
     * Reset viewport to default state
     */
    reset(): void {
        this.viewState = {
            scale: 1,
            translateX: 0,
            translateY: 0
        };
        this.updateCanvasTransform();
        this.saveLocalViewState();
    }
}
