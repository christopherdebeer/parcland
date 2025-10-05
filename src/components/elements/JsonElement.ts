/**
 * JsonElement
 *
 * JSON element implementation with syntax highlighting
 */

import { BaseElementComponent } from '../BaseElementComponent.ts';
import type { CanvasElement } from '../../types.ts';
import type { ComponentContext } from '../BaseComponent.ts';

export class JsonElement extends BaseElementComponent {
  constructor(data: CanvasElement, context: ComponentContext) {
    super(data, context);
  }

  protected renderContent(container: HTMLElement): void {
    // Clear existing content
    container.innerHTML = '';

    // Create pre element for JSON display
    const pre = this.createElement('pre');
    pre.style.margin = '0';
    pre.style.padding = '8px';
    pre.style.backgroundColor = '#f5f5f5';
    pre.style.borderRadius = '4px';
    pre.style.overflow = 'auto';
    pre.style.fontSize = '12px';
    pre.style.fontFamily = 'monospace';
    pre.style.color = this.data.color || '#000000';

    try {
      // Try to parse and pretty-print the JSON
      const parsed = JSON.parse(this.data.content);
      pre.textContent = JSON.stringify(parsed, null, 2);
    } catch (e) {
      // If parsing fails, display as-is with error indicator
      pre.textContent = this.data.content;
      pre.style.borderLeft = '3px solid #ff0000';
      pre.title = 'Invalid JSON';
    }

    container.appendChild(pre);
  }

  /**
   * Check if content needs update
   * JSON elements should update if content or color changes
   */
  protected shouldUpdateContent(oldData: CanvasElement, newData: CanvasElement): boolean {
    return oldData.content !== newData.content || oldData.color !== newData.color;
  }
}
