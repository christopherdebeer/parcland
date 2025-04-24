

let saveTimeout;
const DEBOUNCE_SAVE_DELAY = 300;
const TOKEN_KEY = "PARC.LAND/BKPK_TOKEN";

export async function saveCanvas(canvasState) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        _saveCanvas(canvasState);
    }, DEBOUNCE_SAVE_DELAY);
}

async function _saveCanvas(canvasState) {
    saveCanvasLocalOnly(canvasState);
    const token = getAuthToken();
    if (!token) {
        console.warn("No auth token found, skipping API save");
        return;
    }
    const canvasId = canvasState.canvasId;
    const namespace = "websim";
    try {
        const response = await fetch(`https://c15r-parcland_backpack.web.val.run/${namespace}/${canvasId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: serializeCanvas(canvasState)
        });
        const result = await response.json();
        console.log(`Canvas ${canvasId} saved to API`, result);
    } catch (error) {
        console.error(`Error saving canvas ${canvasId} to API:`, error);
    }
}

export async function setBackpackItem(key, val) {
    const token = getAuthToken();
    if (!token) {
        console.warn("No auth token found, skipping API save");
        return;
    }
    try {
        const response = await fetch(`https://c15r-parcland_backpack.web.val.run/websim/${key}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: val,
        });
        const result = await response.json();
        console.log(`Backpack item ${key} saved to API`, result);
    } catch (error) {
        console.error(`Error saving backpack item ${key} to API:`, error);
    }
}

export function saveCanvasLocalOnly(canvasState) {
    localStorage.setItem("myCanvasData_" + canvasState.canvasId, serializeCanvas(canvasState));
}

export function getAuthToken() {
    const key = TOKEN_KEY;
    let token = localStorage.getItem(key);
    if (!token) {
        localStorage.setItem(key, "TBC");
        token = "TBC";
    }
    return token;
}

export async function loadInitialCanvas(defaultState, paramToken) {

    let token = paramToken || localStorage.getItem(TOKEN_KEY);
    if (!token) {
        token = "TBC";
    }
    localStorage.setItem(TOKEN_KEY, token);
    const savedLocal = localStorage.getItem("myCanvasData_" + defaultState.canvasId);
    try {
        const namespace = "websim";
        const response = await fetch(`https://c15r-parcland_backpack.web.val.run/${namespace}/${defaultState.canvasId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        } else {
            console.warn("Failed to load from API, fallback local");
            if (savedLocal) {
                return JSON.parse(savedLocal);
            } else {
                return defaultState;
            }
        }
    } catch (error) {
        console.error("Error loading from API", error);
        if (savedLocal) {
            return JSON.parse(savedLocal);
        } else {
            return defaultState;
        }
    }
}

function serializeCanvas(canvasState) {
    return JSON.stringify(canvasState);
}