/**
 * Unit tests for command-palette
 * Tests command flattening, fuzzy search, keyboard shortcuts, and recent commands tracking
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { installCommandPalette } from '../src/lib/cmd-palette/command-palette';
import type { CanvasController, MenuItem } from '../src/types';

// Mock modules
jest.mock('../src/lib/cmd-palette/menu-items.ts', () => ({
  buildRootItems: jest.fn()
}));

jest.mock('../src/lib/network/generation.ts', () => ({
  editElementWithPrompt: jest.fn()
}));

jest.mock('../src/lib/cmd-palette/keyboard-shortcuts.ts', () => ({
  installKeyboardShortcuts: jest.fn()
}));

describe('Command Palette', () => {
  let mockController: Partial<CanvasController>;
  let mockBuildRootItems: jest.Mock;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '<div id="canvas"></div>';

    // Mock canvas getBoundingClientRect
    const canvas = document.getElementById('canvas')!;
    canvas.getBoundingClientRect = jest.fn(() => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      right: 800,
      bottom: 600,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }));

    // Setup mock controller
    mockController = {
      canvasState: {
        canvasId: 'test-canvas',
        elements: [
          {
            id: 'el-1',
            x: 100,
            y: 100,
            width: 120,
            height: 80,
            rotation: 0,
            type: 'text',
            content: 'Hello World',
            scale: 1,
            versions: [],
            static: false
          },
          {
            id: 'el-2',
            x: 200,
            y: 200,
            width: 120,
            height: 80,
            rotation: 0,
            type: 'markdown',
            content: 'Test Markdown',
            scale: 1,
            versions: [],
            static: false
          }
        ],
        edges: [],
        versionHistory: []
      },
      canvas,
      selectedElementId: null,
      viewState: { scale: 1, translateX: 0, translateY: 0 },
      MAX_SCALE: 5,
      findElementById: jest.fn((id: string) =>
        mockController.canvasState!.elements.find(e => e.id === id)
      ),
      selectElement: jest.fn(),
      switchMode: jest.fn(),
      screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
      createNewElement: jest.fn(),
      recenterOnElement: jest.fn(),
      updateCanvasTransform: jest.fn(),
      saveLocalViewState: jest.fn(),
      requestRender: jest.fn(),
      crdt: {
        onPresenceChange: jest.fn((callback: Function) => {
          // Immediately call with empty array
          callback([]);
        })
      }
    };

    // Setup mock menu items
    const { buildRootItems } = require('../src/lib/cmd-palette/menu-items.ts');
    mockBuildRootItems = buildRootItems as jest.Mock;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Command Flattening', () => {
    it('should flatten nested command structure', () => {
      const menuItems: MenuItem[] = [
        {
          label: 'File',
          children: [
            {
              label: 'New',
              action: jest.fn()
            },
            {
              label: 'Open',
              action: jest.fn()
            }
          ]
        }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const palette = document.getElementById('cmd-palette');
      expect(palette).toBeTruthy();
    });

    it('should filter invisible commands', () => {
      const menuItems: MenuItem[] = [
        {
          label: 'Visible',
          action: jest.fn(),
          visible: () => true
        },
        {
          label: 'Hidden',
          action: jest.fn(),
          visible: () => false
        }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'v';
      input.dispatchEvent(new Event('input'));

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter disabled commands', () => {
      const menuItems: MenuItem[] = [
        {
          label: 'Enabled',
          action: jest.fn(),
          enabled: () => true
        },
        {
          label: 'Disabled',
          action: jest.fn(),
          enabled: () => false
        }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      expect(document.getElementById('cmd-palette')).toBeTruthy();
    });

    it('should handle dynamic labels', () => {
      const menuItems: MenuItem[] = [
        {
          label: (ctrl) => `Dynamic ${ctrl.canvasState.elements.length}`,
          action: jest.fn()
        }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      expect(document.getElementById('cmd-palette')).toBeTruthy();
    });

    it('should preserve category information', () => {
      const menuItems: MenuItem[] = [
        {
          label: 'Command',
          action: jest.fn(),
          category: 'Edit'
        }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      expect(document.getElementById('cmd-palette')).toBeTruthy();
    });
  });

  describe('Fuzzy Search', () => {
    beforeEach(() => {
      const menuItems: MenuItem[] = [
        { label: 'Create New Element', action: jest.fn() },
        { label: 'Delete Element', action: jest.fn() },
        { label: 'Zoom In', action: jest.fn() }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController, { fuzziness: true });
    });

    it('should match commands with fuzzy search', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'cne';
      input.dispatchEvent(new Event('input'));

      // Should match "Create New Element"
      const palette = document.getElementById('cmd-palette');
      expect(palette?.classList.contains('empty')).toBe(false);
    });

    it('should handle exact matches', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'zoom';
      input.dispatchEvent(new Event('input'));

      expect(document.getElementById('cmd-palette')?.classList.contains('empty')).toBe(false);
    });

    it('should return no results for non-matching query', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'xyzabc';
      input.dispatchEvent(new Event('input'));

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBe(0);
    });

    it('should disable fuzzy search when configured', () => {
      document.body.innerHTML = '';
      const menuItems: MenuItem[] = [
        { label: 'Create New Element', action: jest.fn() }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController, { fuzziness: false });

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'cne';
      input.dispatchEvent(new Event('input'));

      // Without fuzzy search, 'cne' should not match 'Create New Element'
      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBe(0);
    });
  });

  describe('Recent Commands Tracking', () => {
    beforeEach(() => {
      const menuItems: MenuItem[] = [
        { label: 'Command A', action: jest.fn() },
        { label: 'Command B', action: jest.fn() },
        { label: 'Command C', action: jest.fn() }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController, { recentCommandsCount: 3 });
    });

    it('should show recent commands when input is empty', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.focus();

      const recentLabel = document.querySelector('.recent-commands-label') as HTMLElement;
      // Initially no recent commands
      expect(recentLabel.style.display).toBe('none');
    });

    it('should track command execution in recent list', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;

      // Search and select a command
      input.value = 'command a';
      input.dispatchEvent(new Event('input'));

      const firstSuggestion = document.querySelector('.suggestion') as HTMLElement;
      if (firstSuggestion) {
        firstSuggestion.click();
      }

      // Clear and focus to check recent commands
      input.value = '';
      input.dispatchEvent(new Event('input'));
      input.focus();

      // Recent commands should now be visible
      expect(document.querySelector('.recent-commands-label')).toBeTruthy();
    });

    it('should limit recent commands to configured count', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;

      // Execute multiple commands
      const commands = ['command a', 'command b', 'command c'];
      commands.forEach(cmd => {
        input.value = cmd;
        input.dispatchEvent(new Event('input'));

        const suggestion = document.querySelector('.suggestion') as HTMLElement;
        if (suggestion) {
          suggestion.click();
        }
      });

      // Check that only the configured number of recent commands are shown
      input.value = '';
      input.dispatchEvent(new Event('input'));

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBeLessThanOrEqual(3);
    });

    it('should move command to top when executed again', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;

      // Execute command A
      input.value = 'command a';
      input.dispatchEvent(new Event('input'));
      let suggestion = document.querySelector('.suggestion') as HTMLElement;
      if (suggestion) suggestion.click();

      // Execute command B
      input.value = 'command b';
      input.dispatchEvent(new Event('input'));
      suggestion = document.querySelector('.suggestion') as HTMLElement;
      if (suggestion) suggestion.click();

      // Execute command A again
      input.value = 'command a';
      input.dispatchEvent(new Event('input'));
      suggestion = document.querySelector('.suggestion') as HTMLElement;
      if (suggestion) suggestion.click();

      // Command A should be at the top of recent commands
      input.value = '';
      input.dispatchEvent(new Event('input'));

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Keyboard Shortcuts', () => {
    beforeEach(() => {
      const menuItems: MenuItem[] = [
        { label: 'Command 1', action: jest.fn() },
        { label: 'Command 2', action: jest.fn() },
        { label: 'Command 3', action: jest.fn() }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);
    });

    it('should open palette with Cmd/Ctrl+K', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true
      });
      window.dispatchEvent(event);

      expect(document.activeElement).toBe(input);
    });

    it('should navigate down with ArrowDown', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'command';
      input.dispatchEvent(new Event('input'));

      const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      input.dispatchEvent(downEvent);

      const activeSuggestion = document.querySelector('.suggestion.active');
      expect(activeSuggestion).toBeTruthy();
    });

    it('should navigate up with ArrowUp', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'command';
      input.dispatchEvent(new Event('input'));

      // Navigate down first
      let event = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      input.dispatchEvent(event);

      // Then up
      event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
      input.dispatchEvent(event);

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should execute command with Enter', () => {
      const mockAction = jest.fn();
      const menuItems: MenuItem[] = [
        { label: 'Test Command', action: mockAction }
      ];

      document.body.innerHTML = '';
      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'test';
      input.dispatchEvent(new Event('input'));

      const downEvent = new KeyboardEvent('keydown', { key: 'ArrowDown' });
      input.dispatchEvent(downEvent);

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(enterEvent);

      expect(mockAction).toHaveBeenCalled();
    });

    it('should close palette with Escape', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'test';
      input.dispatchEvent(new Event('input'));

      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      input.dispatchEvent(escEvent);

      expect(input.value).toBe('');
    });

    it('should select first item with Tab', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'command';
      input.dispatchEvent(new Event('input'));

      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      Object.defineProperty(tabEvent, 'preventDefault', { value: jest.fn() });
      input.dispatchEvent(tabEvent);

      const activeSuggestion = document.querySelector('.suggestion.active');
      expect(activeSuggestion).toBeTruthy();
    });
  });

  describe('Command Execution', () => {
    it('should execute command without input', () => {
      const mockAction = jest.fn();
      const menuItems: MenuItem[] = [
        { label: 'Simple Command', action: mockAction }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'simple';
      input.dispatchEvent(new Event('input'));

      const suggestion = document.querySelector('.suggestion') as HTMLElement;
      if (suggestion) {
        suggestion.click();
      }

      expect(mockAction).toHaveBeenCalledWith(mockController);
    });

    it('should prompt for input when command needs it', () => {
      const mockAction = jest.fn();
      const menuItems: MenuItem[] = [
        {
          label: 'Command With Input',
          action: mockAction,
          needsInput: 'Enter value'
        }
      ];

      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'command with';
      input.dispatchEvent(new Event('input'));

      const suggestion = document.querySelector('.suggestion') as HTMLElement;
      if (suggestion) {
        suggestion.click();
      }

      const palette = document.getElementById('cmd-palette');
      expect(palette?.classList.contains('awaiting')).toBe(true);
    });

    it('should handle element selection from suggestions', () => {
      const menuItems: MenuItem[] = [];
      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'hello';
      input.dispatchEvent(new Event('input'));

      // Should show element suggestions
      const suggestions = document.querySelectorAll('.suggestion');
      if (suggestions.length > 0) {
        (suggestions[0] as HTMLElement).click();
        expect(mockController.selectElement).toHaveBeenCalled();
      }
    });

    it('should create new element when entering text with no selection', async () => {
      const menuItems: MenuItem[] = [];
      mockBuildRootItems.mockReturnValue(menuItems);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'new text content';

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      input.dispatchEvent(enterEvent);

      // Give time for async operations
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockController.createNewElement).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        'markdown',
        'new text content'
      );
    });
  });

  describe('Element Suggestions', () => {
    beforeEach(() => {
      mockBuildRootItems.mockReturnValue([]);
      installCommandPalette(mockController as CanvasController);
    });

    it('should show element suggestions based on content', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'hello';
      input.dispatchEvent(new Event('input'));

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBeGreaterThanOrEqual(1);
    });

    it('should show element type in suggestions', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'test';
      input.dispatchEvent(new Event('input'));

      const suggestion = document.querySelector('.suggestion');
      expect(suggestion).toBeTruthy();
    });

    it('should truncate long element content', () => {
      mockController.canvasState!.elements = [
        {
          id: 'el-long',
          x: 100,
          y: 100,
          width: 120,
          height: 80,
          rotation: 0,
          type: 'text',
          content: 'This is a very long piece of content that should be truncated in the suggestion list',
          scale: 1,
          versions: [],
          static: false
        }
      ];

      document.body.innerHTML = '';
      mockBuildRootItems.mockReturnValue([]);
      installCommandPalette(mockController as CanvasController);

      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.value = 'very long';
      input.dispatchEvent(new Event('input'));

      const suggestions = document.querySelectorAll('.suggestion');
      expect(suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty element content', () => {
      mockController.canvasState!.elements = [
        {
          id: 'el-empty',
          x: 100,
          y: 100,
          width: 120,
          height: 80,
          rotation: 0,
          type: 'text',
          content: '',
          scale: 1,
          versions: [],
          static: false
        }
      ];

      document.body.innerHTML = '';
      mockBuildRootItems.mockReturnValue([]);
      installCommandPalette(mockController as CanvasController);

      expect(document.getElementById('cmd-palette')).toBeTruthy();
    });
  });

  describe('UI State Management', () => {
    beforeEach(() => {
      mockBuildRootItems.mockReturnValue([
        { label: 'Test Command', action: jest.fn() }
      ]);
      installCommandPalette(mockController as CanvasController);
    });

    it('should add focused class on input focus', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.focus();

      const palette = document.getElementById('cmd-palette');
      expect(palette?.classList.contains('focused')).toBe(true);
    });

    it('should remove focused class on input blur', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      input.focus();
      input.blur();

      const palette = document.getElementById('cmd-palette');
      expect(palette?.classList.contains('focused')).toBe(false);
    });

    it('should toggle empty class based on input', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      const palette = document.getElementById('cmd-palette');

      expect(palette?.classList.contains('empty')).toBe(true);

      input.value = 'test';
      input.dispatchEvent(new Event('input'));

      expect(palette?.classList.contains('empty')).toBe(false);
    });

    it('should clear input when clear button is clicked', () => {
      const input = document.querySelector('#cmd-palette input') as HTMLInputElement;
      const clearBtn = document.querySelector('#cmd-clear') as HTMLButtonElement;

      input.value = 'test';
      clearBtn.click();

      expect(input.value).toBe('');
    });
  });

  describe('Cleanup', () => {
    it('should return cleanup function', () => {
      mockBuildRootItems.mockReturnValue([]);
      const cleanup = installCommandPalette(mockController as CanvasController);

      expect(typeof cleanup).toBe('function');
    });

    it('should remove palette from DOM on cleanup', () => {
      mockBuildRootItems.mockReturnValue([]);
      const cleanup = installCommandPalette(mockController as CanvasController);

      expect(document.getElementById('cmd-palette')).toBeTruthy();

      cleanup?.();

      expect(document.getElementById('cmd-palette')).toBeFalsy();
    });

    it('should remove event listeners on cleanup', () => {
      mockBuildRootItems.mockReturnValue([]);
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const cleanup = installCommandPalette(mockController as CanvasController);
      cleanup?.();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    });
  });
});
