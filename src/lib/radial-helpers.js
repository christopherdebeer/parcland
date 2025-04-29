/* ──────────────────────────────────────────────────────────────────────────────
 *  Radial-menu helper functions for parc.land            (2025-04-29)
 * ──────────────────────────────────────────────────────────────────────────── */
import { saveCanvas }                  from './storage.js';
import { generateContent }             from './generation.js';

/* internal clipboard — page-lifetime only */
const _clip = { elements: null };

/**
 * Add a fresh element centred on screen
 * @param {CanvasController} c
 * @param {'text'|'markdown'|'img'|'canvas-container'} type
 * @param {string} [content]
 */
export function addEl(c, type, content = '') {
  const { innerWidth:W, innerHeight:H } = window;
  const pt = c.screenToCanvas(W/2, H/2);
  c.createNewElement(pt.x, pt.y, type, content);
}

/* ─── duplicate / delete ─────────────────────────────────────────────────── */

export function duplicateEl(c, id) {
  const el = c.findElementById(id);
  if (!el) return;
  const dup = { ...el, id: 'el-' + Date.now(), x: el.x + 20, y: el.y + 20 };
  c.canvasState.elements.push(dup);
  c.selectElement(dup.id);
  c.renderElements();
  saveCanvas(c.canvasState);
}

export function deleteSelection(c) {
  if (!c.selectedElementIds.length) return;
  const keep = el => !c.selectedElementIds.has(el.id);
  /* drop elements */
  c.canvasState.elements = c.canvasState.elements.filter(keep);
  /* drop edges referencing deleted elements */
  c.canvasState.edges =
    c.canvasState.edges.filter(e => keep({id:e.source}) && keep({id:e.target}));
  c.clearSelection();
  c.renderElements();
  saveCanvas(c.canvasState);
}

/* ─── clipboard helpers ──────────────────────────────────────────────────── */

export function copySelection(c) {
  if (!c.selectedElementIds.size) return;
  const els = c.canvasState.elements
    .filter(el => c.selectedElementIds.has(el.id))
    .map(el => ({ ...el }));                               // deepish clone
  try { navigator.clipboard?.writeText(JSON.stringify(els)); } catch {}
  _clip.elements = els;
}

export function clipboardHasContent() {
  return Array.isArray(_clip.elements) && _clip.elements.length > 0;
}

export async function pasteClipboard(c) {
  if (!clipboardHasContent()) return;
  /* offset new items a bit */
  const now = Date.now();
  const pastedEls = _clip.elements.map((el, i) => ({
    ...el,
    id: 'el-' + (now + i),
    x : el.x + 30,
    y : el.y + 30
  }));
  c.canvasState.elements.push(...pastedEls);
  c.selectedElementIds = new Set(pastedEls.map(e => e.id));
  c.renderElements();
  saveCanvas(c.canvasState);
}

/* ─── AI regenerate (non-image elements only) ─────────────────────────────── */

export async function generateNew(c) {
  if (c.selectedElementIds.size !== 1) return;
  const id = [...c.selectedElementIds][0];
  const el = c.findElementById(id);
  if (!el || el.type === 'img') return;
  const newContent = await generateContent(el.content, el);
  if (newContent) {
    el.content = newContent;
    c.updateElementNode(c.elementNodesMap[id], el, true);
    saveCanvas(c.canvasState);
  }
}

/* ─── quick inline edit using the existing modal ‐ one element only ───────── */

export function inlineEdit(c) {
  if (c.selectedElementIds.size !== 1) return;
  const el = c.findElementById([...c.selectedElementIds][0]);
  c.openEditModal(el);
}

/* ─── re-order in Z space ─────────────────────────────────────────────────── */

export function reorder(c, dir /* 'front' | 'back' */) {
  const delta = dir === 'front' ? +10 : -10;
  c.selectedElementIds.forEach(id => {
    const el = c.findElementById(id);
    if (el) el.zIndex = (el.zIndex || 1) + delta;
  });
  c.renderElements();
  saveCanvas(c.canvasState);
}

/* ─── group / ungroup - minimalist implementation ‐───────────────────────── */
/* We emulate grouping by giving every element an optional `group` string.    */

function _nextGroupId() { return 'grp-' + Date.now().toString(36); }

export function groupSelection(c) {
  if (c.selectedElementIds.size < 2) return;
  const gid = _nextGroupId();
  c.selectedElementIds.forEach(id => {
    const el = c.findElementById(id);
    if (el) el.group = gid;
  });
  saveCanvas(c.canvasState);
}

export function canUngroup(c) {
  return [...c.selectedElementIds].some(id => {
    const el = c.findElementById(id);
    return el?.group;
  });
}

export function ungroupSelection(c) {
  c.selectedElementIds.forEach(id => {
    const el = c.findElementById(id);
    if (el && el.group) delete el.group;
  });
  saveCanvas(c.canvasState);
}

/* ─── viewport helpers ───────────────────────────────────────────────────── */

export function zoom(c, factor) {
  c.viewState.scale = Math.min(
    Math.max(c.viewState.scale * factor, c.MIN_SCALE), c.MAX_SCALE);
  c.updateCanvasTransform();
  c.saveLocalViewState?.();
}

export function zoomToFit(c) {
  /* fit all elements’ bounding box into the visible canvas */
  if (!c.canvasState.elements.length) return;
  const xs = [], ys = [], xe = [], ye = [];
  c.canvasState.elements.forEach(el=>{
    const s = el.scale || 1;
    xs.push(el.x - el.width * s / 2);
    ys.push(el.y - el.height* s / 2);
    xe.push(el.x + el.width* s / 2);
    ye.push(el.y + el.height* s / 2);
  });
  const bb = { x1:Math.min(...xs), y1:Math.min(...ys),
               x2:Math.max(...xe), y2:Math.max(...ye) };
  const W = c.canvas.clientWidth, H = c.canvas.clientHeight;
  const scaleX = W / (bb.x2 - bb.x1), scaleY = H / (bb.y2 - bb.y1);
  c.viewState.scale = Math.min(scaleX, scaleY) * 0.85;          // 15 % margin
  c.viewState.translateX = -bb.x1 * c.viewState.scale + (W - (bb.x2-bb.x1)*c.viewState.scale)/2;
  c.viewState.translateY = -bb.y1 * c.viewState.scale + (H - (bb.y2-bb.y1)*c.viewState.scale)/2;
  c.updateCanvasTransform();
  c.saveLocalViewState?.();
}

/* ─── version history & export stubs (minimal yet useful) ─────────────────── */

export function openHistory(c) {
  const js = JSON.stringify(c.canvasState.versionHistory ?? [], null, 2);
  const w  = window.open('', '_blank');
  w.document.write(`<pre>${js.replace(/</g,'&lt;')}</pre>`);
}

export function exportJSON(c) {
  const data = JSON.stringify(c.canvasState, null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${c.canvasState.canvasId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
