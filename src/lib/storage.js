/* ---------------------------------------------------------------------------
 *  storage.js                   (CRDT-aware version – May 2025)
 *  - Keeps the existing save/​load API exactly the same.
 *  - If the current CanvasController has attached a Yjs adapter
 *    on canvasState.__crdt, we:
 *        1.  push the latest plain JS mutations into the Y.Doc
 *        2.  serialise the adapter’s snapshot instead of the raw object
 * ------------------------------------------------------------------------- */

let saveTimeout;
const DEBOUNCE_SAVE_DELAY = 300;
const TOKEN_KEY = 'PARC.LAND/BKPK_TOKEN';

/* ------------------------------------------------------------------ */
/*  Public API – callers stay unchanged                               */
/* ------------------------------------------------------------------ */

export function saveCanvas(canvasState) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(
    () => _saveCanvas(canvasState),
    DEBOUNCE_SAVE_DELAY
  );
}

/* ------------------------------------------------------------------ */
/*  Implementation                                                    */
/* ------------------------------------------------------------------ */

async function _saveCanvas(canvasState) {
  /* ①  Is a CRDT adapter present for this controller? */
  const adapter = canvasState?.__crdt;

  /* ②  Keep the adapter up-to-date with the *mutable* model */
  if (adapter) adapter.refreshFromPlain(canvasState);

  /* ③  Decide what we actually persist */
  const snapshot = adapter ? adapter.exportSnapshot() : canvasState;

  /* ----- 3a.  localStorage backup (debounced) --------------------- */
  saveCanvasLocalOnly(snapshot);

  /* ----- 3b.  PUT to your backend ------------------------------- */
  const token = getAuthToken();
  if (!token) {
    console.warn('No auth token found – skipping remote save');
    return;
  }

  const namespace = 'websim';
  const canvasId = snapshot.canvasId;
  try {
    const res = await fetch(
      `https://c15r-parcland_backpack.web.val.run/${namespace}/${canvasId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: serializeCanvas(snapshot)
      }
    );
    const json = await res.json();
    console.log(`Canvas ${canvasId} saved`, json);
  } catch (err) {
    console.error(`Error saving canvas ${canvasId}`, err);
  }
}

/* ------------------------------------------------------------------ */
/*  Utility helpers (unchanged except for serialising `snapshot`)     */
/* ------------------------------------------------------------------ */

export async function setBackpackItem(key, val) {
  const token = getAuthToken();
  if (!token) {
    console.warn('No auth token – skipping API save');
    return;
  }
  try {
    const res = await fetch(
      `https://c15r-parcland_backpack.web.val.run/websim/${key}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: val
      }
    );
    console.log(`Backpack item ${key} saved`, await res.json());
  } catch (err) {
    console.error(`Error saving backpack item ${key}`, err);
  }
}

export function saveCanvasLocalOnly(state) {
  const key = 'myCanvasData_' + state.canvasId;
  try {
    localStorage.setItem(key, serializeCanvas(state));
  } catch (err) {
    console.warn('localStorage quota?', err);
  }
}

export function getAuthToken() {
  let tok = localStorage.getItem(TOKEN_KEY);
  if (!tok) {
    tok = 'TBC';
    localStorage.setItem(TOKEN_KEY, tok);
  }
  return tok;
}

export async function loadInitialCanvas(defaultState, paramToken) {
  let token = paramToken || localStorage.getItem(TOKEN_KEY) || 'TBC';
  localStorage.setItem(TOKEN_KEY, token);

  const localKey = 'myCanvasData_' + defaultState.canvasId;
  const localCopy = localStorage.getItem(localKey);

  try {
    const res = await fetch(
      `https://c15r-parcland_backpack.web.val.run/websim/${defaultState.canvasId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (res.ok) return await res.json();
    console.warn('Remote load failed, falling back to local copy');
  } catch (err) {
    console.error('Error loading canvas from API', err);
  }
  return localCopy ? JSON.parse(localCopy) : defaultState;
}

function serializeCanvas(obj) {
  return JSON.stringify({ ...obj, __crdt: undefined });
}
