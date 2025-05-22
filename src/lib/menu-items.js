import { saveCanvas } from './storage.js';
import {
  addEl, duplicateEl, deleteSelection, changeType,
  copySelection, pasteClipboard, clipboardHasContent,
  generateNew, inlineEdit, reorder,
  groupSelection, ungroupSelection, canUngroup,
  zoom, zoomToFit, openHistory, exportJSON
} from './menu-item-helpers.js';
import { autoLayout } from './auto-layout.js';
import { align } from './align.js';

function buildTypeItems(controller) {
  /* 1 – native + plug-ins */
  const base = [
    { type: 'text', icon: 'fa-font', shortcut: '⌘⇧T' },
    { type: 'markdown', icon: 'fa-brands fa-markdown', shortcut: '⌘⇧M' },
    { type: 'img', icon: 'fa-image', shortcut: '⌘⇧I' },
    { type: 'html', icon: 'fa-code', shortcut: '⌘⇧H' },
  ];
  const extras = controller.elementRegistry      // dynamic plug-ins
    ?.listTypes()
    .filter(t => !base.some(b => b.type === t))
    .map(t => ({ type: t, icon: 'fa-cube' })) || [];
  /* 2 – emit menu items */
  return [...base, ...extras].map(t => ({
    label: t.type,
    icon: t.icon,
    category: 'Convert',
    shortcut: t.shortcut,
    action: c => changeType(c, t.type)
  }));
}

/**
 * buildRootItems(cfg)  → Item[]
 * Constructs and returns the root-level item array.
 */
export function buildRootItems(controller) {

  return [
    /* ── Mode toggle ─────────────────────────────────────────────────────── */
    {
      label: 'Mode', icon: 'fa-arrows-alt', category: 'Navigation', children: [
        { label: 'Edit', icon: 'fa-pen-to-square', shortcut: '⌘E', action: c => c.switchMode('direct') },
        { label: 'View', icon: 'fa-eye', shortcut: '⌘V', action: c => c.switchMode('navigate') },
        { label: 'Toggle', icon: 'fa-toggle-on', shortcut: '⌘T', action: c => c.switchMode() },
      ]
    },

    /* ── undo/redo ─────────────────────────────────────────────────────── */
    { label: 'Undo', icon: 'fa-rotate-left', category: 'Edit', shortcut: '⌘Z', action: c => c.undo() },
    { label: 'Redo', icon: 'fa-rotate-right', category: 'Edit', shortcut: '⌘⇧Z', action: c => c.redo() },

    /* ── Add … ───────────────────────────────────────────────────────────── */
    {
      label: 'Add', icon: 'fa-plus-circle', category: 'Create', children: [
        { label: 'Text', icon: 'fa-font', category: 'Create', shortcut: '⌘N T', needsInput: true, action: (c, text) => addEl(c, 'text', text) },
        { label: 'Markdown', icon: 'fa-brands fa-markdown', category: 'Create', shortcut: '⌘N M', needsInput: true, action: (c, text) => addEl(c, 'markdown', text) },
        { label: 'Image', icon: 'fa-image', category: 'Create', shortcut: '⌘N I', needsInput: true, action: (c, text) => addEl(c, 'img', text) },
        { label: 'Canvas', icon: 'fa-object-group', category: 'Create', shortcut: '⌘N C', action: c => addEl(c, 'canvas-container') },
        { 
  label: 'AI-Generate', 
  icon: 'fa-wand-magic-sparkles', 
  category: 'AI', 
  shortcut: '⌘N A', 
  needsInput: true, 
  action: async (c, text) => {
    const { innerWidth: W, innerHeight: H } = window;
    const pt = c.screenToCanvas(W / 2, H / 2);
    const elId = c.createNewElement(pt.x, pt.y, 'markdown', text || 'generating…');
    const el = c.findElementById(elId);
    const newContent = await generateContent(text, el, c);
    if (newContent) {
      el.content = newContent;
      c.updateElementNode(c.elementNodesMap[elId], el, true);
      saveCanvas(c.canvasState);
    }
  }
},
      ]
    },

    /* ── Edit / Clipboard ───────────────────────────────────────────────── */
    {
      label: 'Edit', icon: 'fa-pen-to-square',
      category: 'Edit',
      visible: c => c.selectedElementIds.size > 0,
      children: [
        {
          label: 'Duplicate', icon: 'fa-copy', category: 'Edit',
          shortcut: '⌘D',
          action: c => c.selectedElementIds.forEach(id => duplicateEl(c, id))
        },
        { label: 'Delete', icon: 'fa-trash', category: 'Edit', shortcut: '⌫', action: c => deleteSelection(c) },
        { label: 'Copy', icon: 'fa-clone', category: 'Edit', shortcut: '⌘C', action: c => copySelection(c) },
        {
          label: 'Paste', icon: 'fa-paste', category: 'Edit', shortcut: '⌘V',
          enabled: () => clipboardHasContent(),
          action: c => pasteClipboard(c)
        },
        {
          label: 'Generate New', icon: 'fa-arrow-rotate-right', category: 'AI',
          shortcut: '⌘G',
          enabled: c => (c.selectedElementIds.size === 1 &&
            c.findElementById([...c.selectedElementIds][0]).type !== 'img'),
          action: c => generateNew(c)
        },
        { label: 'Inline Edit', icon: 'fa-i-cursor', category: 'Edit', shortcut: '⌘E', action: c => inlineEdit(c) },
        {
          label: 'Auto-Layout', icon: 'fa-wand-magic-sparkles', category: 'Layout', children: [
            { label: '→  Right', category: 'Layout', shortcut: '⌘⇧→', action: c => autoLayout(c, { direction: 'RIGHT' }) },
            { label: '↓  Down', category: 'Layout', shortcut: '⌘⇧↓', action: c => autoLayout(c, { direction: 'DOWN' }) },
            { label: '⇆  Left', category: 'Layout', shortcut: '⌘⇧←', action: c => autoLayout(c, { direction: 'LEFT' }) },
            { label: '↕  Up', category: 'Layout', shortcut: '⌘⇧↑', action: c => autoLayout(c, { direction: 'UP' }) },
            { label: 'Radial', category: 'Layout', shortcut: '⌘⇧R', action: c => autoLayout(c, { algorithm: 'radial' }) }
          ]
        },
        { label: 'Convert Type', icon: 'fa-shapes', category: 'Edit', children: buildTypeItems(controller) },
      ]
    },

    /* ── Arrange ─────────────────────────────────────────────────────────── */
    {
      label: 'Arrange', icon: 'fa-layer-group',
      category: 'Layout',
      visible: c => c.selectedElementIds.size > 0,
      children: [
        { label: 'Bring Front', icon: 'fa-arrow-up', category: 'Layout', shortcut: '⌘]', action: c => reorder(c, 'front') },
        { label: 'Send Back', icon: 'fa-arrow-down', category: 'Layout', shortcut: '⌘[', action: c => reorder(c, 'back') },
        {
          label: 'Group', icon: 'fa-object-group', category: 'Layout', shortcut: '⌘G',
          enabled: c => c.selectedElementIds.size > 1,
          action: c => groupSelection(c)
        },
        {
          label: 'Ungroup', icon: 'fa-object-ungroup', category: 'Layout', shortcut: '⌘⇧G',
          enabled: c => canUngroup(c),
          action: c => ungroupSelection(c)
        },
        {
          label: 'Align', icon: 'fa-align-left', category: 'Layout',
          children: [
            { label: 'Left', category: 'Layout', shortcut: '⌘⌥L', action: (c) => align(c, { axis: 'x', pos: 'min' }) },
            { label: 'Right', category: 'Layout', shortcut: '⌘⌥R', action: (c) => align(c, { axis: 'x', pos: 'max' }) },
            { label: 'Top', category: 'Layout', shortcut: '⌘⌥T', action: (c) => align(c, { axis: 'y', pos: 'min' }) },
            { label: 'Bottom', category: 'Layout', shortcut: '⌘⌥B', action: (c) => align(c, { axis: 'y', pos: 'max' }) },
            { label: 'Centre Vert', category: 'Layout', shortcut: '⌘⌥V', action: (c) => align(c, { axis: 'x', pos: 'center' }) },
            { label: 'Centre Horiz', category: 'Layout', shortcut: '⌘⌥H', action: (c) => align(c, { axis: 'y', pos: 'center' }) },
          ]
        }
      ]
    },

    /* ── View ────────────────────────────────────────────────────────────── */
    {
      label: 'View', icon: 'fa-search', category: 'Navigation', children: [
        { label: 'Zoom In', icon: 'fa-search-plus', category: 'Navigation', shortcut: '⌘+', action: c => zoom(c, 1.25) },
        { label: 'Zoom Out', icon: 'fa-search-minus', category: 'Navigation', shortcut: '⌘-', action: c => zoom(c, 0.8) },
        { label: 'Reset Zoom', icon: 'fa-compress', category: 'Navigation', shortcut: '⌘0', action: c => zoom(c, 1 / c.viewState.scale) },
        { label: 'Zoom to Fit', icon: 'fa-expand', category: 'Navigation', shortcut: '⌘1', action: c => zoomToFit(c) }
      ]
    },

    /* ── Canvas ──────────────────────────────────────────────────────────── */
    {
      label: 'Canvas', icon: 'fa-database', category: 'File', children: [
        { label: 'Save', icon: 'fa-save', category: 'File', shortcut: '⌘S', action: c => saveCanvas(c.canvasState) },
        { label: 'History', icon: 'fa-clock', category: 'File', shortcut: '⌘H', action: c => openHistory(c) },
        { label: 'Export JSON', icon: 'fa-file-export', category: 'File', shortcut: '⌘⇧E', action: c => exportJSON(c) }
      ]
    },
  ];
}
