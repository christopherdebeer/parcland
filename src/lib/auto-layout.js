/* ---------------------------------------------------------------------------
 *  auto-layout.js                (2025-05-08)
 *  Stand-alone helper that tidies either the current selection or the
 *  whole canvas using ELK’s layered layout.
 *  ------------------------------------------------------------------------- */
import { saveCanvas } from './storage.js';

/* lazy singleton – fetched the first time we need it */
let _elk = null;
async function getElk () {
  if (_elk) return _elk;
  const { default: ELK } =
    await import('https://cdn.jsdelivr.net/npm/elkjs@0.9/+esm'); // ES-module build
  _elk = new ELK();
  return _elk;
}

/**
 * Auto-arrange nodes with elk.js.
 *
 * @param {CanvasController} controller – live canvas controller
 * @param {Object}  [opts]
 * @param {'selection'|'all'} [opts.scope='selection']
 * @param {string}  [opts.algorithm='layered']     – any ELK algo: layered, force, … 
 * @param {number}  [opts.edgeSpacing=50]          – px, forwarded to ELK
 */
export async function autoLayout (controller, opts = {}) {
  const {
    scope      = 'selection',
    algorithm  = 'layered',
    edgeSpacing = 50,
  } = opts;

  /* ---------- 1. Gather the sub-graph we want to layout ------------------- */
  const selIds = scope === 'all'
      ? controller.canvasState.elements.map(e => e.id)
      : [...controller.selectedElementIds];

  if (selIds.length < 2) {
    alert('Select at least two elements to auto-layout.');
    return;
  }

  const nodeById = new Map();
  const elkNodes = selIds.map(id => {
    const el = controller.findElementById(id);
    const s  = el.scale || 1;
    const n  = {
      id,
      width:  Math.max(  1, el.width  * s ),
      height: Math.max( 20, el.height * s ),   // ELK dislikes zero heights
    };
    nodeById.set(id, el);
    return n;
  });

  const elkEdges = controller.canvasState.edges
    .filter(e => selIds.includes(e.source) &&
                 selIds.includes(e.target))
    .map(e => ({ id: e.id, sources:[e.source], targets:[e.target] }));

  /* ---------- 2. Run ELK --------------------------------------------------- */
  const elk = await getElk();
  const layoutGraph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm'          : algorithm,
      'elk.spacing.edgeEdge'   : edgeSpacing,
      'elk.direction'          : 'RIGHT',
    },
    children : elkNodes,
    edges    : elkEdges,
  });

  /* ---------- 3. Apply new coordinates ------------------------------------ */
  layoutGraph.children.forEach(n => {
    const el = nodeById.get(n.id);
    // ELK’s (x,y) is top-left; our model stores centres:
    el.x = n.x + n.width  / 2;
    el.y = n.y + n.height / 2;
  });

  controller.renderElements();
  saveCanvas(controller.canvasState);
}

/* convenience export for tree-shaking */
export default autoLayout;
