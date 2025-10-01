/* ---------------------------------------------------------------------------
 *  storage.js
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
  saveCanvasLocalOnly(canvasState);

  const token = getAuthToken();
  if (!token) {
    console.warn('No auth token found – skipping remote save');
    return;
  }

  const namespace = 'websim';
  const canvasId = canvasState.canvasId;
  try {
    const res = await fetch(
      `https://backpack.parc.land/${namespace}/${canvasId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: serializeCanvas(canvasState)
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
      `https://backpack.parc.land/websim/${key}`,
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
      `https://backpack.parc.land/websim/${defaultState.canvasId}`,
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
  return JSON.stringify(obj);
}
