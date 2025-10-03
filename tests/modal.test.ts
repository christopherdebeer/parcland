/**
 * Unit tests for modal dialog system
 * Tests modal show/hide, input handling, callbacks, and keyboard interactions
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { showModal } from '../src/lib/modal';
import type { CanvasElement } from '../src/types';

describe('Modal Dialog System', () => {
  let testElement: CanvasElement;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = '';

    // Mock CodeMirror
    (window as any).CodeMirror = jest.fn((host: HTMLElement, config: any) => {
      const instance = {
        getValue: jest.fn(() => config.value || ''),
        setValue: jest.fn(),
        setOption: jest.fn(),
        refresh: jest.fn()
      };
      return instance;
    });

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
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  describe('Modal Show/Hide', () => {
    it('should show modal when showModal is called', async () => {
      const promise = showModal(testElement);

      const modal = document.getElementById('edit-modal');
      expect(modal).toBeTruthy();
      expect(modal?.style.display).toBe('block');

      // Close modal
      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await promise;
      expect(result.status).toBe('cancelled');
    });

    it('should create modal DOM structure on first call', () => {
      showModal(testElement);

      expect(document.getElementById('edit-modal')).toBeTruthy();
      expect(document.getElementById('editor-content')).toBeTruthy();
      expect(document.getElementById('editor-src')).toBeTruthy();
      expect(document.getElementById('modal-save')).toBeTruthy();
      expect(document.getElementById('modal-cancel')).toBeTruthy();
    });

    it('should reuse existing modal DOM on subsequent calls', async () => {
      const promise1 = showModal(testElement);
      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise1;

      const modalCount1 = document.querySelectorAll('#edit-modal').length;

      const promise2 = showModal(testElement);
      cancelBtn.click();
      await promise2;

      const modalCount2 = document.querySelectorAll('#edit-modal').length;

      expect(modalCount1).toBe(1);
      expect(modalCount2).toBe(1);
    });

    it('should hide modal on cancel', async () => {
      const promise = showModal(testElement);

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const modal = document.getElementById('edit-modal');
      expect(modal?.style.display).toBe('none');

      const result = await promise;
      expect(result.status).toBe('cancelled');
    });

    it('should hide modal on save', async () => {
      const promise = showModal(testElement);

      const saveBtn = document.getElementById('modal-save') as HTMLButtonElement;
      saveBtn.click();

      const modal = document.getElementById('edit-modal');
      expect(modal?.style.display).toBe('none');

      const result = await promise;
      expect(result.status).toBe('saved');
    });

    it('should throw error if element is not provided', () => {
      expect(() => {
        showModal(null as any);
      }).toThrow('showModal: element required');
    });
  });

  describe('Input Handling', () => {
    it('should initialize CodeMirror editors', () => {
      showModal(testElement);

      expect((window as any).CodeMirror).toHaveBeenCalled();
      expect((window as any).CodeMirror).toHaveBeenCalledTimes(2); // content and src editors
    });

    it('should load element content into content editor', () => {
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;

      expect(contentEditor.setValue).toHaveBeenCalledWith('Test Content');

      // Close modal
      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
    });

    it('should load element src into src editor', async () => {
      testElement.src = 'https://example.com/image.png';
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const srcEditor = CodeMirrorMock.mock.results[1]?.value;

      expect(srcEditor.setValue).toHaveBeenCalledWith('https://example.com/image.png');

      // Close modal
      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should handle empty content', async () => {
      testElement.content = '';
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;

      expect(contentEditor.setValue).toHaveBeenCalledWith('');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should clear editor content on clear button click', async () => {
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;

      const clearBtn = document.getElementById('modal-clear') as HTMLButtonElement;
      clearBtn.click();

      expect(contentEditor.setValue).toHaveBeenCalledWith('');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should copy content to clipboard on copy button click', async () => {
      const writeTextMock = jest.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock
        }
      });

      // Mock alert
      global.alert = jest.fn();

      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;
      contentEditor.getValue.mockReturnValue('Copy this text');

      const copyBtn = document.getElementById('modal-copy') as HTMLButtonElement;
      copyBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(writeTextMock).toHaveBeenCalledWith('Copy this text');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });
  });

  describe('Save Callbacks', () => {
    it('should save content changes to element', async () => {
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;
      contentEditor.getValue.mockReturnValue('Updated Content');

      const saveBtn = document.getElementById('modal-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await promise;

      expect(result.status).toBe('saved');
      expect(result.el?.content).toBe('Updated Content');
      expect(testElement.content).toBe('Updated Content');
    });

    it('should save src changes to element', async () => {
      testElement.type = 'img';
      testElement.src = 'old-src.png';
      const promise = showModal(testElement);

      // Switch to src tab
      const srcTab = document.getElementById('tab-src') as HTMLButtonElement;
      srcTab.click();

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const srcEditor = CodeMirrorMock.mock.results[1]?.value;
      srcEditor.getValue.mockReturnValue('new-src.png');

      const saveBtn = document.getElementById('modal-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await promise;

      expect(result.status).toBe('saved');
      expect(result.el?.src).toBe('new-src.png');
    });

    it('should create version history when content changes', async () => {
      const originalContent = 'Original Content';
      testElement.content = originalContent;
      testElement.versions = [];

      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;
      contentEditor.getValue.mockReturnValue('New Content');

      const saveBtn = document.getElementById('modal-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await promise;

      expect(result.el?.versions?.length).toBe(1);
      expect(result.el?.versions?.[0].content).toBe(originalContent);
    });

    it('should not create version if content unchanged', async () => {
      testElement.content = 'Same Content';
      testElement.versions = [];

      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;
      contentEditor.getValue.mockReturnValue('Same Content');

      const saveBtn = document.getElementById('modal-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await promise;

      expect(result.el?.versions?.length).toBe(0);
    });

    it('should clear src for non-image types when saving content', async () => {
      testElement.type = 'text';
      testElement.src = 'some-src.png';

      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;
      contentEditor.getValue.mockReturnValue('New Text Content');

      const saveBtn = document.getElementById('modal-save') as HTMLButtonElement;
      saveBtn.click();

      const result = await promise;

      expect(result.el?.src).toBeUndefined();
    });

    it('should return null element on cancel', async () => {
      const promise = showModal(testElement);

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();

      const result = await promise;

      expect(result.status).toBe('cancelled');
      expect(result.el).toBeNull();
    });
  });

  describe('Keyboard Interactions', () => {
    it('should close modal on Escape key', async () => {
      const promise = showModal(testElement);

      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      const result = await promise;

      expect(result.status).toBe('cancelled');
    });

    it('should not close modal on Escape when modal is hidden', async () => {
      const promise = showModal(testElement);

      // Close modal first
      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();

      await promise;

      // Try to close again with Escape
      const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escapeEvent);

      // Should not cause issues
      const modal = document.getElementById('edit-modal');
      expect(modal?.style.display).toBe('none');
    });

    it('should ignore other keys', async () => {
      const promise = showModal(testElement);

      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      document.dispatchEvent(enterEvent);

      // Modal should still be open
      const modal = document.getElementById('edit-modal');
      expect(modal?.style.display).toBe('block');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });
  });

  describe('Tab Switching', () => {
    it('should start on content tab by default', () => {
      showModal(testElement);

      const contentTab = document.getElementById('tab-content');
      const srcTab = document.getElementById('tab-src');
      const contentEditor = document.getElementById('editor-content');
      const srcEditor = document.getElementById('editor-src');

      expect(contentTab?.classList.contains('active')).toBe(true);
      expect(srcTab?.classList.contains('active')).toBe(false);
      expect(contentEditor?.style.display).toBe('block');
      expect(srcEditor?.style.display).toBe('none');
    });

    it('should start on src tab for image with src', () => {
      testElement.type = 'img';
      testElement.src = 'image.png';

      showModal(testElement);

      const contentTab = document.getElementById('tab-content');
      const srcTab = document.getElementById('tab-src');

      expect(srcTab?.classList.contains('active')).toBe(true);
      expect(contentTab?.classList.contains('active')).toBe(false);
    });

    it('should switch to src tab on click', async () => {
      const promise = showModal(testElement);

      const srcTab = document.getElementById('tab-src') as HTMLButtonElement;
      srcTab.click();

      const contentEditor = document.getElementById('editor-content');
      const srcEditor = document.getElementById('editor-src');

      expect(srcTab.classList.contains('active')).toBe(true);
      expect(contentEditor?.style.display).toBe('none');
      expect(srcEditor?.style.display).toBe('block');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should switch to content tab on click', async () => {
      testElement.type = 'img';
      testElement.src = 'image.png';

      const promise = showModal(testElement);

      const contentTab = document.getElementById('tab-content') as HTMLButtonElement;
      contentTab.click();

      const contentEditor = document.getElementById('editor-content');
      const srcEditor = document.getElementById('editor-src');

      expect(contentTab.classList.contains('active')).toBe(true);
      expect(contentEditor?.style.display).toBe('block');
      expect(srcEditor?.style.display).toBe('none');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should refresh editor on tab switch', async () => {
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const srcEditor = CodeMirrorMock.mock.results[1]?.value;

      const srcTab = document.getElementById('tab-src') as HTMLButtonElement;
      srcTab.click();

      expect(srcEditor.refresh).toHaveBeenCalled();

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });
  });

  describe('Version Navigation', () => {
    beforeEach(() => {
      testElement.versions = [
        { content: 'Version 1', timestamp: Date.now() - 3000 },
        { content: 'Version 2', timestamp: Date.now() - 2000 },
        { content: 'Version 3', timestamp: Date.now() - 1000 }
      ];
      testElement.content = 'Current Version';
    });

    it('should show version info', () => {
      showModal(testElement);

      const versionInfo = document.getElementById('versions-info');
      expect(versionInfo?.textContent).toContain('Version');
      expect(versionInfo?.textContent).toContain('4'); // 3 versions + current
    });

    it('should navigate to previous version', async () => {
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;

      const prevBtn = document.getElementById('versions-prev') as HTMLButtonElement;
      prevBtn.click();

      expect(contentEditor.setValue).toHaveBeenCalledWith('Version 3');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should navigate to next version', async () => {
      const promise = showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;

      // Go back first
      const prevBtn = document.getElementById('versions-prev') as HTMLButtonElement;
      prevBtn.click();

      // Then forward
      const nextBtn = document.getElementById('versions-next') as HTMLButtonElement;
      nextBtn.click();

      expect(contentEditor.setValue).toHaveBeenCalledWith('Current Version');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should not go beyond version bounds', async () => {
      const promise = showModal(testElement);

      const nextBtn = document.getElementById('versions-next') as HTMLButtonElement;

      // Click next multiple times (already at latest)
      nextBtn.click();
      nextBtn.click();
      nextBtn.click();

      const versionInfo = document.getElementById('versions-info');
      expect(versionInfo?.textContent).toContain('Version 4 of 4');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should handle element with no versions', () => {
      testElement.versions = [];

      showModal(testElement);

      const versionInfo = document.getElementById('versions-info');
      expect(versionInfo?.textContent).toContain('Version 1 of 1');
    });
  });

  describe('Content Generation', () => {
    it('should show generate button', () => {
      showModal(testElement);

      const generateBtn = document.getElementById('modal-generate');
      expect(generateBtn).toBeTruthy();
    });

    it('should call generate function when provided', async () => {
      const generateFn = jest.fn().mockResolvedValue('Generated Content');

      const promise = showModal(testElement, { generateContent: generateFn });

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const contentEditor = CodeMirrorMock.mock.results[0]?.value;
      contentEditor.getValue.mockReturnValue('seed text');

      const generateBtn = document.getElementById('modal-generate') as HTMLButtonElement;
      generateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(generateFn).toHaveBeenCalledWith('seed text');
      expect(contentEditor.setValue).toHaveBeenCalledWith('Generated Content');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should handle generation errors', async () => {
      const generateFn = jest.fn().mockRejectedValue(new Error('Generation failed'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const promise = showModal(testElement, { generateContent: generateFn });

      const generateBtn = document.getElementById('modal-generate') as HTMLButtonElement;
      generateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleErrorSpy).toHaveBeenCalled();

      const errorBox = document.getElementById('modal-error');
      expect(errorBox?.textContent).toContain('Error');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;

      consoleErrorSpy.mockRestore();
    });

    it('should disable generate button during generation', async () => {
      const generateFn = jest.fn(() => new Promise(resolve => setTimeout(() => resolve('Done'), 100)));

      const promise = showModal(testElement, { generateContent: generateFn });

      const generateBtn = document.getElementById('modal-generate') as HTMLButtonElement;
      generateBtn.click();

      expect(generateBtn.disabled).toBe(true);
      expect(generateBtn.innerHTML).toContain('Generating');
      expect(generateBtn.innerHTML).toContain('fa-spinner');

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(generateBtn.disabled).toBe(false);

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should show error for empty generation result', async () => {
      const generateFn = jest.fn().mockResolvedValue('');

      const promise = showModal(testElement, { generateContent: generateFn });

      const generateBtn = document.getElementById('modal-generate') as HTMLButtonElement;
      generateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorBox = document.getElementById('modal-error');
      expect(errorBox?.textContent).toContain('No content generated');

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });

    it('should do nothing if no generate function provided', async () => {
      const promise = showModal(testElement);

      const generateBtn = document.getElementById('modal-generate') as HTMLButtonElement;
      generateBtn.click();

      // Should not throw or cause issues
      await new Promise(resolve => setTimeout(resolve, 0));

      const cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });
  });

  describe('CodeMirror Mode Selection', () => {
    it('should use htmlmixed mode for html type', () => {
      testElement.type = 'html';
      showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const config = CodeMirrorMock.mock.calls[0][1];

      expect(config.mode).toBe('htmlmixed');
    });

    it('should use markdown mode for markdown type', () => {
      testElement.type = 'markdown';
      showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const config = CodeMirrorMock.mock.calls[0][1];

      expect(config.mode).toBe('markdown');
    });

    it('should use javascript mode for text type', () => {
      testElement.type = 'text';
      showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const config = CodeMirrorMock.mock.calls[0][1];

      expect(config.mode).toBe('javascript');
    });

    it('should use text mode for unknown types', () => {
      testElement.type = 'unknown-type';
      showModal(testElement);

      const CodeMirrorMock = (window as any).CodeMirror as jest.Mock;
      const config = CodeMirrorMock.mock.calls[0][1];

      expect(config.mode).toBe('text');
    });
  });

  describe('Error Display', () => {
    it('should have error box in DOM', () => {
      showModal(testElement);

      const errorBox = document.getElementById('modal-error');
      expect(errorBox).toBeTruthy();
    });

    it('should clear error on modal open', async () => {
      const generateFn = jest.fn().mockResolvedValue('');
      let promise = showModal(testElement, { generateContent: generateFn });

      const generateBtn = document.getElementById('modal-generate') as HTMLButtonElement;
      generateBtn.click();

      await new Promise(resolve => setTimeout(resolve, 0));

      const errorBox = document.getElementById('modal-error');
      expect(errorBox?.textContent).not.toBe('');

      let cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;

      // Open again
      promise = showModal(testElement);

      expect(errorBox?.textContent).toBe('');

      cancelBtn = document.getElementById('modal-cancel') as HTMLButtonElement;
      cancelBtn.click();
      await promise;
    });
  });
});
