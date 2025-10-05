/**
 * TextElement
 *
 * Simple text element implementation extending BaseElementComponent
 */

import { BaseElementComponent } from '../BaseElementComponent.ts';
import type { CanvasElement } from '../../types.ts';
import type { ComponentContext } from '../BaseComponent.ts';

export class TextElement extends BaseElementComponent {
  constructor(data: CanvasElement, context: ComponentContext) {
    super(data, context);
  }

  protected renderContent(container: HTMLElement): void {
    // Clear existing content
    container.innerHTML = '';

    // Create paragraph element
    const p = this.createElement('p');
    p.textContent = this.data.content;
    p.style.color = this.data.color || '#000000';

    container.appendChild(p);
  }
}
