/**
 * ImageElement
 *
 * Image element implementation with lazy loading and placeholder support
 */

import { BaseElementComponent } from '../BaseElementComponent.ts';
import type { CanvasElement } from '../../types.ts';
import type { ComponentContext } from '../BaseComponent.ts';

export class ImageElement extends BaseElementComponent {
  private imageElement: HTMLImageElement | null = null;

  constructor(data: CanvasElement, context: ComponentContext) {
    super(data, context);
  }

  protected renderContent(container: HTMLElement): void {
    // Clear existing content
    container.innerHTML = '';

    // Create or reuse image element
    if (!this.imageElement) {
      this.imageElement = this.createElement('img') as HTMLImageElement;
      this.imageElement.className = 'content';
      this.imageElement.dataset.image_id = this.data.imgId || '';
      this.imageElement.title = this.data.content;

      // Error handler
      this.addEventListener(this.imageElement, 'error', (err) => {
        console.warn('Image failed to load', err);
      });
    }

    // Update image source
    if (this.data.src) {
      this.imageElement.src = this.data.src;
    } else {
      // Placeholder
      const width = Math.round(this.data.width);
      const height = Math.round(this.data.height);
      this.imageElement.src = `https://placehold.co/${width}x${height}?text=${encodeURIComponent(this.data.content)}&font=lora`;
    }

    container.appendChild(this.imageElement);
  }

  protected shouldUpdateContent(oldData: CanvasElement, newData: CanvasElement): boolean {
    return (
      oldData.content !== newData.content ||
      oldData.src !== newData.src ||
      oldData.width !== newData.width ||
      oldData.height !== newData.height
    );
  }

  unmount(): void {
    this.imageElement = null;
    super.unmount();
  }
}
