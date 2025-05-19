import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.9/+esm';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

/** push plain JS `snap` into the Yjs structures in-place */
function _plainToY(doc, snap) {
  const yEls   = doc.getArray('elements');
  const yEdges = doc.getArray('edges');

  // Clear and refill arrays (keeps indices identical to plain list)
  yEls.delete(0, yEls.length);
  yEdges.delete(0, yEdges.length);
  yEls.push(snap.elements ?? []);
  yEdges.push(snap.edges   ?? []);

  // copy every other top-level scalar / object into a map
  const meta = doc.getMap('meta');
  meta.clear();
  Object.entries(snap).forEach(([k, v]) => {
    if (k.startsWith("__") || k === 'elements' || k === 'edges') return;
    meta.set(k, v);
  });
}

/** Convert the current Y.Doc state back to the exact JSON your app expects */
function _yToPlain(doc) {
  const meta   = doc.getMap('meta').toJSON();
  return {
    ...meta,
    elements: doc.getArray('elements').toJSON(),
    edges   : doc.getArray('edges').toJSON()
  };
}

/* ------------------------------------------------------------------ */
/*  Public factory – called once per CanvasController                 */
/* ------------------------------------------------------------------ */
export function createCrdtAdapter(initialSnap) {
  const doc = new Y.Doc();

  /* lazily create shared types the first time */
  doc.getArray('elements');   // instantiate
  doc.getArray('edges');
  doc.getMap('meta');

  _plainToY(doc, initialSnap);

  /* API surface that the controller / storage layer will use */
  return {
    doc,

    /** Get a full plain-JSON snapshot (for /save, undo, etc.) */
    exportSnapshot() { return _yToPlain(doc); },

    /** Feed an incoming binary update (when you add WebSocket sync) */
    applyRemote(update) { Y.applyUpdate(doc, update); },

    /** During the “shim” phase, copy fresh JS → CRDT before we save */
    refreshFromPlain(snap) { _plainToY(doc, snap); },

    /** Subscribe to local changes (to broadcast later) */
    onLocalUpdate(cb) { doc.on('update', cb); }
  };
}
