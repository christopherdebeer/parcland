/* ────────────────────────────────────────────────────────────────────────────
 *  menu-items.js                   (2025-05-04)
 *  Pure data – the hierarchical menu definition
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
 *  can inspect application state (selection, mode, …). 
 *  ────────────────────────────────────────────────────────────────────────── */

import { saveCanvas } from './storage.js';
import {
  addEl, duplicateEl, deleteSelection,
  copySelection, pasteClipboard, clipboardHasContent,
  generateNew, inlineEdit, reorder,
  groupSelection, ungroupSelection, canUngroup,
  zoom, zoomToFit, openHistory, exportJSON
} from './menu-item-helpers.js';
import { autoLayout } from './auto-layout.js';
import { align } from './align.js';

/**
 * buildRootItems(cfg)  → Item[]
 * Constructs and returns the root-level item array.
 */
export function buildRootItems(cfg) {

  return [
    /* ── Mode toggle ─────────────────────────────────────────────────────── */
    { label: 'Mode', icon: 'fa-arrows-alt', children: [
      {label: 'Edit', icon: 'fa-arrows-alt', action: c => c.switchMode('direct') },
      {label: 'View', icon: 'fa-arrows-alt', action: c => c.switchMode('navigate') },
      {label: 'Toggle', icon: 'fa-arrows-alt', action: c => c.switchMode() },
    ]},

    /* ── undo/redo ─────────────────────────────────────────────────────── */
    { label: 'Undo', icon: 'fa-rotate-left', action: c => c.undo() },
    { label: 'Redo', icon: 'fa-rotate-right', action: c => c.redo() },

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
        { label: 'Inline Edit', icon: 'fa-i-cursor', action: c => inlineEdit(c) },
        {
          label: 'Auto-Layout', icon: 'fa-wand-magic-sparkles', children: [
            { label: '→  Right', action: c => autoLayout(c, { direction: 'RIGHT' }) },
            { label: '↓  Down', action: c => autoLayout(c, { direction: 'DOWN' }) },
            { label: '⇆  Left', action: c => autoLayout(c, { direction: 'LEFT' }) },
            { label: '↕  Up', action: c => autoLayout(c, { direction: 'UP' }) },
            { label: 'Radial', action: c => autoLayout(c, { algorithm: 'radial' }) }
          ]
        },
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
        },
        {
          label: 'Align', icon: 'fa-align-left',
          children: [
            { label: 'Left', action: (c) => align(c, { axis: 'x', pos: 'min' }) },
            { label: 'Right', action: (c) => align(c, { axis: 'x', pos: 'max' }) },
            { label: 'Top', action: (c) => align(c, { axis: 'y', pos: 'min' }) },
            { label: 'Bottom', action: (c) => align(c, { axis: 'y', pos: 'max' }) },
            { label: 'Centre Vert', action: (c) => align(c, { axis: 'x', pos: 'center' }) },
            { label: 'Centre Horiz', action: (c) => align(c, { axis: 'y', pos: 'center' }) },
          ]
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
  ];
}
