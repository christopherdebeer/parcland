/* ------------------------------------------------------------------ */
/*  Imports – Yjs core + WebRTC provider                              */
/* ------------------------------------------------------------------ */
import * as Y from 'https://cdn.jsdelivr.net/npm/yjs@latest/+esm';
import { WebrtcProvider } from 'https://cdn.jsdelivr.net/npm/y-webrtc@latest/+esm';

/* ------------------------------------------------------------------ */
/*  Helpers (unchanged)                                               */
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
    if (k === 'elements' || k === 'edges') return;
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
/**
 * @param {Object}  initialSnap  First full snapshot from your model layer
 * @param {Object} [opts]        Optional tweakables
 * @param {string} [opts.room='demo-room']  Shared room name – peers must match
 * @param {Object} [opts.rtc={}] Passed straight to WebrtcProvider (signaling,
 *                               password, peerOpts, maxConns …)
 */
export function createCrdtAdapter(initialSnap, opts = {}) {
  /* ------------- 1. Create the CRDT ------------------------------- */
  const doc = new Y.Doc();

  /* Lazily create shared types the first time */
  doc.getArray('elements');
  doc.getArray('edges');
  doc.getMap('meta');

  _plainToY(doc, initialSnap);

  /* ------------- 2. Wire it to WebRTC ----------------------------- */
  const {
    room = 'demo-room',
    rtc  = {}
  } = opts;

  // one provider per adapter; starts signalling immediately
  const provider = new WebrtcProvider(room, doc, {
    // keep defaults but allow caller to override anything
    signaling : ['wss://signaling.yjs.dev'],
    ...rtc
  });

  /* ------------- 3. Adapter API (same as before) ------------------ */
  return {
    doc,          // expose for power-users / debugging
    provider,     // (new) – lets callers inspect awareness, etc.

    /** Get a full plain-JSON snapshot (for /save, undo, etc.) */
    exportSnapshot() { return _yToPlain(doc); },

    /**
     * Apply a raw Yjs binary update.
     * NOTE: not needed for WebRTC sync, but retained for compatibility
     *       (e.g. unit tests or alternate transports).
     */
    applyRemote(update) { Y.applyUpdate(doc, update); },

    /** During the “shim” phase, copy fresh JS → CRDT before we save */
    refreshFromPlain(snap) { _plainToY(doc, snap); },

    /**
     * Subscribe to *local* changes only (so you can broadcast them
     * elsewhere if you add another transport).
     *
     * The callback receives the Yjs binary `update`.
     */
    onLocalUpdate(cb) {
      doc.on('update', (update, origin) => {
        // y-webrtc tags remote updates with the provider instance.
        if (origin === provider) return;     // remote – ignore
        cb(update);                          // local – notify caller
      });
    }
  };
}
