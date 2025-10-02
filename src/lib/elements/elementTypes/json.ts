/* ---------------------------------------------------------------------------
 * elementTypes/json.ts
 * Example "json" element – renders element.data as <pre>{…}</pre>
 * ------------------------------------------------------------------------- */
import { elementRegistry } from '../elementRegistry.ts';
import type { CanvasElement } from '../../../types';

elementRegistry.register('json', {
  mount(el: CanvasElement, _c: any): HTMLElement {
    const root = document.createElement('pre');
    root.className = 'content';
    root.style.margin = '0';
    this.update(el, root);          // initial draw
    return root;
  },
  update(el: CanvasElement, root: HTMLElement): void {
    root.textContent = JSON.stringify((el as any).data ?? el.content, null, 2);
  }
});
