/**
 * BaseComponent
 *
 * Abstract base class for all canvas components (elements and edges).
 * Provides common functionality for:
 * - Lifecycle management (mount, update, unmount)
 * - DOM manipulation helpers
 * - Event handling
 * - State synchronization
 */

import type { CanvasElement, Edge } from '../types.ts';

export interface ComponentContext {
  controller: any;
  eventBus?: any;
}

/**
 * Base class for all canvas components
 */
export abstract class BaseComponent<TData = CanvasElement | Edge> {
  protected data: TData;
  protected context: ComponentContext;
  protected rootElement: HTMLElement | SVGElement | null = null;
  protected mounted: boolean = false;

  constructor(data: TData, context: ComponentContext) {
    this.data = data;
    this.context = context;
  }

  /**
   * Create and return the root DOM/SVG element for this component.
   * Called once when the component is first added to the canvas.
   */
  abstract mount(): HTMLElement | SVGElement;

  /**
   * Update the component with new data.
   * Called whenever the component's data changes.
   */
  abstract update(newData: TData): void;

  /**
   * Clean up resources when the component is removed.
   * Override this to remove event listeners, timers, etc.
   */
  unmount(): void {
    this.mounted = false;
    this.rootElement = null;
  }

  /**
   * Get the root DOM element
   */
  getRoot(): HTMLElement | SVGElement | null {
    return this.rootElement;
  }

  /**
   * Get the current data
   */
  getData(): TData {
    return this.data;
  }

  /**
   * Check if component is mounted
   */
  isMounted(): boolean {
    return this.mounted;
  }

  /**
   * Helper: Create an HTML element with optional class and attributes
   */
  protected createElement(
    tag: string,
    className?: string,
    attributes?: Record<string, string>
  ): HTMLElement {
    const el = document.createElement(tag);
    if (className) {
      el.className = className;
    }
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        el.setAttribute(key, value);
      });
    }
    return el;
  }

  /**
   * Helper: Create an SVG element with optional class and attributes
   */
  protected createSVGElement(
    tag: string,
    attributes?: Record<string, string>
  ): SVGElement {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attributes) {
      Object.entries(attributes).forEach(([key, value]) => {
        el.setAttribute(key, value);
      });
    }
    return el;
  }

  /**
   * Helper: Set multiple CSS properties at once
   */
  protected setStyles(element: HTMLElement | SVGElement, styles: Record<string, string>): void {
    Object.entries(styles).forEach(([key, value]) => {
      (element.style as any)[key] = value;
    });
  }

  /**
   * Helper: Add event listener that will be cleaned up on unmount
   */
  protected addEventListener<K extends keyof HTMLElementEventMap>(
    element: HTMLElement | SVGElement,
    type: K,
    listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void {
    element.addEventListener(type, listener as EventListener, options);
    // Store for cleanup
    if (!this.eventListeners) {
      this.eventListeners = [];
    }
    this.eventListeners.push({ element, type, listener: listener as EventListener, options });
  }

  private eventListeners: Array<{
    element: HTMLElement | SVGElement;
    type: string;
    listener: EventListener;
    options?: boolean | AddEventListenerOptions;
  }> = [];

  /**
   * Clean up all event listeners
   */
  protected cleanupEventListeners(): void {
    this.eventListeners.forEach(({ element, type, listener, options }) => {
      element.removeEventListener(type, listener, options);
    });
    this.eventListeners = [];
  }

  /**
   * Override unmount to clean up event listeners
   */
  unmountBase(): void {
    this.cleanupEventListeners();
    this.unmount();
  }
}
