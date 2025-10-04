import type { CanvasElement } from '../../types.ts';

/**
 * ElementRenderer
 *
 * Handles rendering of canvas elements to DOM nodes.
 * Responsible for:
 * - DOM node creation and lifecycle
 * - Content rendering delegation
 * - Position/transform application
 * - Handle rendering (resize, rotate, etc.)
 */
export class ElementRenderer {
    private elementRegistry: any;
    private elementNodesMap: Record<string, HTMLElement>;
    private container: HTMLElement;
    private staticContainer: HTMLElement;
    private controller: any; // Reference to CanvasController for callbacks

    constructor(
        elementRegistry: any,
        container: HTMLElement,
        staticContainer: HTMLElement,
        controller: any
    ) {
        this.elementRegistry = elementRegistry;
        this.elementNodesMap = {};
        this.container = container;
        this.staticContainer = staticContainer;
        this.controller = controller;
    }

    /**
     * Render all elements in the canvas state
     */
    renderElements(elements: CanvasElement[], selectedIds: Set<string>): void {
        const existingIds = new Set(Object.keys(this.elementNodesMap));
        const usedIds = new Set();

        elements.forEach(el => {
            usedIds.add(el.id);
            let node = this.elementNodesMap[el.id];
            if (!node) {
                node = this.ensureDomFor(el);
                (el.static ? this.staticContainer : this.container).appendChild(node);
                this.elementNodesMap[el.id] = node;
            }
            const isSel = selectedIds.has(el.id);
            this.updateElementNode(node, el, isSel);
        });

        // Remove orphaned nodes
        existingIds.forEach(id => {
            if (!usedIds.has(id)) {
                const node = this.elementNodesMap[id];
                const view = this.elementRegistry.viewFor(node?.dataset.type);
                view?.unmount?.(node.firstChild as HTMLElement);
                node.remove();
                delete this.elementNodesMap[id];
            }
        });
    }

    /**
     * Ensure a DOM node exists for an element
     */
    private ensureDomFor(el: CanvasElement): HTMLElement {
        let node = this.elementNodesMap[el.id];
        if (node) return node;

        const view = this.elementRegistry.viewFor(el.type);
        node = document.createElement('div');
        node.classList.add('canvas-element');
        node.dataset.elId = el.id;
        node.dataset.type = el.type;

        if (view) {
            const inner = view.mount(el, this.controller);
            inner && node.appendChild(inner);
        } else {
            // Fallback to controller's legacy content rendering
            this.controller.setElementContent(node, el);
        }
        this.elementNodesMap[el.id] = node;
        return node;
    }

    /**
     * Update an element's DOM node
     */
    private updateElementNode(node: HTMLElement, el: CanvasElement, isSelected: boolean, skipHandles?: boolean): void {
        // Update CRDT
        this.controller.crdt.updateElement(el.id, el);

        // Update content via view or legacy method
        const view = this.elementRegistry.viewFor(el.type);
        if (view && typeof view.update === 'function') {
            view.update(el, node.firstChild, this.controller);
        } else {
            this.controller.setElementContent(node, el);
        }

        // Apply positioning
        this.applyPositionStyles(node, el);
        node.setAttribute("type", el.type);

        // Handle selection state
        node.classList.remove("selected");
        if (isSelected) {
            node.classList.add("selected");
        }

        // Handle peer selection state
        const peerSelected = Array.from((this.controller.crdt as any).provider?.awareness?.getStates?.()?.values?.() || [])
            .filter((p: any) => p.client?.clientId !== (this.controller.crdt as any).provider?.awareness?.clientID)
            .flatMap((p: any) => p.client?.selection || []);

        if (peerSelected.indexOf(el.id) >= 0) {
            node.classList.add("peer-selected");
        } else {
            node.classList.remove("peer-selected");
        }

        // Build handles if selected
        if (!skipHandles) {
            const oldHandles = Array.from(node.querySelectorAll('.element-handle'));
            oldHandles.forEach(h => h.remove());
            if (isSelected) {
                this.buildHandles(node, el);
            }
        }
    }

    /**
     * Apply CSS positioning and transforms to an element node
     */
    private applyPositionStyles(node: HTMLElement, el: CanvasElement): void {
        const scale = el.scale || 1;
        const rotation = el.rotation || 0;
        const zIndex = Math.floor(el.zIndex) || 1;
        const blendMode = el.blendMode || 'normal';

        node.style.setProperty('--blend-mode', blendMode);

        if (el.static) {
            node.style.position = 'fixed';
            node.style.left = (el.fixedLeft || 0) + '%';
            node.style.top = (el.fixedTop || 0) + '%';
            node.style.setProperty('--translateX', String(this.controller.viewState.translateX));
            node.style.setProperty('--translateY', String(this.controller.viewState.translateY));
            node.style.setProperty('--zoom', String(this.controller.viewState.scale));
            node.style.setProperty('--width', (el.width * scale) + 'px');
            node.style.setProperty('--height', (el.height * scale) + 'px');
            node.style.setProperty('--scale', String(scale));
            node.style.zIndex = String(zIndex);
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        } else {
            node.style.position = 'absolute';
            node.style.left = (el.x - (el.width * scale) / 2) + "px";
            node.style.top = (el.y - (el.height * scale) / 2) + "px";
            node.style.setProperty('--width', (el.width * scale) + 'px');
            node.style.setProperty('--height', (el.height * scale) + 'px');
            node.style.setProperty('--scale', String(scale));
            node.style.zIndex = String(zIndex);
            node.style.transform = `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`;
        }

        // Trigger edge update when positioning changes
        this.controller.requestEdgeUpdate();
    }

    /**
     * Build interaction handles for selected elements
     */
    private buildHandles(node: HTMLElement, _el: CanvasElement): void {
        const h = (className: string, icon: string, click?: (event: Event) => void) => {
            const wrap = document.createElement('div');
            wrap.className = className + ' element-handle';
            const i = document.createElement('i');
            i.className = icon;
            wrap.appendChild(i);
            if (click) wrap.addEventListener('click', click);
            node.appendChild(wrap);
        };

        h('type-handle', 'fa-solid fa-font');
        h('scale-handle', 'fa-solid fa-up-down-left-right');
        h('reorder-handle', 'fa-solid fa-layer-group');
        h('resize-handle', 'fa-solid fa-up-right-and-down-left-from-center');
        h('rotate-handle rotate-handle-position', 'fa-solid fa-rotate');
        h('edge-handle', 'fa-solid fa-link');
        h('create-handle', 'fa-solid fa-plus');
    }

    /**
     * Get the element nodes map (for external access)
     */
    getElementNodesMap(): Record<string, HTMLElement> {
        return this.elementNodesMap;
    }

    /**
     * Get a specific element node by ID
     */
    getElementNode(id: string): HTMLElement | undefined {
        return this.elementNodesMap[id];
    }
}
