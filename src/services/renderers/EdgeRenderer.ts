import type { Edge, CanvasElement } from '../../types.ts';

/**
 * EdgeRenderer
 *
 * Handles rendering of edges (connections between elements) to SVG.
 * Responsible for:
 * - SVG line management
 * - Arrowhead markers
 * - Edge label positioning
 * - Edge intersection calculations
 */
export class EdgeRenderer {
    private edgeNodesMap: Record<string, SVGLineElement>;
    private edgeLabelNodesMap: Record<string, SVGTextElement>;
    private edgesLayer: SVGSVGElement;
    private controller: any; // Reference to CanvasController for state access

    constructor(edgesLayer: SVGSVGElement, controller: any) {
        this.edgeNodesMap = {};
        this.edgeLabelNodesMap = {};
        this.edgesLayer = edgesLayer;
        this.controller = controller;
    }

    /**
     * Render all edges in the canvas state
     */
    renderEdges(edges: Edge[]): void {
        // Ensure SVG marker for arrowheads exists
        this.ensureArrowheadMarker();

        // Render each edge
        edges.forEach(edge => {
            let line = this.edgeNodesMap[edge.id];
            if (!line) {
                line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                line.setAttribute("stroke", edge.style?.color || "#ccc");
                line.setAttribute("stroke-width", edge.style?.thickness || "2");
                line.setAttribute("marker-end", "url(#arrowhead)");
                this.edgeNodesMap[edge.id] = line;
                this.edgesLayer.appendChild(line);
            }
            this.updateEdgePosition(edge, line);
        });

        // Remove orphaned edge lines
        Object.keys(this.edgeNodesMap).forEach(edgeId => {
            if (!edges.find(e => e.id === edgeId)) {
                console.log(`[DEBUG] Deleting orphaned edge node`, edgeId, this.edgeNodesMap[edgeId]);
                this.edgeNodesMap[edgeId].remove();
                delete this.edgeNodesMap[edgeId];
            }
        });

        // Remove orphaned edge labels
        Object.keys(this.edgeLabelNodesMap).forEach(edgeId => {
            if (!edges.find(e => e.id === edgeId)) {
                console.log(`[DEBUG] Deleting orphaned edge label`, edgeId, this.edgeLabelNodesMap[edgeId]);
                this.edgeLabelNodesMap[edgeId].remove();
                delete this.edgeLabelNodesMap[edgeId];
            }
        });
    }

    /**
     * Ensure the SVG arrowhead marker exists
     */
    private ensureArrowheadMarker(): void {
        let defs = this.edgesLayer.querySelector("defs");
        if (!defs) {
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            this.edgesLayer.prepend(defs);
        }
        if (!defs.querySelector("#arrowhead")) {
            const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
            marker.setAttribute("id", "arrowhead");
            marker.setAttribute("markerWidth", "10");
            marker.setAttribute("markerHeight", "7");
            marker.setAttribute("refX", "10");
            marker.setAttribute("refY", "3.5");
            marker.setAttribute("orient", "auto");
            const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            arrowPath.setAttribute("d", "M0,0 L0,7 L10,3.5 Z");
            arrowPath.setAttribute("fill", "#ccc");
            marker.appendChild(arrowPath);
            defs.appendChild(marker);
        }
    }

    /**
     * Update the position of an edge line and label
     */
    private updateEdgePosition(edge: Edge, line: SVGLineElement): void {
        if (!line) return;

        const sourceEl = this.controller.findElementById(edge.source);
        const targetEl = this.controller.findElementById(edge.target);
        const sourceEdge = sourceEl ? null : this.controller.findEdgeElementById(edge.source);
        const targetEdge = targetEl ? null : this.controller.findEdgeElementById(edge.target);

        let sourcePoint, targetPoint;
        if ((sourceEl || sourceEdge) && (targetEl || targetEdge)) {
            sourcePoint = this.controller.computeIntersection(
                sourceEl || {
                    x: parseFloat(this.edgeLabelNodesMap[edge.source]?.getAttribute("x") || "0"),
                    y: parseFloat(this.edgeLabelNodesMap[edge.source]?.getAttribute("y") || "0")
                },
                targetEl || {
                    x: parseFloat(this.edgeLabelNodesMap[edge.target]?.getAttribute("x") || "0"),
                    y: parseFloat(this.edgeLabelNodesMap[edge.target]?.getAttribute("y") || "0")
                }
            );
            targetPoint = this.controller.computeIntersection(
                targetEl || {
                    x: parseFloat(this.edgeLabelNodesMap[edge.target]?.getAttribute("x") || "0"),
                    y: parseFloat(this.edgeLabelNodesMap[edge.target]?.getAttribute("y") || "0")
                },
                sourceEl || {
                    x: parseFloat(this.edgeLabelNodesMap[edge.source]?.getAttribute("x") || "0"),
                    y: parseFloat(this.edgeLabelNodesMap[edge.source]?.getAttribute("y") || "0")
                }
            );
        }

        if (sourcePoint && targetPoint) {
            line.setAttribute("x1", String(sourcePoint.x));
            line.setAttribute("y1", String(sourcePoint.y));
            line.setAttribute("x2", String(targetPoint.x));
            line.setAttribute("y2", String(targetPoint.y));
            line.setAttribute("stroke-dasharray", edge.data?.meta ? "5,5" : edge.style?.dash || "");

            // Handle edge label
            const labelText = edge.label ? edge.label : "Edge";
            let textEl = this.edgeLabelNodesMap[edge.id];
            if (!textEl) {
                textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
                textEl.setAttribute("text-anchor", "middle");
                textEl.setAttribute("data-id", edge.id);
                textEl.setAttribute("alignment-baseline", "middle");
                textEl.setAttribute("fill", "#000");
                textEl.style.fontSize = "12px";
                if (this.controller.selectedElementId === edge.id) {
                    textEl.style.fill = "red";
                }
                this.edgeLabelNodesMap[edge.id] = textEl;
                this.edgesLayer.appendChild(textEl);
            }
            // Calculate midpoint of the line
            const midX = (sourcePoint.x + targetPoint.x) / 2;
            const midY = (sourcePoint.y + targetPoint.y) / 2;
            textEl.setAttribute("x", String(midX));
            textEl.setAttribute("y", String(midY));
            textEl.textContent = labelText;
        } else {
            // If source or target missing, remove the edge
            this.controller.canvasState.edges = this.controller.canvasState.edges.filter(ed => ed.id !== edge.id);
            line.remove();
        }
    }

    /**
     * Get the edge nodes map (for external access)
     */
    getEdgeNodesMap(): Record<string, SVGLineElement> {
        return this.edgeNodesMap;
    }

    /**
     * Get the edge label nodes map (for external access)
     */
    getEdgeLabelNodesMap(): Record<string, SVGTextElement> {
        return this.edgeLabelNodesMap;
    }
}
