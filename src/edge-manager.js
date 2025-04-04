// edge-manager.js
class EdgeManager {
    constructor(stateManager, domElements, dependencies = {}) {
        this.state = stateManager;
        this.edgesLayer = domElements.edgesLayer;
        this.viewManager = dependencies.viewManager;
        this.elementManager = dependencies.elementManager;

        this.tempEdgeElements = new Map();

        // Subscribe to relevant state changes
        this.stateSubscriptions = [
            this.state.subscribe('edge-added', (edge) => {
                this.renderSingleEdge(edge);
            }),
            this.state.subscribe('edge-updated', (data) => {
                this.updateEdgeById(data.id, data.edge);
            }),
            this.state.subscribe('edge-removed', (id) => {
                this.removeEdgeFromDOM(id);
            }),
            this.state.subscribe('element-updated', () => {
                // Elements moved/resized, update connected edges
                this.renderEdges();
            }),
            this.state.subscribe('view-state-changed', () => {
                // View changed, update edges
                this.renderEdges();
            })
        ];
    }

    /**
     * Set up SVG markers for edges
     */
    setupArrowheadMarker() {
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
     * Render all edges
     */
    renderEdges() {
        console.log("renderEdges()");

        // Ensure arrowhead marker exists
        this.setupArrowheadMarker();

        // Render each edge
        this.state.edges.forEach(edge => {
            this.renderSingleEdge(edge);
        });

        // Remove orphaned edges
        this.cleanupOrphanedEdges();
    }

    /**
     * Render a single edge
     */
    renderSingleEdge(edge) {
        const { edgeNodesMap } = this.state;

        // Get or create the line element
        let line = edgeNodesMap[edge.id];
        if (!line) {
            line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("stroke", edge.style?.color || "#ccc");
            line.setAttribute("stroke-width", edge.style?.thickness || "2");
            line.setAttribute("marker-end", "url(#arrowhead)");

            edgeNodesMap[edge.id] = line;
            this.edgesLayer.appendChild(line);
        }

        // Update edge position
        this.updateEdgePosition(edge, line);
    }

    /**
     * Update edge by ID
     */
    updateEdgeById(id, edge) {
        const line = this.state.edgeNodesMap[id];
        if (line) {
            line.setAttribute("stroke", edge.style?.color || "#ccc");
            line.setAttribute("stroke-width", edge.style?.thickness || "2");
            line.setAttribute("stroke-dasharray", edge.data?.meta ? "5,5" : edge.style?.dash || "");

            this.updateEdgePosition(edge, line);
        }
    }

    /**
     * Update edge position
     */
    updateEdgePosition(edge, line) {
        if (!line) return;

        const sourceEl = this.state.findElementById(edge.source);
        const targetEl = this.state.findElementById(edge.target);
        const sourceEdge = sourceEl ? null : this.state.findEdgeElementById(edge.source);
        const targetEdge = targetEl ? null : this.state.findEdgeElementById(edge.target);

        // Get edge label coordinates if we have them
        const edgeLabelNodesMap = this.state.edgeLabelNodesMap || {};

        let sourcePoint, targetPoint;
        if ((sourceEl || sourceEdge) && (targetEl || targetEdge)) {
            // Compute intersection points
            if (sourceEl && targetEl) {
                // Element to element connection
                sourcePoint = this.computeIntersection(sourceEl, targetEl);
                targetPoint = this.computeIntersection(targetEl, sourceEl);
            } else if (sourceEl && targetEdge) {
                // Element to edge connection
                const targetEdgeLabel = edgeLabelNodesMap[edge.target];
                if (targetEdgeLabel) {
                    sourcePoint = this.computeIntersection(sourceEl, {
                        x: parseFloat(targetEdgeLabel.getAttribute("x")),
                        y: parseFloat(targetEdgeLabel.getAttribute("y"))
                    });
                    targetPoint = {
                        x: parseFloat(targetEdgeLabel.getAttribute("x")),
                        y: parseFloat(targetEdgeLabel.getAttribute("y"))
                    };
                }
            } else if (sourceEdge && targetEl) {
                // Edge to element connection
                const sourceEdgeLabel = edgeLabelNodesMap[edge.source];
                if (sourceEdgeLabel) {
                    sourcePoint = {
                        x: parseFloat(sourceEdgeLabel.getAttribute("x")),
                        y: parseFloat(sourceEdgeLabel.getAttribute("y"))
                    };
                    targetPoint = this.computeIntersection(targetEl, {
                        x: parseFloat(sourceEdgeLabel.getAttribute("x")),
                        y: parseFloat(sourceEdgeLabel.getAttribute("y"))
                    });
                }
            } else if (sourceEdge && targetEdge) {
                // Edge to edge connection
                const sourceEdgeLabel = edgeLabelNodesMap[edge.source];
                const targetEdgeLabel = edgeLabelNodesMap[edge.target];
                if (sourceEdgeLabel && targetEdgeLabel) {
                    sourcePoint = {
                        x: parseFloat(sourceEdgeLabel.getAttribute("x")),
                        y: parseFloat(sourceEdgeLabel.getAttribute("y"))
                    };
                    targetPoint = {
                        x: parseFloat(targetEdgeLabel.getAttribute("x")),
                        y: parseFloat(targetEdgeLabel.getAttribute("y"))
                    };
                }
            }

            if (sourcePoint && targetPoint) {
                // Set line coordinates
                line.setAttribute("x1", sourcePoint.x);
                line.setAttribute("y1", sourcePoint.y);
                line.setAttribute("x2", targetPoint.x);
                line.setAttribute("y2", targetPoint.y);
                line.setAttribute("stroke-dasharray", edge.data?.meta ? "5,5" : edge.style?.dash || "");

                // Update or create edge label
                this.updateEdgeLabel(edge, sourcePoint, targetPoint);
            } else {
                // Invalid edge, remove it
                this.state.removeEdgeById(edge.id);
                line.remove();
            }
        } else {
            // Invalid edge, remove it
            this.state.removeEdgeById(edge.id);
            line.remove();
        }
    }

    /**
     * Update edge label
     */
    updateEdgeLabel(edge, sourcePoint, targetPoint) {
        // Initialize edge label map if needed
        if (!this.state.edgeLabelNodesMap) {
            this.state.edgeLabelNodesMap = {};
        }

        // Use a default label if none is present
        const labelText = edge.label ? edge.label : "Edge";

        // Get or create the text element
        let textEl = this.state.edgeLabelNodesMap[edge.id];
        if (!textEl) {
            textEl = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textEl.setAttribute("text-anchor", "middle");
            textEl.setAttribute("data-id", edge.id);
            textEl.setAttribute("alignment-baseline", "middle");
            textEl.setAttribute("fill", "#000");
            textEl.style.fontSize = "12px";

            this.state.edgeLabelNodesMap[edge.id] = textEl;
            this.edgesLayer.appendChild(textEl);
        }

        // Calculate midpoint of the line
        const midX = (sourcePoint.x + targetPoint.x) / 2;
        const midY = (sourcePoint.y + targetPoint.y) / 2;

        // Position and update the label
        textEl.setAttribute("x", midX);
        textEl.setAttribute("y", midY);
        textEl.textContent = labelText;

        // Highlight the label if the edge is selected
        if (this.state.selectedElementId === edge.id) {
            textEl.style.fill = "red";
        } else {
            textEl.style.fill = "#000";
        }
    }

    /**
     * Compute the intersection point between an element and a line to a target
     */
    computeIntersection(el, targetEl) {
        // Element center coordinates
        const cx = el.x;
        const cy = el.y;

        // Element dimensions (apply scale)
        const scaleFactor = el.scale || 1;
        const w = (el.width || 10) * scaleFactor;
        const h = (el.height || 10) * scaleFactor;

        // Vector from element's center toward the target
        let dx = targetEl.x - cx;
        let dy = targetEl.y - cy;

        // If the centers coincide, return the center
        if (dx === 0 && dy === 0) {
            return { x: cx, y: cy };
        }

        const halfW = w / 2;
        const halfH = h / 2;

        // Compute scale factors for hitting the vertical and horizontal borders
        let scaleX = Infinity, scaleY = Infinity;
        if (dx !== 0) {
            scaleX = halfW / Math.abs(dx);
        }
        if (dy !== 0) {
            scaleY = halfH / Math.abs(dy);
        }

        // The proper scale is the smaller one, ensuring we hit the closest border
        const scale = Math.min(scaleX, scaleY);

        // The intersection point is computed by scaling the direction vector
        const ix = cx + dx * scale;
        const iy = cy + dy * scale;

        return { x: ix, y: iy };
    }

    /**
     * Clean up orphaned edges from the DOM
     */
    cleanupOrphanedEdges() {
        const { edgeNodesMap, edgeLabelNodesMap, edges } = this.state;

        // Get all current edge IDs
        const validEdgeIds = new Set(edges.map(e => e.id));

        // Remove orphaned edge lines
        if (edgeNodesMap) {
            Object.keys(edgeNodesMap).forEach(edgeId => {
                if (!validEdgeIds.has(edgeId)) {
                    console.log(`[DEBUG] Deleting orphaned edge node`, edgeId, edgeNodesMap[edgeId]);
                    edgeNodesMap[edgeId].remove();
                    delete edgeNodesMap[edgeId];
                }
            });
        }

        // Remove orphaned edge labels
        if (edgeLabelNodesMap) {
            Object.keys(edgeLabelNodesMap).forEach(edgeId => {
                if (!validEdgeIds.has(edgeId)) {
                    console.log(`[DEBUG] Deleting orphaned edge label`, edgeId, edgeLabelNodesMap[edgeId]);
                    edgeLabelNodesMap[edgeId].remove();
                    delete edgeLabelNodesMap[edgeId];
                }
            });
        }
    }

    /**
     * Remove edge from DOM
     */
    removeEdgeFromDOM(id) {
        const { edgeNodesMap, edgeLabelNodesMap } = this.state;

        // Remove edge line
        if (edgeNodesMap && edgeNodesMap[id]) {
            edgeNodesMap[id].remove();
            delete edgeNodesMap[id];
        }

        // Remove edge label
        if (edgeLabelNodesMap && edgeLabelNodesMap[id]) {
            edgeLabelNodesMap[id].remove();
            delete edgeLabelNodesMap[id];
        }
    }

    /**
     * Start edge creation
     */
    startEdgeCreation(sourceId) {
        console.log("Starting edge creation...");

        // Get source element
        const sourceEl = this.state.findElementById(sourceId);
        if (!sourceEl) return null;

        // Create temporary line element
        const tempLineId = "temp-edge-" + Date.now();
        const tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        tempLine.setAttribute("stroke", "blue");
        tempLine.setAttribute("stroke-width", "4");
        tempLine.setAttribute("stroke-dasharray", "5,5");
        tempLine.setAttribute("x1", sourceEl.x);
        tempLine.setAttribute("y1", sourceEl.y);
        tempLine.setAttribute("x2", sourceEl.x);
        tempLine.setAttribute("y2", sourceEl.y);

        // Store temp edge info
        this.tempEdgeElements.set(tempLineId, {
            sourceId,
            lineElement: tempLine
        });

        // Add temp line to SVG
        this.edgesLayer.appendChild(tempLine);

        return tempLineId;
    }

    /**
     * Update edge creation
     */
    updateEdgeCreation(tempEdgeId, targetX, targetY) {
        const tempEdge = this.tempEdgeElements.get(tempEdgeId);
        if (!tempEdge) return;

        tempEdge.lineElement.setAttribute("x2", targetX);
        tempEdge.lineElement.setAttribute("y2", targetY);
    }

    /**
     * Finish edge creation
     */
    finishEdgeCreation(tempEdgeId, targetId) {
        const tempEdge = this.tempEdgeElements.get(tempEdgeId);
        if (!tempEdge) return null;

        // Remove temp line
        tempEdge.lineElement.remove();
        this.tempEdgeElements.delete(tempEdgeId);

        // Validate source and target
        if (!targetId || targetId === tempEdge.sourceId) return null;

        // Create the actual edge
        return this.createNewEdge(tempEdge.sourceId, targetId, "");
    }

    /**
     * Cancel edge creation
     */
    cancelEdgeCreation(tempEdgeId) {
        const tempEdge = this.tempEdgeElements.get(tempEdgeId);
        if (!tempEdge) return;

        // Remove temp line
        tempEdge.lineElement.remove();
        this.tempEdgeElements.delete(tempEdgeId);
    }

    /**
     * Create a new edge
     */
    createNewEdge(sourceId, targetId, label, data = {}, style = {}) {
        // Generate a unique edge ID
        const newEdgeId = "edge-" + Date.now();

        // Create edge object
        const newEdge = {
            id: newEdgeId,
            source: sourceId,
            target: targetId,
            label: label,
            style: {
                ...style
            },
            data: {
                ...data
            }
        };

        // Add to state
        this.state.addEdge(newEdge);

        return newEdgeId;
    }

    /**
     * Clean up resources when this manager is no longer needed
     */
    destroy() {
        // Clear temporary edges
        this.tempEdgeElements.forEach((tempEdge) => {
            tempEdge.lineElement.remove();
        });
        this.tempEdgeElements.clear();

        // Unsubscribe from all state subscriptions
        this.stateSubscriptions.forEach(unsubscribe => unsubscribe());
        this.stateSubscriptions = [];
    }
}

// Export the class
export default EdgeManager;