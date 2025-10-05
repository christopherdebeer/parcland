import type { CanvasState } from '../../types.ts';
import { ElementRenderer } from './ElementRenderer.ts';
import { EdgeRenderer } from './EdgeRenderer.ts';

/**
 * RenderingPipeline
 *
 * Orchestrates the rendering of all canvas elements, edges, and selection UI.
 * Provides a unified interface for triggering renders and manages the rendering lifecycle.
 *
 * Features:
 * - Batched rendering (queued renders execute on next frame)
 * - Separate renderers for elements and edges
 * - Clear separation between rendering and state management
 */
export class RenderingPipeline {
    private elementRenderer: ElementRenderer;
    private edgeRenderer: EdgeRenderer;
    private controller: any; // Reference to CanvasController
    private _renderQueued: boolean = false;
    private _edgesQueued: boolean = false;

    constructor(
        elementRenderer: ElementRenderer,
        edgeRenderer: EdgeRenderer,
        controller: any
    ) {
        this.elementRenderer = elementRenderer;
        this.edgeRenderer = edgeRenderer;
        this.controller = controller;
    }

    /**
     * Request a full render of elements (batched via requestAnimationFrame)
     */
    requestRender(): void {
        if (this._renderQueued) return;
        this._renderQueued = true;
        requestAnimationFrame(() => {
            this._renderQueued = false;
            this.renderElementsImmediately();
        });
    }

    /**
     * Request an edge update (batched via requestAnimationFrame)
     */
    requestEdgeUpdate(): void {
        if (this._edgesQueued) return;
        this._edgesQueued = true;
        requestAnimationFrame(() => {
            this._edgesQueued = false;
            this.renderEdgesImmediately();
        });
    }

    /**
     * Render elements immediately (synchronous)
     */
    renderElementsImmediately(): void {
        if ((this.controller.canvas as any).controller !== this.controller) return;
        console.log(`requestRender()`);

        const canvasState: CanvasState = this.controller.canvasState;
        const selectedIds: Set<string> = this.controller.selectedElementIds;

        // Delegate to ElementRenderer
        this.elementRenderer.renderElements(canvasState.elements, selectedIds);

        // Update selection group box
        this.controller.selectionManager.updateGroupBox();

        // Trigger edge update after elements render
        this.requestEdgeUpdate();
    }

    /**
     * Render edges immediately (synchronous)
     */
    renderEdgesImmediately(): void {
        const canvasState: CanvasState = this.controller.canvasState;

        // Delegate to EdgeRenderer
        this.edgeRenderer.renderEdges(canvasState.edges);
    }

    /**
     * Get the element renderer instance
     */
    getElementRenderer(): ElementRenderer {
        return this.elementRenderer;
    }

    /**
     * Get the edge renderer instance
     */
    getEdgeRenderer(): EdgeRenderer {
        return this.edgeRenderer;
    }
}
