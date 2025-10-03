/**
 * Unit tests for context-menu
 * Tests menu building, type switching, blend mode selection, and action buttons
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { buildContextMenu } from '../src/lib/context-menu';
import type { CanvasElement, CanvasController } from '../src/types';

// Mock modules
jest.mock('../src/lib/network/storage.ts', () => ({
  setBackpackItem: jest.fn().mockResolvedValue(undefined),
  saveCanvas: jest.fn(),
  loadInitialCanvas: jest.fn(),
  getAuthToken: jest.fn().mockReturnValue('test-token')
}));

describe('Context Menu', () => {
  let mockController: Partial<CanvasController>;
  let testElement: CanvasElement;
  let contextMenuEl: HTMLDivElement;

  beforeEach(() => {
    // Setup DOM
    contextMenuEl = document.createElement('div');
    contextMenuEl.id = 'context-menu';
    document.body.appendChild(contextMenuEl);

    // Create test element
    testElement = {
      id: 'el-test',
      x: 100,
      y: 100,
      width: 120,
      height: 80,
      rotation: 0,
      type: 'text',
      content: 'Test Content',
      scale: 1,
      versions: [],
      static: false
    };

    // Mock controller
    mockController = {
      contextMenu: contextMenuEl,
      canvasState: {
        canvasId: 'test-canvas',
        elements: [testElement],
        edges: [],
        versionHistory: []
      },
      elementNodesMap: {
        'el-test': document.createElement('div')
      },
      selectedElementId: 'el-test',
      staticContainer: document.createElement('div'),
      container: document.createElement('div'),
      clickCapture: jest.fn((el, handler) => {
        el.onclick = handler;
      }),
      updateElementNode: jest.fn(),
      hideContextMenu: jest.fn(),
      regenerateImage: jest.fn(),
      openEditModal: jest.fn(),
      createEditElement: jest.fn(),
      selectElement: jest.fn(),
      requestRender: jest.fn(),
      toggleStatic: jest.fn(),
      handleDrillIn: jest.fn(),
      elementRegistry: {
        listTypes: jest.fn(() => ['custom-type'])
      }
    };
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Menu Building', () => {
    it('should build menu for text element', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      expect(contextMenuEl.innerHTML).not.toBe('');
      expect(contextMenuEl.children.length).toBeGreaterThan(0);
    });

    it('should clear previous menu content', () => {
      contextMenuEl.innerHTML = '<div>Previous Content</div>';

      buildContextMenu(testElement, mockController as CanvasController);

      expect(contextMenuEl.innerHTML).not.toContain('Previous Content');
    });

    it('should return early if element is null', () => {
      buildContextMenu(null as any, mockController as CanvasController);

      expect(contextMenuEl.innerHTML).toBe('');
    });

    it('should build menu for image element', () => {
      const imgElement: CanvasElement = { ...testElement, type: 'img' };

      buildContextMenu(imgElement, mockController as CanvasController);

      // Should include regen button for images
      const regenBtn = Array.from(contextMenuEl.querySelectorAll('button')).find(
        btn => btn.textContent?.includes('Regen')
      );
      expect(regenBtn).toBeTruthy();
    });

    it('should build menu for markdown element', () => {
      const mdElement: CanvasElement = { ...testElement, type: 'markdown' };

      buildContextMenu(mdElement, mockController as CanvasController);

      // Should include color picker for markdown
      const colorInput = contextMenuEl.querySelector('input[type="color"]');
      expect(colorInput).toBeTruthy();
    });

    it('should build menu for html element', () => {
      const htmlElement: CanvasElement = { ...testElement, type: 'html' };

      buildContextMenu(htmlElement, mockController as CanvasController);

      expect(contextMenuEl.innerHTML).not.toBe('');
    });

    it('should display element ID', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const idLabel = contextMenuEl.querySelector('.id-label');
      expect(idLabel?.textContent).toBe('el-test');
    });
  });

  describe('Type Switching', () => {
    it('should create type buttons for native types', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const typeButtons = contextMenuEl.querySelectorAll('.btn-container button');
      expect(typeButtons.length).toBeGreaterThan(0);
    });

    it('should mark current type as selected', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const selectedBtn = contextMenuEl.querySelector('.btn-container button.selected');
      expect(selectedBtn).toBeTruthy();
    });

    it('should switch element type on button click', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('.btn-container button'));
      const markdownBtn = buttons.find(btn => btn.getAttribute('title')?.includes('markdown'));

      if (markdownBtn) {
        (markdownBtn as HTMLButtonElement).click();
        expect(testElement.type).toBe('markdown');
        expect(mockController.updateElementNode).toHaveBeenCalled();
      }
    });

    it('should include plugin types from element registry', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const typeButtons = contextMenuEl.querySelectorAll('.btn-container button');
      // Should include native types + custom types
      expect(typeButtons.length).toBeGreaterThanOrEqual(4);
    });

    it('should use generic icon for plugin types', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('.btn-container button'));
      const customBtn = buttons.find(btn => btn.getAttribute('title')?.includes('custom-type'));

      if (customBtn) {
        expect(customBtn.innerHTML).toContain('fa-cube');
      }
    });

    it('should use specific icons for native types', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('.btn-container button'));
      const imgBtn = buttons.find(btn => btn.getAttribute('title')?.includes('img'));

      if (imgBtn) {
        expect(imgBtn.innerHTML).toContain('fa-image');
      }
    });
  });

  describe('Blend Mode Selection', () => {
    it('should create blend mode selector', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const blendSelect = contextMenuEl.querySelector('select') as HTMLSelectElement;
      expect(blendSelect).toBeTruthy();
    });

    it('should include all blend modes', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const blendSelect = contextMenuEl.querySelector('select') as HTMLSelectElement;
      const options = blendSelect.querySelectorAll('option');

      const blendModes = [
        'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
        'color-dodge', 'color-burn', 'hard-light', 'soft-light',
        'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
      ];

      expect(options.length).toBe(blendModes.length);
    });

    it('should set current blend mode', () => {
      testElement.blendMode = 'multiply';
      buildContextMenu(testElement, mockController as CanvasController);

      const blendSelect = contextMenuEl.querySelector('select') as HTMLSelectElement;
      expect(blendSelect.value).toBe('multiply');
    });

    it('should default to normal blend mode', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const blendSelect = contextMenuEl.querySelector('select') as HTMLSelectElement;
      expect(blendSelect.value).toBe('normal');
    });

    it('should update element blend mode on change', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const blendSelect = contextMenuEl.querySelector('select') as HTMLSelectElement;
      blendSelect.value = 'screen';
      blendSelect.dispatchEvent(new Event('change'));

      expect(testElement.blendMode).toBe('screen');
      expect(mockController.updateElementNode).toHaveBeenCalled();
    });
  });

  describe('Color Picker', () => {
    it('should show color picker for text elements', () => {
      testElement.type = 'text';
      buildContextMenu(testElement, mockController as CanvasController);

      const colorInput = contextMenuEl.querySelector('input[type="color"]');
      expect(colorInput).toBeTruthy();
    });

    it('should show color picker for markdown elements', () => {
      testElement.type = 'markdown';
      buildContextMenu(testElement, mockController as CanvasController);

      const colorInput = contextMenuEl.querySelector('input[type="color"]');
      expect(colorInput).toBeTruthy();
    });

    it('should not show color picker for image elements', () => {
      testElement.type = 'img';
      buildContextMenu(testElement, mockController as CanvasController);

      const colorInput = contextMenuEl.querySelector('input[type="color"]');
      expect(colorInput).toBeFalsy();
    });

    it('should set current element color', () => {
      testElement.type = 'text';
      testElement.color = '#ff0000';
      buildContextMenu(testElement, mockController as CanvasController);

      const colorInput = contextMenuEl.querySelector('input[type="color"]') as HTMLInputElement;
      expect(colorInput.value).toBe('#ff0000');
    });

    it('should default to black color', () => {
      testElement.type = 'text';
      buildContextMenu(testElement, mockController as CanvasController);

      const colorInput = contextMenuEl.querySelector('input[type="color"]') as HTMLInputElement;
      expect(colorInput.value).toBe('#000000');
    });

    it('should update element color on change', () => {
      testElement.type = 'text';
      buildContextMenu(testElement, mockController as CanvasController);

      const colorInput = contextMenuEl.querySelector('input[type="color"]') as HTMLInputElement;
      colorInput.value = '#00ff00';
      colorInput.dispatchEvent(new Event('change'));

      expect(testElement.color).toBe('#00ff00');
      expect(mockController.updateElementNode).toHaveBeenCalled();
    });
  });

  describe('Action Buttons', () => {
    beforeEach(() => {
      buildContextMenu(testElement, mockController as CanvasController);
    });

    it('should have edit button', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const editBtn = buttons.find(btn => btn.innerHTML.includes('Edit'));
      expect(editBtn).toBeTruthy();
    });

    it('should open edit modal on edit button click', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const editBtn = buttons.find(btn => btn.innerHTML.includes('fa-pen-to-square') && btn.innerHTML.includes('Edit') && !btn.innerHTML.includes('inline'));

      editBtn?.click();

      expect(mockController.openEditModal).toHaveBeenCalledWith(testElement);
      expect(mockController.hideContextMenu).toHaveBeenCalled();
    });

    it('should have edit inline button', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const editInlineBtn = buttons.find(btn => btn.innerHTML.includes('Edit inline'));
      expect(editInlineBtn).toBeTruthy();
    });

    it('should create inline edit element on edit inline button click', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const editInlineBtn = buttons.find(btn => btn.innerHTML.includes('Edit inline'));

      editInlineBtn?.click();

      expect(mockController.createEditElement).toHaveBeenCalledWith(
        expect.any(Object),
        testElement,
        'content'
      );
      expect(mockController.hideContextMenu).toHaveBeenCalled();
    });

    it('should have delete button', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const deleteBtn = buttons.find(btn => btn.innerHTML.includes('Delete'));
      expect(deleteBtn).toBeTruthy();
    });

    it('should delete element on delete button click', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const deleteBtn = buttons.find(btn => btn.innerHTML.includes('fa-trash'));

      deleteBtn?.click();

      expect(mockController.canvasState!.elements.length).toBe(0);
      expect(mockController.selectedElementId).toBeNull();
      expect(mockController.hideContextMenu).toHaveBeenCalled();
    });

    it('should have duplicate button', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const duplicateBtn = buttons.find(btn => btn.innerHTML.includes('Duplicate'));
      expect(duplicateBtn).toBeTruthy();
    });

    it('should duplicate element on duplicate button click', () => {
      const initialLength = mockController.canvasState!.elements.length;
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const duplicateBtn = buttons.find(btn => btn.innerHTML.includes('fa-copy'));

      duplicateBtn?.click();

      expect(mockController.canvasState!.elements.length).toBe(initialLength + 1);
      expect(mockController.selectElement).toHaveBeenCalled();
      expect(mockController.hideContextMenu).toHaveBeenCalled();
    });

    it('should offset duplicated element position', () => {
      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const duplicateBtn = buttons.find(btn => btn.innerHTML.includes('fa-copy'));

      duplicateBtn?.click();

      const duplicated = mockController.canvasState!.elements[1];
      expect(duplicated.x).toBe(testElement.x + 20);
      expect(duplicated.y).toBe(testElement.y + 20);
    });
  });

  describe('Static Element Toggle', () => {
    it('should show "Set Static" button for non-static elements', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const staticBtn = buttons.find(btn => btn.textContent === 'Set Static');
      expect(staticBtn).toBeTruthy();
    });

    it('should show "Unset Static" button for static elements', () => {
      testElement.static = true;
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const staticBtn = buttons.find(btn => btn.textContent === 'Unset Static');
      expect(staticBtn).toBeTruthy();
    });

    it('should toggle static state on button click', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const staticBtn = buttons.find(btn => btn.textContent?.includes('Static'));

      staticBtn?.click();

      expect(mockController.toggleStatic).toHaveBeenCalledWith(testElement);
      expect(mockController.requestRender).toHaveBeenCalled();
      expect(mockController.hideContextMenu).toHaveBeenCalled();
    });

    it('should move element to static container when set to static', () => {
      const appendChildSpy = jest.spyOn(mockController.staticContainer!, 'appendChild');

      testElement.static = false;
      buildContextMenu(testElement, mockController as CanvasController);

      // Mock the toggle to set static = true
      (mockController.toggleStatic as jest.Mock).mockImplementation((el: CanvasElement) => {
        el.static = true;
      });

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const staticBtn = buttons.find(btn => btn.textContent === 'Set Static');
      staticBtn?.click();

      expect(appendChildSpy).toHaveBeenCalled();
    });

    it('should move element to main container when unsetting static', () => {
      const appendChildSpy = jest.spyOn(mockController.container!, 'appendChild');

      testElement.static = true;
      buildContextMenu(testElement, mockController as CanvasController);

      // Mock the toggle to set static = false
      (mockController.toggleStatic as jest.Mock).mockImplementation((el: CanvasElement) => {
        el.static = false;
      });

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const staticBtn = buttons.find(btn => btn.textContent === 'Unset Static');
      staticBtn?.click();

      expect(appendChildSpy).toHaveBeenCalled();
    });
  });

  describe('Nested Canvas Features', () => {
    it('should show "Convert to Nested Canvas" button for non-nested elements', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const convertBtn = buttons.find(btn => btn.textContent === 'Convert to Nested Canvas');
      expect(convertBtn).toBeTruthy();
    });

    it('should not show convert button for already nested elements', () => {
      testElement.refCanvasId = 'nested-canvas-123';
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const convertBtn = buttons.find(btn => btn.textContent === 'Convert to Nested Canvas');
      expect(convertBtn).toBeFalsy();
    });

    it('should show "Open Nested Canvas" button for nested elements', () => {
      testElement.refCanvasId = 'nested-canvas-123';
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const openBtn = buttons.find(btn => btn.textContent === 'Open Nested Canvas');
      expect(openBtn).toBeTruthy();
    });

    it('should convert element to nested canvas on button click', async () => {
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const convertBtn = buttons.find(btn => btn.textContent === 'Convert to Nested Canvas');

      // Verify initial state
      expect(testElement.refCanvasId).toBeUndefined();

      // Manually trigger the async handler and await it
      if (convertBtn && convertBtn.onclick) {
        const event = new Event('click');
        await (convertBtn.onclick as any).call(convertBtn, event);
      }

      // Verify the element was updated with a canvas ID (main behavior we care about)
      expect(testElement.refCanvasId).toBeTruthy();
      expect(testElement.refCanvasId).toMatch(/^canvas-\d+$/);
    });

    it('should open nested canvas on button click', () => {
      testElement.refCanvasId = 'nested-canvas-123';
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const openBtn = buttons.find(btn => btn.textContent === 'Open Nested Canvas');

      openBtn?.click();

      expect(mockController.handleDrillIn).toHaveBeenCalledWith(testElement);
    });
  });

  describe('Image Regeneration', () => {
    it('should show regen button for image elements', () => {
      testElement.type = 'img';
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const regenBtn = buttons.find(btn => btn.innerHTML.includes('Regen'));
      expect(regenBtn).toBeTruthy();
    });

    it('should not show regen button for non-image elements', () => {
      testElement.type = 'text';
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const regenBtn = buttons.find(btn => btn.innerHTML.includes('Regen'));
      expect(regenBtn).toBeFalsy();
    });

    it('should regenerate image on button click', () => {
      testElement.type = 'img';
      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const regenBtn = buttons.find(btn => btn.innerHTML.includes('Regen'));

      regenBtn?.click();

      expect(mockController.regenerateImage).toHaveBeenCalledWith(testElement);
      expect(mockController.hideContextMenu).toHaveBeenCalled();
    });
  });

  describe('DOM Interactions', () => {
    it('should remove element node from DOM on delete', () => {
      const node = mockController.elementNodesMap!['el-test'];
      const removeSpy = jest.spyOn(node, 'remove');

      buildContextMenu(testElement, mockController as CanvasController);

      const buttons = Array.from(contextMenuEl.querySelectorAll('button'));
      const deleteBtn = buttons.find(btn => btn.innerHTML.includes('fa-trash'));

      deleteBtn?.click();

      expect(removeSpy).toHaveBeenCalled();
      expect(mockController.elementNodesMap!['el-test']).toBeUndefined();
    });

    it('should use clickCapture for button events', () => {
      buildContextMenu(testElement, mockController as CanvasController);

      expect(mockController.clickCapture).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle element with no element registry', () => {
      mockController.elementRegistry = undefined;
      buildContextMenu(testElement, mockController as CanvasController);

      // Should still build menu with native types
      const typeButtons = contextMenuEl.querySelectorAll('.btn-container button');
      expect(typeButtons.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle element with versions', () => {
      testElement.versions = [
        { content: 'Old content', timestamp: Date.now() - 1000 }
      ];

      buildContextMenu(testElement, mockController as CanvasController);

      expect(contextMenuEl.innerHTML).not.toBe('');
    });

    it('should handle element with custom blend mode', () => {
      testElement.blendMode = 'hue';
      buildContextMenu(testElement, mockController as CanvasController);

      const blendSelect = contextMenuEl.querySelector('select') as HTMLSelectElement;
      expect(blendSelect.value).toBe('hue');
    });
  });
});
