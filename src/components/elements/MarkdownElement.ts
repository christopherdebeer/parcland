/**
 * MarkdownElement
 *
 * Markdown element implementation with rendering via marked library
 */

import { BaseElementComponent } from '../BaseElementComponent.ts';
import type { CanvasElement } from '../../types.ts';
import type { ComponentContext } from '../BaseComponent.ts';

// Use existing window.marked declaration from types.ts

export class MarkdownElement extends BaseElementComponent {
  constructor(data: CanvasElement, context: ComponentContext) {
    super(data, context);
  }

  protected renderContent(container: HTMLElement): void {
    // Clear existing content
    container.innerHTML = '';

    // Parse and render markdown
    const div = this.createElement('div');

    if (window.marked) {
      div.innerHTML = window.marked.parse(this.data.content);
    } else {
      // Fallback if marked is not loaded
      div.textContent = this.data.content;
    }

    div.style.color = this.data.color || '#000000';

    container.appendChild(div);
  }
}
