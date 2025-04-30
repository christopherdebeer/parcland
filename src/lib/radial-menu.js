Radial Menu for parc.land  — v2 (2025-04-29)
 *  • context-sensitive launcher that replaces the old #mode toggle button
 *  • major revamp: a11y, keyboard nav, persistence, configurability, etc.
 * ---------------------------------------------------------------------------
 *  author: parc.land core team
 * ---------------------------------------------------------------------------
 */

import { saveCanvas } from './storage.js';
import { 
 addEl,
 duplicateEl,
 deleteSelection,
 copySelection,
 pasteClipboard,
 clipboardHasContent,
 generateNew,
 inlineEdit,
 reorder,
 groupSelection,
 ungroupSelection,
 canUngroup,
 zoom,
 zoomToFit,
 openHistory,
 exportJSON } from './radial-helpers.js';

/* keep at most one DOM instance alive across controllers */
let activeRoot = null;
/* localStorage key for persisted menu position */
const LS_POS_KEY = 'parc.radialMenu.pos';

/*********************************************************************
 * Radial-menu structure for parc.land (2025-04-29)
 * Each item can carry `visible()`  and / or  `enabled()` getters.
 *********************************************************************/
const rootItems  = [
  /* ───── Mode toggle ───── */
  {
    label : c => c.mode === 'direct' ? 'Navigate' : 'Direct',
    icon 
