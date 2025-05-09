/* ---------------------------------------------------------------------------
 *  auto-layout.js                (2025-05-09 r3)
 *  Tidy selection / whole canvas with elk.js while keeping the geometric
 *  centre fixed **and** inserting extra clearance so straight edges &
 *  mid-point labels have breathing space.
 *  ------------------------------------------------------------------------- */
import { saveCanvas } from './storage.js';

/* —— 1.  Elk singleton ———————————————————————————————— */
let _elk = null;
async function getElk() {
  if (_elk) return _elk;
  const { default: ELK } =
    await import('https://cdn.jsdelivr.net/npm/elkjs@0.9/+esm');
  _elk = new ELK();
  return _elk;
}

/* —— 2.  Helpers —————————————————————————————————————— */
function bbox(elements) {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  elements.forEach(el => {
    const s = el.scale || 1;
    const w = el.width * s;
    const h = el.height * s;
    minX = Math.min(minX, el.x - w / 2);
    minY = Math.min(minY, el.y - h / 2);
    maxX = Math.max(maxX, el.x + w / 2);
    maxY = Math.max(maxY, el.y + h / 2);
  });
  return {
    minX, minY, maxX, maxY,
    cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
  };
}

/* —— 3.  Public API ———————————————————————————————————— */
/**
 * Auto-layout selected nodes (or all) with elk.js.
 *
 * @param {CanvasController} controller  – live controller
 * @param {Object} [o]
 * @param {'selection'|'all'} [o.scope='selection']
 * @param {number} [o.edgeAwareSpacing=40]  Extra px between nodes that share an
 *                                         edge (helps mid-point labels)
 * @param {number} [o.nodePadding      =30]  General node–node spacing
 * @param {string} [o.algorithm='layered']   ELK algorithm id
 */
export async function autoLayout(controller, o = {}) {
  const {
    scope = 'selection',
    edgeAwareSpacing = 100,
    nodePadding = 30,
    direction = 'DOWN',
    algorithm = 'layered',
  } = o;

  const selIds = scope === 'all'
    ? controller.canvasState.elements.map(e => e.id)
    : [...controller.selectedElementIds];

  if (selIds.length < 2) {
    alert('Select at least two elements to auto-layout.');
    return;
  }

  /* —— 3.1  Build ELK graph ———————————————————————— */
  const nodeById = new Map();
  const elkNodes = selIds.map(id => {
    const el = controller.findElementById(id);
    const s = el.scale || 1;
    nodeById.set(id, el);
    return {
      id,
      width: Math.max(1, el.width * s),
      height: Math.max(1, el.height * s),
    };
  });

  const elkEdges = controller.canvasState.edges
    .filter(e => selIds.includes(e.source) && selIds.includes(e.target))
    .map(e => ({ id: e.id, sources: [e.source], targets: [e.target] }));

  /* —— 3.2  Remember original centre ————————————— */
  const origCentre = bbox([...nodeById.values()]);

  /* —— 3.3  Run ELK ——————————————————————————————— */
  const elk = await getElk();
  const g = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': algorithm,
      /* clearances that help straight edges look nicer */
      'elk.spacing.nodeNode': nodePadding,
      'elk.spacing.edgeNode': edgeAwareSpacing,
      'elk.spacing.edgeEdge': edgeAwareSpacing / 2,
      /* a “typical” UML direction; change freely */
      'elk.direction': direction,
    },
    children: elkNodes,
    edges: elkEdges,
  });

  /* —— 3.4  Apply new coords ———————————————————— */
  g.children.forEach(n => {
    const el = nodeById.get(n.id);
    el.x = n.x + n.width / 2;
    el.y = n.y + n.height / 2;
  });

  /* —— 3.5  Re-centre cluster ——————————————————— */
  const newCentre = bbox([...nodeById.values()]);
  const dx = origCentre.cx - newCentre.cx;
  const dy = origCentre.cy - newCentre.cy;
  if (dx || dy) nodeById.forEach(el => { el.x += dx; el.y += dy; });

  /* —— 3.6  Redraw & persist ——————————————————— */
  controller.requestRender();
  saveCanvas(controller.canvasState);
  controller._pushHistorySnapshot('Autolayout');
}

export default autoLayout;
