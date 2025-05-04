/* ---------------------------------------------------------------------------
 * elementRegistry.js                (2025-05-04)
 * Simple plug-in registry for canvas element types.
 * ------------------------------------------------------------------------- */

export function createRegistry() {
  /** @type {Record<string,ElementView>} */
  const _views = {};

  /** Register (or overwrite) a type */
  function register(type, view) {
    if (typeof type !== 'string' || !view || typeof view.mount !== 'function') {
      throw new Error('register(type, view) – type string & view.mount() required');
    }
    _views[type] = view;
  }

  /** Return the view object for a type, or undefined */
  function viewFor(type)        { return _views[type]; }

  /** Shallow copy of the currently known set */
  function listTypes()          { return Object.keys(_views); }

  return { register, viewFor, listTypes };
}

/* single shared instance -------------------------------------------------- */
export const elementRegistry = createRegistry();

/* make dynamic registration trivial for inline <script>                     */
if (typeof window !== 'undefined') {
  window.registerElementType = elementRegistry.register;
}

/* -- Typing hint -----------------------------------------------------------
 * An ElementView is just a plain object with three lifecycle hooks:
 *   mount(el, controller)  -> HTMLElement   (called once)
 *   update(el, dom, controller)             (called each change)
 *   unmount?(dom)                           (called when removed)           */
