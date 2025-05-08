/* ---------------------------------------------------------------------------
 *  auto-layout.js                (2025-05-08 r2)
 *  Stand-alone helper that tidies either the current selection or the
 *  whole canvas using ELK’s layered layout – and then re-centres the result
 *  on the original selection’s center.
 *  ------------------------------------------------------------------------- */
import { saveCanvas } from './storage.js';

/* lazy singleton – fetched once */
let _elk = null;
async function getElk () {
  if (_elk) return _elk;
  const { default: ELK } =
    await import('https://cdn.jsdelivr.net/npm/elkjs@0.9/+esm');    // ES-module build
  _elk = new ELK();
  return _elk;
}

/* util: bounding-box (+centre) of a set of element models */
function bbox (elements) {
  let minX =  Infinity, minY =  Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  elements.forEach(el => {
    const s      = el.scale || 1;
    const halfW  = (el.width  * s) / 2;
    const halfH  = (el.height * s) / 2;
    minX = Math.min(minX, el.x - halfW);
    minY = Math.min(minY, el.y - halfH);
    maxX = Math.max(maxX, el.x + halfW);
    maxY = Math.max(maxY, el.y + halfH);
  });
  return {
    minX, minY, maxX, maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

/**
 * Auto-arrange nodes with elk.js and keep their centre where it was.
 *
 * @param {CanvasController} controller  live canvas controller
 * @param {Object}  [opts]
 * @param {'selection'|'all'} [opts.scope='selection']
 * @param {string}  [opts.algorithm='layered']   ELK algo id
 * @param {number}  [opts.edgeSpacing=50]        px
 */
export async function autoLayout (controller, opts = {}) {
  const {
    scope       = 'selection',
    algorithm   = 'layered',
    edgeSpacing = 50,
  } = opts;

  /* 1️⃣  Collect nodes to layout */
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
    nodeById.set(id, el);
    return {
      id,
      width : Math.max(  1, el.width  * s),
      height: Math.max( 20, el.height * s),     // ELK dislikes 0 height
    };
  });

  const elkEdges = controller.canvasState.edges
    .filter(e => selIds.includes(e.source) && selIds.includes(e.target))
    .map(e => ({ id: e.id, sources:[e.source], targets:[e.target] }));

  /* ⭐  Record original centre BEFORE layout */
  const origBB = bbox([...nodeById.values()]);

  /* 2️⃣  Run ELK */
  const elk = await getElk();
  const layoutGraph = await elk.layout({
    id: 'root',
    layoutOptions:{
      'elk.algorithm'        : algorithm,
      'elk.spacing.edgeEdge' : edgeSpacing,
      // A sensible default for UML-ish diagrams; tune to taste
      'elk.direction'        : 'RIGHT',
    },
    children : elkNodes,
    edges    : elkEdges,
  });

  /* 3️⃣  Apply ELK coordinates */
  layoutGraph.children.forEach(n => {
    const el = nodeById.get(n.id);
    // ELK (x,y) = top-left; our model stores centre:
    el.x = n.x + n.width  / 2;
    el.y = n.y + n.height / 2;
  });

  /* ⭐  Compute new centre AFTER layout, then translate the delta */
  const newBB = bbox([...nodeById.values()]);
  const dx = origBB.cx - newBB.cx;
  const dy = origBB.cy - newBB.cy;
  if (dx !== 0 || dy !== 0) {
    nodeById.forEach(el => {
      el.x += dx;
      el.y += dy;
    });
  }

  /* 4️⃣  Redraw & persist */
  controller.renderElements();
  saveCanvas(controller.canvasState);
}

/* convenience default export */
export default autoLayout;
