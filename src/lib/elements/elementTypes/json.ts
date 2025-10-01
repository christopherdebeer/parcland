// @ts-nocheck - TODO: Add proper types
/* ---------------------------------------------------------------------------
 * elementTypes/json.js
 * Example “json” element – renders element.data as <pre>{…}</pre>
 * ------------------------------------------------------------------------- */
import { elementRegistry } from '../elementRegistry.ts';

elementRegistry.register('json', {
  mount(el /* ElementModel */, _c) {
    const root = document.createElement('pre');
    root.className = 'content';
    root.style.margin = 0;
    this.update(el, root);          // initial draw
    return root;
  },
  update(el, root) {
    root.textContent = JSON.stringify(el.data ?? el.content, null, 2);
  }
});
