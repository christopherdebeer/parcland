/**
 * GeometryUtils - Geometric calculations for canvas elements
 *
 * Provides pure functions for geometric calculations including
 * edge intersection points and bounding box operations.
 */

import type { CanvasElement } from '../../types';

export class GeometryUtils {
  /**
   * Compute intersection point on the edge of a rotated rectangle
   *
   * Given a rectangle (with rotation) and a direction vector to another point,
   * this computes where the vector intersects the rectangle's edge.
   *
   * @param el Element or point with x, y coordinates
   * @param otherEl Target element or point
   * @returns Intersection point {x, y}
   */
  static computeIntersection(
    el: CanvasElement | { x: number; y: number },
    otherEl: CanvasElement | { x: number; y: number }
  ): { x: number; y: number } {
    // 1) Center and scale
    const cx = el.x;
    const cy = el.y;
    const scaleFactor = ('scale' in el) ? (el.scale || 1) : 1;
    const w = (('width' in el) ? (el.width || 10) : 10) * scaleFactor;
    const h = (('height' in el) ? (el.height || 10) : 10) * scaleFactor;
    const halfW = w / 2;
    const halfH = h / 2;

    // 2) Vector from el center to otherEl
    let dx = otherEl.x - cx;
    let dy = otherEl.y - cy;

    // If same point, return center
    if (dx === 0 && dy === 0) {
      return { x: cx, y: cy };
    }

    // 3) Un-rotate the direction vector into the rectangle's local axes
    const theta = ((('rotation' in el) ? (el.rotation || 0) : 0) * Math.PI) / 180;
    const cosθ = Math.cos(-theta);
    const sinθ = Math.sin(-theta);
    const localDX = dx * cosθ - dy * sinθ;
    const localDY = dx * sinθ + dy * cosθ;

    // 4) Compute intersection on an axis-aligned box in local space
    const scaleX = localDX !== 0 ? halfW / Math.abs(localDX) : Infinity;
    const scaleY = localDY !== 0 ? halfH / Math.abs(localDY) : Infinity;
    const scale = Math.min(scaleX, scaleY);

    const localIX = localDX * scale;
    const localIY = localDY * scale;

    // 5) Rotate the intersection point back into world axes
    const cosθf = Math.cos(theta);
    const sinθf = Math.sin(theta);
    const worldIX = localIX * cosθf - localIY * sinθf;
    const worldIY = localIX * sinθf + localIY * cosθf;

    // 6) Translate back to world coordinates
    return {
      x: cx + worldIX,
      y: cy + worldIY
    };
  }

  /**
   * Calculate bounding box for a set of elements
   *
   * @param elements Array of canvas elements
   * @returns Bounding box {x, y, width, height} or null if no elements
   */
  static calculateBoundingBox(elements: CanvasElement[]): { x: number; y: number; width: number; height: number } | null {
    if (elements.length === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const el of elements) {
      const halfW = (el.width || 10) / 2;
      const halfH = (el.height || 10) / 2;

      minX = Math.min(minX, el.x - halfW);
      minY = Math.min(minY, el.y - halfH);
      maxX = Math.max(maxX, el.x + halfW);
      maxY = Math.max(maxY, el.y + halfH);
    }

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Check if a point is within an element's bounds
   *
   * @param point Point {x, y}
   * @param el Canvas element
   * @returns True if point is inside element bounds
   */
  static pointInElement(point: { x: number; y: number }, el: CanvasElement): boolean {
    const halfW = (el.width || 10) / 2;
    const halfH = (el.height || 10) / 2;

    return (
      point.x >= el.x - halfW &&
      point.x <= el.x + halfW &&
      point.y >= el.y - halfH &&
      point.y <= el.y + halfH
    );
  }

  /**
   * Calculate distance between two points
   *
   * @param p1 First point
   * @param p2 Second point
   * @returns Distance
   */
  static distance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
