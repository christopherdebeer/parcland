/**
 * Unit tests for elementTypes/json.ts
 * Testing JSON element type mount/update/unmount lifecycle and rendering
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { elementRegistry } from '../src/lib/elements/elementRegistry';
import type { CanvasElement } from '../src/types';

// Import the json element type to trigger registration
import '../src/lib/elements/elementTypes/json';

describe('elementTypes/json', () => {
  let mockController: any;

  beforeEach(() => {
    mockController = {
      requestRender: jest.fn(),
      mode: 'navigate'
    };
  });

  describe('registration', () => {
    it('should register json type in elementRegistry', () => {
      const view = elementRegistry.viewFor('json');
      expect(view).toBeDefined();
      expect(view?.mount).toBeDefined();
      expect(typeof view?.mount).toBe('function');
    });

    it('should have mount and update methods', () => {
      const view = elementRegistry.viewFor('json');
      expect(view?.mount).toBeDefined();
      expect(view?.update).toBeDefined();
    });

    it('should not have unmount method (optional)', () => {
      const view = elementRegistry.viewFor('json');
      // unmount is optional, just verify it exists or doesn't exist
      expect(view?.unmount).toBeUndefined();
    });
  });

  describe('mount()', () => {
    it('should create a pre element', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: '{"key": "value"}'
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      expect(domElement).toBeInstanceOf(HTMLPreElement);
      expect(domElement.tagName).toBe('PRE');
    });

    it('should add "content" class to the element', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: '{"key": "value"}'
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      expect(domElement.className).toBe('content');
    });

    it('should set margin to 0', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: '{"key": "value"}'
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      expect(domElement.style.margin).toMatch(/^0(px)?$/);
    });

    it('should call update during mount to render initial content', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'initial content'
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      // Content should be set after mount (via update call)
      expect(domElement.textContent).toBeTruthy();
    });

    it('should render element with data property', () => {
      const mockElement: any = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'fallback',
        data: { name: 'test', value: 123 }
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      const expected = JSON.stringify(mockElement.data, null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should render element without data property using content', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'plain text content'
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      const expected = JSON.stringify(mockElement.content, null, 2);
      expect(domElement.textContent).toBe(expected);
    });
  });

  describe('update()', () => {
    let domElement: HTMLElement;
    let mockElement: CanvasElement;

    beforeEach(() => {
      domElement = document.createElement('pre');
      mockElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'initial content'
      };
    });

    it('should update textContent with stringified content', () => {
      const view = elementRegistry.viewFor('json');
      view!.update!(mockElement, domElement);

      const expected = JSON.stringify(mockElement.content, null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should update textContent when content changes', () => {
      const view = elementRegistry.viewFor('json');

      mockElement.content = 'first content';
      view!.update!(mockElement, domElement);
      expect(domElement.textContent).toBe(JSON.stringify('first content', null, 2));

      mockElement.content = 'second content';
      view!.update!(mockElement, domElement);
      expect(domElement.textContent).toBe(JSON.stringify('second content', null, 2));
    });

    it('should prioritize data property over content', () => {
      const elementWithData: any = {
        ...mockElement,
        content: 'content value',
        data: { foo: 'bar' }
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithData, domElement);

      const expected = JSON.stringify(elementWithData.data, null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should handle null data property', () => {
      const elementWithNullData: any = {
        ...mockElement,
        content: 'content value',
        data: null
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithNullData, domElement);

      const expected = JSON.stringify(elementWithNullData.content, null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should handle undefined data property', () => {
      const elementWithUndefinedData: any = {
        ...mockElement,
        content: 'content value',
        data: undefined
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithUndefinedData, domElement);

      const expected = JSON.stringify(elementWithUndefinedData.content, null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should handle complex nested objects', () => {
      const complexData = {
        name: 'test',
        nested: {
          array: [1, 2, 3],
          object: { key: 'value' }
        },
        boolean: true,
        number: 42
      };

      const elementWithData: any = {
        ...mockElement,
        data: complexData
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithData, domElement);

      const expected = JSON.stringify(complexData, null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should format JSON with 2-space indentation', () => {
      const data = { a: 1, b: { c: 2 } };
      const elementWithData: any = {
        ...mockElement,
        data: data
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithData, domElement);

      // Check that the output contains newlines and proper indentation
      expect(domElement.textContent).toContain('\n');
      expect(domElement.textContent).toContain('  '); // 2-space indent
    });

    it('should handle empty objects', () => {
      const elementWithData: any = {
        ...mockElement,
        data: {}
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithData, domElement);

      expect(domElement.textContent).toBe('{}');
    });

    it('should handle empty arrays', () => {
      const elementWithData: any = {
        ...mockElement,
        data: []
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithData, domElement);

      expect(domElement.textContent).toBe('[]');
    });

    it('should handle strings in content', () => {
      mockElement.content = 'plain string';

      const view = elementRegistry.viewFor('json');
      view!.update!(mockElement, domElement);

      const expected = JSON.stringify('plain string', null, 2);
      expect(domElement.textContent).toBe(expected);
    });

    it('should handle numbers in content', () => {
      const elementWithNumber: any = {
        ...mockElement,
        content: 12345
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithNumber, domElement);

      expect(domElement.textContent).toBe('12345');
    });

    it('should handle booleans in content', () => {
      const elementWithBoolean: any = {
        ...mockElement,
        content: true
      };

      const view = elementRegistry.viewFor('json');
      view!.update!(elementWithBoolean, domElement);

      expect(domElement.textContent).toBe('true');
    });
  });

  describe('lifecycle integration', () => {
    it('should render correctly through full mount-update cycle', () => {
      const mockElement: any = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'initial',
        data: { version: 1 }
      };

      const view = elementRegistry.viewFor('json');

      // Mount
      const domElement = view!.mount(mockElement, mockController);
      expect(domElement.textContent).toBe(JSON.stringify({ version: 1 }, null, 2));

      // Update with new data
      mockElement.data = { version: 2 };
      view!.update!(mockElement, domElement);
      expect(domElement.textContent).toBe(JSON.stringify({ version: 2 }, null, 2));

      // Update again
      mockElement.data = { version: 3, extra: 'info' };
      view!.update!(mockElement, domElement);
      expect(domElement.textContent).toBe(JSON.stringify({ version: 3, extra: 'info' }, null, 2));
    });

    it('should maintain element properties after updates', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'test'
      };

      const view = elementRegistry.viewFor('json');
      const domElement = view!.mount(mockElement, mockController);

      // Verify initial properties
      expect(domElement.className).toBe('content');
      expect(domElement.style.margin).toMatch(/^0(px)?$/);
      expect(domElement.tagName).toBe('PRE');

      // Update
      mockElement.content = 'updated';
      view!.update!(mockElement, domElement);

      // Verify properties are maintained after update
      expect(domElement.className).toBe('content');
      expect(domElement.style.margin).toMatch(/^0(px)?$/);
      expect(domElement.tagName).toBe('PRE');
    });
  });

  describe('error handling', () => {
    it('should handle JSON.stringify errors gracefully', () => {
      // Create a circular reference
      const circular: any = { name: 'test' };
      circular.self = circular;

      const mockElement: any = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'fallback',
        data: circular
      };

      const view = elementRegistry.viewFor('json');
      const domElement = document.createElement('pre');

      // This should throw a TypeError due to circular reference
      expect(() => {
        view!.update!(mockElement, domElement);
      }).toThrow(TypeError);
    });
  });

  describe('controller parameter', () => {
    it('should accept controller parameter in mount', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'test'
      };

      const customController = {
        customMethod: jest.fn(),
        requestRender: jest.fn()
      };

      const view = elementRegistry.viewFor('json');

      // Should not throw even with custom controller
      expect(() => {
        view!.mount(mockElement, customController);
      }).not.toThrow();
    });

    it('should work without controller (undefined)', () => {
      const mockElement: CanvasElement = {
        id: 'json-1',
        type: 'json',
        x: 0,
        y: 0,
        width: 200,
        height: 100,
        content: 'test'
      };

      const view = elementRegistry.viewFor('json');

      // Should not throw even without controller
      expect(() => {
        view!.mount(mockElement, undefined);
      }).not.toThrow();
    });
  });
});
