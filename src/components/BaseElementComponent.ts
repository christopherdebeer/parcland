/**
 * BaseElementComponent
 *
 * Base class for all canvas element types.
 * Extends BaseComponent with element-specific functionality:
 * - Positioning and transforms
 * - Selection handling
 * - Handles (resize, rotate, etc.)
 * - Static vs dynamic positioning
 */

import type { CanvasElement } from '../types.ts';
import { BaseComponent, ComponentContext } from './BaseComponent.ts';

/**
 * Base class for canvas elements (text, markdown, image, etc.)
 */
export abstract class BaseElementComponent extends BaseComponent<CanvasElement> {
  protected containerElement: HTMLElement | null = null;
  protected contentElement: HTMLElement | null = null;
  protected handles: HTMLElement[] = [];

  constructor(data: CanvasElement, context: ComponentContext) {
    super(data, context);
  }

  /**
   * Mount the element component
   * Creates the wrapper structure and delegates content rendering to subclass
   */
  mount(): HTMLElement {
    // Create wrapper div
    this.containerElement = this.createElement('div', 'canvas-element', {
      'data-el-id': this.data.id,
      'data-type': this.data.type
    });

    // Create content container
    this.contentElement = this.createElement('div', 'content');
    this.containerElement.appendChild(this.contentElement);

    // Render content (implemented by subclass)
    this.renderContent(this.contentElement);

    // Apply positioning
    this.applyPositioning();

    this.rootElement = this.containerElement;
    this.mounted = true;

    return this.containerElement;
  }

  /**
   * Update the element with new data
   */
  update(newData: CanvasElement): void {
    const needsContentUpdate = this.shouldUpdateContent(this.data, newData);
    const needsPositionUpdate = this.shouldUpdatePosition(this.data, newData);

    this.data = newData;

    if (needsContentUpdate && this.contentElement) {
      this.renderContent(this.contentElement);
    }

    if (needsPositionUpdate && this.containerElement) {
      this.applyPositioning();
    }

    // Update handles if selection state changed
    this.updateHandles();
  }

  /**
   * Abstract method: Render the element's content
   * Subclasses must implement this to render their specific content type
   */
  protected abstract renderContent(container: HTMLElement): void;

  /**
   * Check if content needs to be re-rendered
   * Override this for custom content update logic
   */
  protected shouldUpdateContent(oldData: CanvasElement, newData: CanvasElement): boolean {
    return (
      oldData.content !== newData.content ||
      oldData.type !== newData.type ||
      oldData.src !== newData.src
    );
  }

  /**
   * Check if positioning needs to be updated
   */
  protected shouldUpdatePosition(oldData: CanvasElement, newData: CanvasElement): boolean {
    return (
      oldData.x !== newData.x ||
      oldData.y !== newData.y ||
      oldData.width !== newData.width ||
      oldData.height !== newData.height ||
      oldData.rotation !== newData.rotation ||
      oldData.scale !== newData.scale ||
      oldData.static !== newData.static ||
      oldData.zIndex !== newData.zIndex
    );
  }

  /**
   * Apply CSS positioning and transforms
   */
  protected applyPositioning(): void {
    if (!this.containerElement) return;

    const el = this.data;
    const scale = el.scale || 1;
    const rotation = el.rotation || 0;
    const zIndex = Math.floor(el.zIndex) || 1;
    const blendMode = el.blendMode || 'normal';

    this.containerElement.style.setProperty('--blend-mode', blendMode);

    if (el.static) {
      // Fixed positioning (HUD elements)
      this.setStyles(this.containerElement, {
        position: 'fixed',
        left: (el.fixedLeft || 0) + '%',
        top: (el.fixedTop || 0) + '%',
        zIndex: String(zIndex),
        transform: `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`
      });

      const viewState = this.context.controller.viewState;
      this.containerElement.style.setProperty('--translateX', String(viewState.translateX));
      this.containerElement.style.setProperty('--translateY', String(viewState.translateY));
      this.containerElement.style.setProperty('--zoom', String(viewState.scale));
    } else {
      // Absolute positioning (canvas elements)
      this.setStyles(this.containerElement, {
        position: 'absolute',
        left: (el.x - (el.width * scale) / 2) + 'px',
        top: (el.y - (el.height * scale) / 2) + 'px',
        zIndex: String(zIndex),
        transform: `rotate(${rotation}deg) translate(calc(0px - var(--padding)), calc(0px - var(--padding)))`
      });
    }

    // Set size CSS variables
    this.containerElement.style.setProperty('--width', (el.width * scale) + 'px');
    this.containerElement.style.setProperty('--height', (el.height * scale) + 'px');
    this.containerElement.style.setProperty('--scale', String(scale));

    // Trigger edge update
    this.context.controller.requestEdgeUpdate?.();
  }

  /**
   * Update selection handles
   */
  protected updateHandles(): void {
    if (!this.containerElement) return;

    // Remove old handles
    this.handles.forEach(h => h.remove());
    this.handles = [];

    // Check if element is selected
    const isSelected = this.context.controller.selectedElementIds?.has(this.data.id);
    if (isSelected) {
      this.buildHandles();
    }

    // Update selection class
    this.containerElement.classList.toggle('selected', isSelected);
  }

  /**
   * Build interaction handles for selected elements
   */
  protected buildHandles(): void {
    if (!this.containerElement) return;

    const createHandle = (className: string, icon: string): HTMLElement => {
      const wrap = this.createElement('div', `${className} element-handle`);
      const i = this.createElement('i');
      i.className = icon;
      wrap.appendChild(i);
      this.containerElement!.appendChild(wrap);
      this.handles.push(wrap);
      return wrap;
    };

    createHandle('type-handle', 'fa-solid fa-font');
    createHandle('scale-handle', 'fa-solid fa-up-down-left-right');
    createHandle('reorder-handle', 'fa-solid fa-layer-group');
    createHandle('resize-handle', 'fa-solid fa-up-right-and-down-left-from-center');
    createHandle('rotate-handle rotate-handle-position', 'fa-solid fa-rotate');
    createHandle('edge-handle', 'fa-solid fa-link');
    createHandle('create-handle', 'fa-solid fa-plus');
  }

  /**
   * Get the container element
   */
  getContainer(): HTMLElement | null {
    return this.containerElement;
  }

  /**
   * Get the content element
   */
  getContentElement(): HTMLElement | null {
    return this.contentElement;
  }

  /**
   * Cleanup on unmount
   */
  unmount(): void {
    this.handles.forEach(h => h.remove());
    this.handles = [];
    this.containerElement = null;
    this.contentElement = null;
    super.unmount();
  }
}
