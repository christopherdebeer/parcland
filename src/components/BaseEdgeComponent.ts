/**
 * BaseEdgeComponent
 *
 * Base class for all edge/connection types.
 * Extends BaseComponent with edge-specific functionality:
 * - SVG line rendering
 * - Source/target intersection calculation
 * - Label positioning
 * - Arrowheads and styling
 */

import type { Edge, CanvasElement } from '../types.ts';
import { BaseComponent, ComponentContext } from './BaseComponent.ts';
import { GeometryUtils } from '../services/utils/GeometryUtils.ts';

/**
 * Base class for canvas edges (connections between elements)
 */
export abstract class BaseEdgeComponent extends BaseComponent<Edge> {
  protected lineElement: SVGLineElement | null = null;
  protected labelElement: SVGTextElement | null = null;
  protected groupElement: SVGGElement | null = null;

  constructor(data: Edge, context: ComponentContext) {
    super(data, context);
  }

  /**
   * Mount the edge component
   * Creates SVG line and label elements
   */
  mount(): SVGElement {
    // Create SVG group to hold line and label
    this.groupElement = this.createSVGElement('g', {
      'data-edge-id': this.data.id
    }) as SVGGElement;

    // Create line element
    this.lineElement = this.createSVGElement('line', {
      stroke: this.data.style?.color || '#ccc',
      'stroke-width': this.data.style?.thickness || '2',
      'marker-end': 'url(#arrowhead)'
    }) as SVGLineElement;

    // Create label element
    this.labelElement = this.createSVGElement('text', {
      'text-anchor': 'middle',
      'alignment-baseline': 'middle',
      fill: '#000',
      'data-id': this.data.id
    }) as SVGTextElement;
    this.labelElement.style.fontSize = '12px';

    this.groupElement.appendChild(this.lineElement);
    this.groupElement.appendChild(this.labelElement);

    // Initial render
    this.updateEdgePosition();

    this.rootElement = this.groupElement;
    this.mounted = true;

    return this.groupElement;
  }

  /**
   * Update the edge with new data
   */
  update(newData: Edge): void {
    const needsStyleUpdate = this.shouldUpdateStyle(this.data, newData);
    const needsPositionUpdate = this.shouldUpdatePosition(this.data, newData);

    this.data = newData;

    if (needsStyleUpdate && this.lineElement) {
      this.updateStyle();
    }

    if (needsPositionUpdate) {
      this.updateEdgePosition();
    }
  }

  /**
   * Check if style needs to be updated
   */
  protected shouldUpdateStyle(oldData: Edge, newData: Edge): boolean {
    return (
      oldData.style?.color !== newData.style?.color ||
      oldData.style?.thickness !== newData.style?.thickness ||
      oldData.style?.dash !== newData.style?.dash
    );
  }

  /**
   * Check if position needs to be updated
   */
  protected shouldUpdatePosition(oldData: Edge, newData: Edge): boolean {
    return (
      oldData.source !== newData.source ||
      oldData.target !== newData.target ||
      oldData.label !== newData.label
    );
  }

  /**
   * Update line and label styling
   */
  protected updateStyle(): void {
    if (!this.lineElement) return;

    this.lineElement.setAttribute('stroke', this.data.style?.color || '#ccc');
    this.lineElement.setAttribute('stroke-width', this.data.style?.thickness || '2');
    this.lineElement.setAttribute(
      'stroke-dasharray',
      this.data.data?.meta ? '5,5' : this.data.style?.dash || ''
    );
  }

  /**
   * Update edge position based on source and target elements
   */
  protected updateEdgePosition(): void {
    if (!this.lineElement || !this.labelElement) return;

    const controller = this.context.controller;
    const sourceEl = controller.findElementById(this.data.source);
    const targetEl = controller.findElementById(this.data.target);

    if (!sourceEl || !targetEl) {
      // Hide edge if source or target is missing
      this.hide();
      return;
    }

    // Show edge
    this.show();

    // Calculate intersection points
    const sourcePoint = this.calculateIntersection(sourceEl, targetEl);
    const targetPoint = this.calculateIntersection(targetEl, sourceEl);

    if (sourcePoint && targetPoint) {
      // Update line position
      this.lineElement.setAttribute('x1', String(sourcePoint.x));
      this.lineElement.setAttribute('y1', String(sourcePoint.y));
      this.lineElement.setAttribute('x2', String(targetPoint.x));
      this.lineElement.setAttribute('y2', String(targetPoint.y));

      // Update label position (midpoint)
      const midX = (sourcePoint.x + targetPoint.x) / 2;
      const midY = (sourcePoint.y + targetPoint.y) / 2;
      this.labelElement.setAttribute('x', String(midX));
      this.labelElement.setAttribute('y', String(midY));
      this.labelElement.textContent = this.data.label || 'Edge';

      // Update style
      this.updateStyle();
    }
  }

  /**
   * Calculate intersection point on element boundary
   * Can be overridden for custom intersection logic
   */
  protected calculateIntersection(
    fromElement: CanvasElement,
    toElement: CanvasElement
  ): { x: number; y: number } | null {
    return GeometryUtils.computeIntersection(fromElement, toElement);
  }

  /**
   * Hide the edge
   */
  protected hide(): void {
    if (this.groupElement) {
      this.groupElement.style.display = 'none';
    }
  }

  /**
   * Show the edge
   */
  protected show(): void {
    if (this.groupElement) {
      this.groupElement.style.display = '';
    }
  }

  /**
   * Get the line element
   */
  getLineElement(): SVGLineElement | null {
    return this.lineElement;
  }

  /**
   * Get the label element
   */
  getLabelElement(): SVGTextElement | null {
    return this.labelElement;
  }

  /**
   * Cleanup on unmount
   */
  unmount(): void {
    this.lineElement = null;
    this.labelElement = null;
    this.groupElement = null;
    super.unmount();
  }
}
