/* ──────────────────────────────────────────────────────────────────────────────
 *  menu item helper functions for parc.land            (2025-04-29)
 * ──────────────────────────────────────────────────────────────────────────── */
import { saveCanvas } from '../network/storage.ts';
import { generateContent } from '../network/generation.ts';
import type { CanvasElement } from '../../types';

/* internal clipboard — page-lifetime only */
const _clip: { elements: CanvasElement[] | null } = { elements: null };

/**
 * Add a fresh element centred on screen
 * @param c - Canvas controller
 * @param type - Element type
 * @param content - Initial content
 */
export function addEl(c: any, type: string, content = ''): void {
  const { innerWidth: W, innerHeight: H } = window;
  const pt = c.screenToCanvas(W / 2, H / 2);
  c.createNewElement(pt.x, pt.y, type, content);
}

/* ─── duplicate / delete ─────────────────────────────────────────────────── */

export function duplicateEl(c: any, id: string): void {
  const el = c.findElementById(id);
  if (!el) return;
  const dup: CanvasElement = { ...el, id: 'el-' + Date.now(), x: el.x + 20, y: el.y + 20 };
  c.canvasState.elements.push(dup);
  c.selectElement(dup.id);
  c.requestRender();
  saveCanvas(c.canvasState);
}

export function deleteSelection(c: any): void {
  if (!c.selectedElementIds.size) return;
  const keep = (el: CanvasElement | { id: string }): boolean => !c.selectedElementIds.has(el.id);
  /* drop elements */
  c.canvasState.elements = c.canvasState.elements.filter(keep);
  /* drop edges referencing deleted elements */
  c.canvasState.edges =
    c.canvasState.edges.filter(e => keep({ id: e.source }) && keep({ id: e.target }));
  c.clearSelection();
  c.requestRender();
  saveCanvas(c.canvasState);
}

/* ─── clipboard helpers ──────────────────────────────────────────────────── */

export function copySelection(c: any): void {
  if (!c.selectedElementIds.size) return;
  const els: CanvasElement[] = c.canvasState.elements
    .filter((el: CanvasElement) => c.selectedElementIds.has(el.id))
    .map((el: CanvasElement) => ({ ...el }));                               // deepish clone
  try { navigator.clipboard?.writeText(JSON.stringify(els)); } catch { }
  _clip.elements = els;
}

export function clipboardHasContent(): boolean {
  return Array.isArray(_clip.elements) && _clip.elements.length > 0;
}

export async function pasteClipboard(c: any): Promise<void> {
  if (!clipboardHasContent()) return;
  /* offset new items a bit */
  const now = Date.now();
  const pastedEls: CanvasElement[] = _clip.elements!.map((el: CanvasElement, i: number) => ({
    ...el,
    id: 'el-' + (now + i),
    x: el.x + 30,
    y: el.y + 30
  }));
  c.canvasState.elements.push(...pastedEls);
  c.selectedElementIds = new Set(pastedEls.map((e: CanvasElement) => e.id));
  c.requestRender();
  saveCanvas(c.canvasState);
}

/* ─── AI regenerate (non-image elements only) ─────────────────────────────── */

export async function generateNew(c: any): Promise<void> {
  if (c.selectedElementIds.size !== 1) return;
  const id = [...c.selectedElementIds][0];
  const el = c.findElementById(id);
  if (!el || el.type === 'img') return;
  const newContent = await generateContent(el.content, el, c);
  if (newContent) {
    el.content = newContent;
    c.updateElementNode(c.elementNodesMap[id], el, true);
    saveCanvas(c.canvasState);
  }
}

/* ─── quick inline edit using the existing modal ‐ one element only ───────── */

export function inlineEdit(c: any): void {
  if (c.selectedElementIds.size !== 1) return;
  const el = c.findElementById([...c.selectedElementIds][0]);
  console.log("opening edit modal for element:", el);
  c.openEditModal(el);
}

/* ─── re-order in Z space ─────────────────────────────────────────────────── */

export function reorder(c: any, dir: 'front' | 'back'): void {
  const delta = dir === 'front' ? +10 : -10;
  c.selectedElementIds.forEach((id: string) => {
    const el = c.findElementById(id);
    if (el) el.zIndex = (el.zIndex || 1) + delta;
  });
  c.requestRender();
  saveCanvas(c.canvasState);
}

/* ─── group / ungroup - minimalist implementation ‐───────────────────────── */
/* We emulate grouping by giving every element an optional `group` string.    */

function _nextGroupId(): string { return 'grp-' + Date.now().toString(36); }

export function groupSelection(c: any): void {
  if (c.selectedElementIds.size < 2) return;
  const gid = _nextGroupId();
  c.selectedElementIds.forEach((id: string) => {
    const el = c.findElementById(id);
    if (el) el.group = gid;
  });
  saveCanvas(c.canvasState);
}

export function canUngroup(c: any): boolean {
  return [...c.selectedElementIds].some((id: string) => {
    const el = c.findElementById(id);
    return el?.group;
  });
}

export function ungroupSelection(c: any): void {
  c.selectedElementIds.forEach((id: string) => {
    const el = c.findElementById(id);
    if (el && el.group) delete el.group;
  });
  saveCanvas(c.canvasState);
}

/* ─── viewport helpers ───────────────────────────────────────────────────── */

export function zoom(c: any, factor: number): void {
  c.viewState.scale = Math.min(
    Math.max(c.viewState.scale * factor, c.MIN_SCALE), c.MAX_SCALE);
  c.updateCanvasTransform();
  c.saveLocalViewState?.();
}

export function zoomToFit(c: any): void {
  /* fit all elements' bounding box into the visible canvas */
  if (!c.canvasState.elements.length) return;
  const xs: number[] = [], ys: number[] = [], xe: number[] = [], ye: number[] = [];
  c.canvasState.elements.forEach((el: CanvasElement) => {
    const s = el.scale || 1;
    xs.push(el.x - el.width * s / 2);
    ys.push(el.y - el.height * s / 2);
    xe.push(el.x + el.width * s / 2);
    ye.push(el.y + el.height * s / 2);
  });
  const bb = {
    x1: Math.min(...xs), y1: Math.min(...ys),
    x2: Math.max(...xe), y2: Math.max(...ye)
  };
  const W = c.canvas.clientWidth, H = c.canvas.clientHeight;
  const scaleX = W / (bb.x2 - bb.x1), scaleY = H / (bb.y2 - bb.y1);
  c.viewState.scale = Math.min(scaleX, scaleY) * 0.85;          // 15 % margin
  c.viewState.translateX = -bb.x1 * c.viewState.scale + (W - (bb.x2 - bb.x1) * c.viewState.scale) / 2;
  c.viewState.translateY = -bb.y1 * c.viewState.scale + (H - (bb.y2 - bb.y1) * c.viewState.scale) / 2;
  c.updateCanvasTransform();
  c.saveLocalViewState?.();
}

/* ─── version history & export stubs (minimal yet useful) ─────────────────── */

export function openHistory(c: any): void {
  const js = JSON.stringify(c.canvasState.versionHistory ?? [], null, 2);
  const w = window.open('', '_blank');
  w!.document.write(`<pre>${js.replace(/</g, '&lt;')}</pre>`);
}

export function exportJSON(c: any): void {
  const data = JSON.stringify(c.canvasState, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${c.canvasState.canvasId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/* Convert selection to a different element type */
export function changeType(c: any, newType: string): void {
  if (!c.selectedElementIds.size) return;
  Array.from(c.selectedElementIds).forEach((id: string) => {
    const el = c.findElementById(id);
    if (!el || el.type === newType) return;
    /* 1 . mutate */
    el.type = newType;
    /* 2 . refresh DOM */
    c.updateElementNode(c.elementNodesMap[id], el, true);
  });
  /* 3 . redraw & persist */
  c.requestRender();
  saveCanvas(c.canvasState);
  c._pushHistorySnapshot('type change');
}
