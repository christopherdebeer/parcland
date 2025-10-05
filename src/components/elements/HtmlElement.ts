/**
 * HtmlElement
 *
 * HTML element implementation with script execution support
 */

import { BaseElementComponent } from '../BaseElementComponent.ts';
import type { CanvasElement } from '../../types.ts';
import type { ComponentContext } from '../BaseComponent.ts';

export class HtmlElement extends BaseElementComponent {
  private scriptsExecuted = false;

  constructor(data: CanvasElement, context: ComponentContext) {
    super(data, context);
  }

  protected renderContent(container: HTMLElement): void {
    // Clear existing content
    container.innerHTML = '';

    // Create wrapper div
    const div = this.createElement('div');
    div.innerHTML = this.data.content;
    div.style.color = this.data.color || '#000000';

    container.appendChild(div);

    // Execute scripts if present and not already executed
    if (!this.scriptsExecuted) {
      this.executeScripts(div);
      this.scriptsExecuted = true;
    }
  }

  /**
   * Execute scripts in the HTML content
   * Replicates the script execution behavior from the original implementation
   */
  private executeScripts(container: HTMLElement): void {
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
      const newScript = document.createElement('script');

      // Copy attributes
      Array.from(oldScript.attributes).forEach((attr) => {
        newScript.setAttribute(attr.name, attr.value);
      });

      // Copy script content
      newScript.textContent = oldScript.textContent;

      // Replace old script with new executable script
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    });
  }

  /**
   * Override update to handle script re-execution when content changes
   */
  update(newData: CanvasElement): void {
    const contentChanged = this.data.content !== newData.content;

    // Reset script execution flag if content changed
    if (contentChanged) {
      this.scriptsExecuted = false;
    }

    super.update(newData);
  }

  /**
   * Cleanup when unmounting
   */
  unmount(): void {
    this.scriptsExecuted = false;
    super.unmount();
  }
}
