import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@13.6.9/+esm';

// -- internal helpers ---------------------------------------------------------
function _plainToY(root, snap) {
  // we copy the two big arrays 1-to-1; anything extra just JSON-stringifies
  const yEls   = root.getArray('elements');
  const yEdges = root.getArray('edges');
  yEls.delete(0, yEls.length);               // clear & refill
  yEdges.delete(0, yEdges.length);
  yEls.push(snap.elements   ?? []);
  yEdges.push(snap.edges    ?? []);

  // any other top-level keys (canvasId, versionHistory, …)
  Object.entries(snap).forEach(([k,v])=>{
    if(k==='elements'||k==='edges') return;
    root.set(k, v);
  });
}

function _yToPlain(root){
  return root.toJSON();                       // same tree you had before
}

// -- public API ---------------------------------------------------------------
export function createCrdtAdapter(initialSnap){
  const doc  = new Y.Doc();
  const root = doc.getMap('canvas');
  _plainToY(root, initialSnap);

  /* 1 ◇ push a plain-JSON snapshot (for legacy /save) */
  function exportSnapshot(){ return _yToPlain(root); }

  /* 2 ◇ replay an incoming binary Yjs update (future WS step) */
  function applyRemote(update){ Y.applyUpdate(doc, update); }

  /* 3 ◇ cheap sync for “shim only” phase */
  function refreshFromPlain(latestPlain){ _plainToY(root, latestPlain); }

  /* 4 ◇ hook to ship deltas later */
  function onLocalUpdate(cb){
    doc.on('update', cb);            // gives Uint8Array update frame
  }

  return { doc, exportSnapshot, applyRemote, refreshFromPlain, onLocalUpdate };
}
