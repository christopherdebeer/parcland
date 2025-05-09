import { saveCanvas } from './storage.js';

export function align(c, { axis = 'x', pos = 'min' } = {}) {
  if (c.selectedElementIds.size < 2) return;
  const els = [...c.selectedElementIds].map(id => c.findElementById(id));
  if (axis === 'x') {
    const target = pos === 'min'
      ? Math.min(...els.map(e => e.x))
      : pos === 'max'
        ? Math.max(...els.map(e => e.x))
        : (Math.min(...els.map(e => e.x)) + Math.max(...els.map(e => e.x))) / 2;
    els.forEach(e => e.x = target);
  } else {
    const target = pos === 'min'
      ? Math.min(...els.map(e => e.y))
      : pos === 'max'
        ? Math.max(...els.map(e => e.y))
        : (Math.min(...els.map(e => e.y)) + Math.max(...els.map(e => e.y))) / 2;
    els.forEach(e => e.y = target);
  }
  c.renderElements(); saveCanvas(c.canvasState);
}
