import type { CanvasElement } from '../types';

/**
 * Bounding box with center point
 */
export interface BoundingBox {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    cx: number;
    cy: number;
}

/**
 * Manages element selection state and UI.
 *
 * Provides:
 * - Single and multi-selection tracking
 * - Group selection (all members selected together)
 * - Selection box (lasso) rendering
 * - Group bounding box calculations
 * - Selection change events
 */
export class SelectionManager {
    private selectedElementIds: Set<string> = new Set();
    private selectionBox: HTMLElement | null = null;
    private groupBox: HTMLElement;
    private canvas: HTMLElement;
    private container: HTMLElement;
    private findElementById: (id: string) => CanvasElement | undefined;
    private getElements: () => CanvasElement[];
    private onSelectionChange?: (selectedIds: Set<string>) => void;

    /**
     * Creates a new SelectionManager
     *
     * @param canvas - The canvas DOM element
     * @param container - The container DOM element
     * @param findElementById - Function to find elements by ID
     * @param getElements - Function to get all elements
     * @param onSelectionChange - Optional callback when selection changes
     */
    constructor(
        canvas: HTMLElement,
        container: HTMLElement,
        findElementById: (id: string) => CanvasElement | undefined,
        getElements: () => CanvasElement[],
        onSelectionChange?: (selectedIds: Set<string>) => void
    ) {
        this.canvas = canvas;
        this.container = container;
        this.findElementById = findElementById;
        this.getElements = getElements;
        this.onSelectionChange = onSelectionChange;

        // Create group box element
        this.groupBox = document.createElement('div');
        this.groupBox.id = 'group-box';
        this.groupBox.innerHTML = `
  <div class="box"></div>
  <div class="element-handle resize-handle"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></div>
  <div class="element-handle rotate-handle"><i class="fa-solid fa-rotate"></i></div>
  <div class="element-handle scale-handle"><i class="fa-solid fa-up-down-left-right"></i></div>`;
        this.container.appendChild(this.groupBox);
        this.groupBox.style.display = 'none';
    }

    /**
     * Select an element (or group of elements)
     *
     * @param id - Element ID to select
     * @param additive - If true, adds to current selection; if false, replaces selection
     */
    selectElement(id: string, additive: boolean = false): void {
        if (!additive) {
            this.selectedElementIds.clear();
        }

        console.log("[SelectionManager] selectElement", id, { additive });

        const el = this.findElementById(id);
        if (el?.group) {
            // Pull in every element with the same group ID
            const gid = el.group;
            this.getElements()
                .filter(e => e.group === gid)
                .forEach(e => this.selectedElementIds.add(e.id));
        } else {
            // Fall back to single-element toggle
            if (this.selectedElementIds.has(id) && additive) {
                this.selectedElementIds.delete(id);
            } else {
                this.selectedElementIds.add(id);
            }
        }

        this.updateGroupBox();
        this._notifyChange();
    }

    /**
     * Clear all selections
     */
    clearSelection(): void {
        if (this.selectedElementIds.size > 0) {
            this.selectedElementIds.clear();
            this.updateGroupBox();
            this._notifyChange();
        }
    }

    /**
     * Check if an element is selected
     *
     * @param id - Element ID to check
     * @returns True if element is selected
     */
    isElementSelected(id: string): boolean {
        return this.selectedElementIds.has(id);
    }

    /**
     * Get all selected element IDs
     */
    getSelectedIds(): Set<string> {
        return new Set(this.selectedElementIds);
    }

    /**
     * Get the single selected element ID (legacy compatibility)
     */
    getSingleSelectedId(): string | null {
        return this.selectedElementIds.size === 1 ? [...this.selectedElementIds][0] : null;
    }

    /**
     * Set selected element IDs directly
     *
     * @param ids - Set of element IDs to select
     */
    setSelectedIds(ids: Set<string>): void {
        this.selectedElementIds = new Set(ids);
        this.updateGroupBox();
        this._notifyChange();
    }

    /**
     * Calculate bounding box for all selected elements
     *
     * @returns Bounding box or null if no elements selected
     */
    getGroupBBox(): BoundingBox | null {
        if (this.selectedElementIds.size === 0) return null;

        const els = [...this.selectedElementIds]
            .map(id => this.findElementById(id))
            .filter(el => el !== undefined) as CanvasElement[];

        if (els.length === 0) return null;

        // Calculate corners for each element considering rotation
        const allCorners: { x: number; y: number }[] = [];

        els.forEach(el => {
            const scaleFactor = el.scale || 1;
            const halfW = (el.width * scaleFactor) / 2;
            const halfH = (el.height * scaleFactor) / 2;
            const cx = el.x;
            const cy = el.y;
            const theta = ((el.rotation || 0) * Math.PI) / 180;
            const cosθ = Math.cos(theta);
            const sinθ = Math.sin(theta);

            // Calculate the four corners of the rotated rectangle
            const corners = [
                { x: -halfW, y: -halfH }, // top-left
                { x: halfW, y: -halfH },  // top-right
                { x: halfW, y: halfH },   // bottom-right
                { x: -halfW, y: halfH }   // bottom-left
            ].map(pt => {
                // Rotate point
                const rx = pt.x * cosθ - pt.y * sinθ;
                const ry = pt.x * sinθ + pt.y * cosθ;
                // Translate to element position
                return { x: cx + rx, y: cy + ry };
            });

            allCorners.push(...corners);
        });

        // Find min/max coordinates from all corners
        const xs = allCorners.map(pt => pt.x);
        const ys = allCorners.map(pt => pt.y);

        return {
            x1: Math.min(...xs),
            y1: Math.min(...ys),
            x2: Math.max(...xs),
            y2: Math.max(...ys),
            cx: (Math.min(...xs) + Math.max(...xs)) / 2,
            cy: (Math.min(...ys) + Math.max(...ys)) / 2
        };
    }

    /**
     * Update the group box visual representation
     */
    updateGroupBox(): void {
        if (this.selectedElementIds.size < 2) {
            this.groupBox.style.display = 'none';
            this.canvas.classList.remove('group-selected');
            return;
        }

        const bb = this.getGroupBBox();
        if (!bb) {
            this.groupBox.style.display = 'none';
            this.canvas.classList.remove('group-selected');
            return;
        }

        this.canvas.classList.add('group-selected');

        this.groupBox.style.display = 'block';
        this.groupBox.style.left = bb.x1 + 'px';
        this.groupBox.style.top = bb.y1 + 'px';
        this.groupBox.style.width = (bb.x2 - bb.x1) + 'px';
        this.groupBox.style.height = (bb.y2 - bb.y1) + 'px';
    }

    /**
     * Create a selection box (lasso) at the starting coordinates
     *
     * @param startX - Starting X coordinate (canvas space)
     * @param startY - Starting Y coordinate (canvas space)
     */
    createSelectionBox(startX: number, startY: number): void {
        this.selectionBox = document.createElement('div');
        this.selectionBox.id = 'lasso-box';
        Object.assign(this.selectionBox.style, {
            position: 'absolute',
            border: '1px dashed #00aaff',
            background: 'rgba(0,170,255,0.05)',
            left: `${startX}px`,
            top: `${startY}px`,
            width: '0px',
            height: '0px',
            zIndex: '10000',
            pointerEvents: 'none'
        });
        this.canvas.appendChild(this.selectionBox);
    }

    /**
     * Update the selection box dimensions
     *
     * @param startX - Starting X coordinate
     * @param startY - Starting Y coordinate
     * @param curX - Current X coordinate
     * @param curY - Current Y coordinate
     */
    updateSelectionBox(startX: number, startY: number, curX: number, curY: number): void {
        if (!this.selectionBox) {
            this.createSelectionBox(startX, startY);
        }

        const x = Math.min(startX, curX);
        const y = Math.min(startY, curY);
        const w = Math.abs(curX - startX);
        const h = Math.abs(curY - startY);

        Object.assign(this.selectionBox!.style, {
            left: `${x}px`,
            top: `${y}px`,
            width: `${w}px`,
            height: `${h}px`
        });
    }

    /**
     * Remove the selection box
     */
    removeSelectionBox(): void {
        if (this.selectionBox) {
            this.selectionBox.remove();
            this.selectionBox = null;
        }
    }

    /**
     * Get the group box element for handle attachment
     */
    getGroupBoxElement(): HTMLElement {
        return this.groupBox;
    }

    /**
     * Cleanup when destroying the manager
     */
    destroy(): void {
        this.removeSelectionBox();
        this.groupBox.remove();
    }

    /**
     * Notify listeners of selection change
     */
    private _notifyChange(): void {
        if (this.onSelectionChange) {
            this.onSelectionChange(this.getSelectedIds());
        }
    }
}
