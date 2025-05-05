/* ────────────────────────────────────────────────────────────────────────────
 *  radial-menu-items.js                   (2025-05-04)
 *  Pure data – the hierarchical menu definition used by radial-menu core.
 *
 *  ── Item schema ───────────────────────────────────────────────────────────
 *  An “item” is a plain object with these optional properties
 *
 *    label    : string | (controller,cfg)=>string
 *    icon     : string | (controller,cfg)=>string   (Font-Awesome class list)
 *    action   : (controller)=>void                  (no return value expected)
 *    children : Item[]                              (turns this item into a
 *                                                    submenu parent)
 *    visible  : (controller)=>boolean               (default true)
 *    enabled  : (controller)=>boolean               (default true — ignored
 *                                                    by the engine for now)
 *
 *  The *controller* argument is the live CanvasController instance so an item
 *  can inspect application state (selection, mode, …).  *cfg* is the menu
 *  configuration object (see radial-menu.js).
 *  ────────────────────────────────────────────────────────────────────────── */

import { saveCanvas } from './storage.js';
import {
  addEl, duplicateEl, deleteSelection,
  copySelection, pasteClipboard, clipboardHasContent,
  generateNew, inlineEdit, reorder,
  groupSelection, ungroupSelection, canUngroup,
  zoom, zoomToFit, openHistory, exportJSON
} from './radial-helpers.js';

/**
 * buildRootItems(cfg)  → Item[]
 * Constructs and returns the root-level item array.
 * cfg is the *live* configuration object so Settings labels can show the
 * latest numbers.
 */
export function buildRootItems(cfg) {

  /* helper to shorten Settings actions ------------------------------------ */
  const bump = (field, delta, controller) => {
    cfg[field] = Math.round(Math.min(
      (field === 'transitionTime' ? 1.05 : 400),
      Math.max(field === 'transitionTime' ? 0.15 : 32, cfg[field] + delta)
    ) * 100) / 100;
    localStorage.setItem('parc.radialMenu.cfg', JSON.stringify(cfg));
    controller.__rm_relayout?.();
  };

  return [
    /* ── Mode toggle ─────────────────────────────────────────────────────── */
    {
      label: c => c.mode === 'direct' ? 'Navigate' : 'Direct',
      icon: c => c.mode === 'direct' ? 'fa-arrows-alt' : 'fa-hand',
      action: c => c.switchMode(c.mode === 'direct' ? 'navigate' : 'direct')
    },

    /* ── Add … ───────────────────────────────────────────────────────────── */
    {
      label: 'Add', icon: 'fa-plus-circle', children: [
        { label: 'Text', icon: 'fa-font', action: c => addEl(c, 'text') },
        { label: 'Markdown', icon: 'fa-brands fa-markdown', action: c => addEl(c, 'markdown') },
        { label: 'Image', icon: 'fa-image', action: c => addEl(c, 'img') },
        { label: 'Canvas', icon: 'fa-object-group', action: c => addEl(c, 'canvas-container') },
        { label: 'AI-Generate', icon: 'fa-wand-magic-sparkles', action: c => addEl(c, 'markdown', 'generating…') }
      ]
    },

    /* ── Edit / Clipboard ───────────────────────────────────────────────── */
    {
      label: 'Edit', icon: 'fa-pen-to-square',
      visible: c => c.selectedElementIds.size > 0,
      children: [
        {
          label: 'Duplicate', icon: 'fa-copy',
          action: c => c.selectedElementIds.forEach(id => duplicateEl(c, id))
        },
        { label: 'Delete', icon: 'fa-trash', action: c => deleteSelection(c) },
        { label: 'Copy', icon: 'fa-clone', action: c => copySelection(c) },
        {
          label: 'Paste', icon: 'fa-paste', enabled: () => clipboardHasContent(),
          action: c => pasteClipboard(c)
        },
        {
          label: 'Generate New', icon: 'fa-arrow-rotate-right',
          enabled: c => (c.selectedElementIds.size === 1 &&
            c.findElementById([...c.selectedElementIds][0]).type !== 'img'),
          action: c => generateNew(c)
        },
        { label: 'Inline Edit', icon: 'fa-i-cursor', action: c => inlineEdit(c) }
      ]
    },

    /* ── Arrange ─────────────────────────────────────────────────────────── */
    {
      label: 'Arrange', icon: 'fa-layer-group',
      visible: c => c.selectedElementIds.size > 0,
      children: [
        { label: 'Bring Front', icon: 'fa-arrow-up', action: c => reorder(c, 'front') },
        { label: 'Send Back', icon: 'fa-arrow-down', action: c => reorder(c, 'back') },
        {
          label: 'Group', icon: 'fa-object-group',
          enabled: c => c.selectedElementIds.size > 1,
          action: c => groupSelection(c)
        },
        {
          label: 'Ungroup', icon: 'fa-object-ungroup',
          enabled: c => canUngroup(c),
          action: c => ungroupSelection(c)
        }
      ]
    },

    /* ── View ────────────────────────────────────────────────────────────── */
    {
      label: 'View', icon: 'fa-search', children: [
        { label: 'Zoom In', icon: 'fa-search-plus', action: c => zoom(c, 1.25) },
        { label: 'Zoom Out', icon: 'fa-search-minus', action: c => zoom(c, 0.8) },
        { label: 'Reset Zoom', icon: 'fa-compress', action: c => zoom(c, 1 / c.viewState.scale) },
        { label: 'Zoom to Fit', icon: 'fa-expand', action: c => zoomToFit(c) }
      ]
    },

    /* ── Canvas ──────────────────────────────────────────────────────────── */
    {
      label: 'Canvas', icon: 'fa-database', children: [
        { label: 'Save', icon: 'fa-save', action: c => saveCanvas(c.canvasState) },
        { label: 'History', icon: 'fa-clock', action: c => openHistory(c) },
        { label: 'Export JSON', icon: 'fa-file-export', action: c => exportJSON(c) }
      ]
    },

    /* ── ⚙ Settings  (uses bump helper) ─────────────────────────────────── */
    {
      label: 'Settings', icon: 'fa-gear', children: [
        {
          label: () => `Orbit  ${cfg.orbitRadius}px  +`, icon: 'fa-plus',
          action: c => bump('orbitRadius', +20, c)
        },
        {
          label: () => `Orbit  ${cfg.orbitRadius}px  –`, icon: 'fa-minus',
          action: c => bump('orbitRadius', -20, c)
        },

        {
          label: () => `Items  ${cfg.itemSize}px  +`, icon: 'fa-plus',
          action: c => bump('itemSize', +8, c)
        },
        {
          label: () => `Items  ${cfg.itemSize}px  –`, icon: 'fa-minus',
          action: c => bump('itemSize', -8, c)
        },

        {
          label: () => `Speed  ${cfg.transitionTime}s +`, icon: 'fa-plus',
          action: c => bump('transitionTime', +.15, c)
        },
        {
          label: () => `Speed  ${cfg.transitionTime}s –`, icon: 'fa-minus',
          action: c => bump('transitionTime', -.15, c)
        },

        {
          label: () => cfg.fullCircle ? 'Use 90° fan' : 'Use 360° ring',
          icon: 'fa-arrows-spin',
          action: c => {
            cfg.fullCircle = !cfg.fullCircle;
            localStorage.setItem('parc.radialMenu.cfg', JSON.stringify(cfg));
            c.__rm_relayout?.();
          }
        }
      ]
    }
  ];
}
