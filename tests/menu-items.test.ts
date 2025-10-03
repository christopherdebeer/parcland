/**
 * Unit tests for menu-items
 * Testing command palette menu structure
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { buildRootItems } from '../src/lib/cmd-palette/menu-items';

// Mock dependencies
jest.mock('../src/lib/network/storage', () => ({
  saveCanvas: jest.fn()
}));

jest.mock('../src/lib/network/generation', () => ({
  generateContent: jest.fn().mockResolvedValue('Generated content')
}));

jest.mock('../src/lib/cmd-palette/menu-item-helpers', () => ({
  addEl: jest.fn(),
  duplicateEl: jest.fn(),
  deleteSelection: jest.fn(),
  changeType: jest.fn(),
  copySelection: jest.fn(),
  pasteClipboard: jest.fn(),
  clipboardHasContent: jest.fn(() => true),
  generateNew: jest.fn(),
  inlineEdit: jest.fn(),
  reorder: jest.fn(),
  groupSelection: jest.fn(),
  ungroupSelection: jest.fn(),
  canUngroup: jest.fn(() => true),
  zoom: jest.fn(),
  zoomToFit: jest.fn(),
  openHistory: jest.fn(),
  exportJSON: jest.fn()
}));

jest.mock('../src/lib/layout/auto-layout', () => ({
  autoLayout: jest.fn()
}));

jest.mock('../src/lib/layout/align', () => ({
  align: jest.fn()
}));

describe('Menu Items', () => {
  let mockController: any;

  beforeEach(() => {
    mockController = {
      selectedElementIds: new Set<string>(),
      canvasState: { elements: [], edges: [] },
      elementRegistry: {
        listTypes: jest.fn(() => ['json', 'custom'])
      },
      switchMode: jest.fn(),
      undo: jest.fn(),
      redo: jest.fn(),
      findElementById: jest.fn((id: string) => ({
        id,
        type: 'text',
        content: 'Test'
      }))
    };
  });

  describe('buildRootItems', () => {
    it('should return array of menu items', () => {
      const items = buildRootItems(mockController);

      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it('should include Mode menu with Edit/View/Toggle options', () => {
      const items = buildRootItems(mockController);
      const modeMenu = items.find(item => item.label === 'Mode');

      expect(modeMenu).toBeDefined();
      expect(modeMenu?.children).toBeDefined();
      expect(modeMenu?.children?.length).toBe(3);

      const labels = modeMenu?.children?.map(c => c.label);
      expect(labels).toContain('Edit');
      expect(labels).toContain('View');
      expect(labels).toContain('Toggle');
    });

    it('should include Undo/Redo actions', () => {
      const items = buildRootItems(mockController);

      const undo = items.find(item => item.label === 'Undo');
      const redo = items.find(item => item.label === 'Redo');

      expect(undo).toBeDefined();
      expect(redo).toBeDefined();
      expect(undo?.shortcut).toBe('⌘Z');
      expect(redo?.shortcut).toBe('⌘⇧Z');
    });

    it('should include Add submenu with create options', () => {
      const items = buildRootItems(mockController);
      const addMenu = items.find(item => item.label === 'Add');

      expect(addMenu).toBeDefined();
      expect(addMenu?.children).toBeDefined();

      const labels = addMenu?.children?.map(c => c.label);
      expect(labels).toContain('Text');
      expect(labels).toContain('Markdown');
      expect(labels).toContain('Image');
      expect(labels).toContain('Canvas');
      expect(labels).toContain('Generate');
    });

    it('should include Edit submenu with context-aware visibility', () => {
      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');

      expect(editMenu).toBeDefined();
      expect(editMenu?.visible).toBeDefined();

      // Should not be visible with no selection
      expect(editMenu?.visible?.(mockController)).toBe(false);

      // Should be visible with selection
      mockController.selectedElementIds.add('el-1');
      expect(editMenu?.visible?.(mockController)).toBe(true);
    });

    it('should include Edit submenu with all edit actions', () => {
      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');

      const labels = editMenu?.children?.map(c => c.label);
      expect(labels).toContain('Duplicate');
      expect(labels).toContain('Delete');
      expect(labels).toContain('Copy');
      expect(labels).toContain('Paste');
      expect(labels).toContain('Generate New');
      expect(labels).toContain('Inline Edit');
      expect(labels).toContain('Auto-Layout');
      expect(labels).toContain('Convert Type');
    });

    it('should include Arrange submenu with layout options', () => {
      const items = buildRootItems(mockController);
      const arrangeMenu = items.find(item => item.label === 'Arrange');

      expect(arrangeMenu).toBeDefined();
      expect(arrangeMenu?.visible).toBeDefined();

      const labels = arrangeMenu?.children?.map(c => c.label);
      expect(labels).toContain('Bring Front');
      expect(labels).toContain('Send Back');
      expect(labels).toContain('Group');
      expect(labels).toContain('Ungroup');
      expect(labels).toContain('Align');
    });

    it('should include Align submenu with all alignment options', () => {
      const items = buildRootItems(mockController);
      const arrangeMenu = items.find(item => item.label === 'Arrange');
      const alignMenu = arrangeMenu?.children?.find(c => c.label === 'Align');

      expect(alignMenu).toBeDefined();
      expect(alignMenu?.children).toBeDefined();

      const labels = alignMenu?.children?.map(c => c.label);
      expect(labels).toContain('Left');
      expect(labels).toContain('Right');
      expect(labels).toContain('Top');
      expect(labels).toContain('Bottom');
      expect(labels).toContain('Centre Vert');
      expect(labels).toContain('Centre Horiz');
    });

    it('should include View submenu with zoom options', () => {
      const items = buildRootItems(mockController);
      const viewMenu = items.find(item => item.label === 'View' && item.category === 'Navigation');

      expect(viewMenu).toBeDefined();

      const labels = viewMenu?.children?.map(c => c.label);
      expect(labels).toContain('Zoom In');
      expect(labels).toContain('Zoom Out');
      expect(labels).toContain('Reset Zoom');
      expect(labels).toContain('Zoom to Fit');
    });

    it('should include Canvas submenu with file operations', () => {
      const items = buildRootItems(mockController);
      const canvasMenu = items.find(item => item.label === 'Canvas');

      expect(canvasMenu).toBeDefined();

      const labels = canvasMenu?.children?.map(c => c.label);
      expect(labels).toContain('Save');
      expect(labels).toContain('History');
      expect(labels).toContain('Export JSON');
    });

    it('should assign correct categories to items', () => {
      const items = buildRootItems(mockController);

      const undo = items.find(item => item.label === 'Undo');
      expect(undo?.category).toBe('Edit');

      const modeMenu = items.find(item => item.label === 'Mode');
      expect(modeMenu?.category).toBe('Navigation');
    });

    it('should assign keyboard shortcuts to appropriate items', () => {
      const items = buildRootItems(mockController);

      // Check a few key shortcuts
      expect(items.find(i => i.label === 'Undo')?.shortcut).toBe('⌘Z');
      expect(items.find(i => i.label === 'Redo')?.shortcut).toBe('⌘⇧Z');

      const addMenu = items.find(item => item.label === 'Add');
      const textItem = addMenu?.children?.find(c => c.label === 'Text');
      expect(textItem?.shortcut).toBe('⌘N T');
    });

    it('should include needsInput flag for items requiring user input', () => {
      const items = buildRootItems(mockController);
      const addMenu = items.find(item => item.label === 'Add');

      const textItem = addMenu?.children?.find(c => c.label === 'Text');
      expect(textItem?.needsInput).toBe('Text');

      const imageItem = addMenu?.children?.find(c => c.label === 'Image');
      expect(imageItem?.needsInput).toBe('Prompt');

      const generateItem = addMenu?.children?.find(c => c.label === 'Generate');
      expect(generateItem?.needsInput).toBe('Prompt');
    });

    it('should include enabled functions for conditional items', () => {
      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');
      const pasteItem = editMenu?.children?.find(c => c.label === 'Paste');

      expect(pasteItem?.enabled).toBeDefined();
      expect(typeof pasteItem?.enabled).toBe('function');
    });

    it('should include Generate New with proper enabled condition', () => {
      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');
      const generateItem = editMenu?.children?.find(c => c.label === 'Generate New');

      expect(generateItem?.enabled).toBeDefined();

      // Should be disabled with no selection
      mockController.selectedElementIds.clear();
      expect(generateItem?.enabled?.(mockController)).toBe(false);

      // Should be enabled with single non-image selection
      mockController.selectedElementIds.add('el-1');
      expect(generateItem?.enabled?.(mockController)).toBe(true);

      // Should be disabled with multiple selections
      mockController.selectedElementIds.add('el-2');
      expect(generateItem?.enabled?.(mockController)).toBe(false);
    });

    it('should include Auto-Layout with directional options', () => {
      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');
      const autoLayoutMenu = editMenu?.children?.find(c => c.label === 'Auto-Layout');

      expect(autoLayoutMenu).toBeDefined();
      expect(autoLayoutMenu?.children).toBeDefined();

      const labels = autoLayoutMenu?.children?.map(c => c.label);
      expect(labels).toContain('→  Right');
      expect(labels).toContain('↓  Down');
      expect(labels).toContain('⇆  Left');
      expect(labels).toContain('↕  Up');
      expect(labels).toContain('Radial');
    });

    it('should include Group with proper enabled condition', () => {
      const items = buildRootItems(mockController);
      const arrangeMenu = items.find(item => item.label === 'Arrange');
      const groupItem = arrangeMenu?.children?.find(c => c.label === 'Group');

      expect(groupItem?.enabled).toBeDefined();

      // Should be disabled with single selection
      mockController.selectedElementIds.clear();
      mockController.selectedElementIds.add('el-1');
      expect(groupItem?.enabled?.(mockController)).toBe(false);

      // Should be enabled with multiple selections
      mockController.selectedElementIds.add('el-2');
      expect(groupItem?.enabled?.(mockController)).toBe(true);
    });

    it('should build Convert Type submenu from element registry', () => {
      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');
      const convertMenu = editMenu?.children?.find(c => c.label === 'Convert Type');

      expect(convertMenu).toBeDefined();
      expect(convertMenu?.children).toBeDefined();

      const labels = convertMenu?.children?.map(c => c.label);
      // Should include base types
      expect(labels).toContain('text');
      expect(labels).toContain('markdown');
      expect(labels).toContain('img');
      expect(labels).toContain('html');

      // Should include custom types from registry
      expect(labels).toContain('json');
      expect(labels).toContain('custom');
    });

    it('should not duplicate types in Convert Type menu', () => {
      // Add a type that conflicts with base types
      mockController.elementRegistry.listTypes = jest.fn(() => ['text', 'custom']);

      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');
      const convertMenu = editMenu?.children?.find(c => c.label === 'Convert Type');

      const labels = convertMenu?.children?.map(c => c.label) || [];
      const textCount = labels.filter(l => l === 'text').length;

      expect(textCount).toBe(1); // Should only appear once
    });

    it('should handle missing element registry gracefully', () => {
      mockController.elementRegistry = null;

      expect(() => buildRootItems(mockController)).not.toThrow();

      const items = buildRootItems(mockController);
      const editMenu = items.find(item => item.label === 'Edit' && item.category === 'Edit');
      const convertMenu = editMenu?.children?.find(c => c.label === 'Convert Type');

      // Should still have base types
      const labels = convertMenu?.children?.map(c => c.label);
      expect(labels).toContain('text');
      expect(labels?.length).toBe(4); // Only base types
    });

    it('should set correct icons for menu items', () => {
      const items = buildRootItems(mockController);

      expect(items.find(i => i.label === 'Mode')?.icon).toBe('fa-arrows-alt');
      expect(items.find(i => i.label === 'Undo')?.icon).toBe('fa-rotate-left');
      expect(items.find(i => i.label === 'Add')?.icon).toBe('fa-plus-circle');
    });

    it('should set correct icons in submenus', () => {
      const items = buildRootItems(mockController);
      const addMenu = items.find(item => item.label === 'Add');

      const textItem = addMenu?.children?.find(c => c.label === 'Text');
      expect(textItem?.icon).toBe('fa-font');

      const markdownItem = addMenu?.children?.find(c => c.label === 'Markdown');
      expect(markdownItem?.icon).toBe('fa-brands fa-markdown');

      const imageItem = addMenu?.children?.find(c => c.label === 'Image');
      expect(imageItem?.icon).toBe('fa-image');
    });

    it('should assign action functions to items', () => {
      const items = buildRootItems(mockController);

      const undo = items.find(i => i.label === 'Undo');
      expect(typeof undo?.action).toBe('function');

      const modeMenu = items.find(item => item.label === 'Mode');
      const editItem = modeMenu?.children?.find(c => c.label === 'Edit');
      expect(typeof editItem?.action).toBe('function');
    });

    it('should call switchMode when toggling mode', () => {
      const items = buildRootItems(mockController);
      const modeMenu = items.find(item => item.label === 'Mode');
      const toggleItem = modeMenu?.children?.find(c => c.label === 'Toggle');

      toggleItem?.action?.(mockController);

      expect(mockController.switchMode).toHaveBeenCalled();
    });

    it('should call undo/redo when actions triggered', () => {
      const items = buildRootItems(mockController);

      const undo = items.find(i => i.label === 'Undo');
      undo?.action?.(mockController);
      expect(mockController.undo).toHaveBeenCalled();

      const redo = items.find(i => i.label === 'Redo');
      redo?.action?.(mockController);
      expect(mockController.redo).toHaveBeenCalled();
    });
  });
});
