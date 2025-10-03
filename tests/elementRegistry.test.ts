/**
 * Unit tests for elementRegistry.ts
 * Testing element type registration, lookup, and lifecycle management
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createRegistry, elementRegistry } from '../src/lib/elements/elementRegistry';
import type { CanvasElement } from '../src/types';

describe('elementRegistry', () => {
  describe('createRegistry', () => {
    let registry: ReturnType<typeof createRegistry>;

    beforeEach(() => {
      // Create a fresh registry for each test to ensure isolation
      registry = createRegistry();
    });

    describe('register()', () => {
      it('should register a new element type', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div'))
        };

        registry.register('test-type', mockView);
        const view = registry.viewFor('test-type');

        expect(view).toBe(mockView);
      });

      it('should overwrite existing element type when registering again', () => {
        const mockView1 = {
          mount: jest.fn(() => document.createElement('div'))
        };
        const mockView2 = {
          mount: jest.fn(() => document.createElement('span'))
        };

        registry.register('test-type', mockView1);
        registry.register('test-type', mockView2);
        const view = registry.viewFor('test-type');

        expect(view).toBe(mockView2);
        expect(view).not.toBe(mockView1);
      });

      it('should throw error when type is not a string', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div'))
        };

        expect(() => {
          registry.register(null as any, mockView);
        }).toThrow('register(type, view) – type string & view.mount() required');

        expect(() => {
          registry.register(123 as any, mockView);
        }).toThrow('register(type, view) – type string & view.mount() required');

        expect(() => {
          registry.register(undefined as any, mockView);
        }).toThrow('register(type, view) – type string & view.mount() required');
      });

      it('should throw error when view is missing', () => {
        expect(() => {
          registry.register('test-type', null as any);
        }).toThrow('register(type, view) – type string & view.mount() required');

        expect(() => {
          registry.register('test-type', undefined as any);
        }).toThrow('register(type, view) – type string & view.mount() required');
      });

      it('should throw error when view.mount is not a function', () => {
        expect(() => {
          registry.register('test-type', {} as any);
        }).toThrow('register(type, view) – type string & view.mount() required');

        expect(() => {
          registry.register('test-type', { mount: 'not-a-function' } as any);
        }).toThrow('register(type, view) – type string & view.mount() required');

        expect(() => {
          registry.register('test-type', { mount: null } as any);
        }).toThrow('register(type, view) – type string & view.mount() required');
      });

      it('should accept view with optional update and unmount methods', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div')),
          update: jest.fn(),
          unmount: jest.fn()
        };

        expect(() => {
          registry.register('test-type', mockView);
        }).not.toThrow();

        const view = registry.viewFor('test-type');
        expect(view).toBe(mockView);
        expect(view?.update).toBe(mockView.update);
        expect(view?.unmount).toBe(mockView.unmount);
      });

      it('should accept view with only mount method', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div'))
        };

        expect(() => {
          registry.register('test-type', mockView);
        }).not.toThrow();

        const view = registry.viewFor('test-type');
        expect(view).toBe(mockView);
        expect(view?.update).toBeUndefined();
        expect(view?.unmount).toBeUndefined();
      });
    });

    describe('viewFor()', () => {
      it('should return undefined for unregistered type', () => {
        const view = registry.viewFor('non-existent-type');
        expect(view).toBeUndefined();
      });

      it('should return registered view for existing type', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div'))
        };

        registry.register('test-type', mockView);
        const view = registry.viewFor('test-type');

        expect(view).toBe(mockView);
      });

      it('should return correct view when multiple types are registered', () => {
        const mockView1 = {
          mount: jest.fn(() => document.createElement('div'))
        };
        const mockView2 = {
          mount: jest.fn(() => document.createElement('span'))
        };
        const mockView3 = {
          mount: jest.fn(() => document.createElement('p'))
        };

        registry.register('type1', mockView1);
        registry.register('type2', mockView2);
        registry.register('type3', mockView3);

        expect(registry.viewFor('type1')).toBe(mockView1);
        expect(registry.viewFor('type2')).toBe(mockView2);
        expect(registry.viewFor('type3')).toBe(mockView3);
      });
    });

    describe('listTypes()', () => {
      it('should return empty array when no types are registered', () => {
        const types = registry.listTypes();
        expect(types).toEqual([]);
      });

      it('should return array with single type', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div'))
        };

        registry.register('test-type', mockView);
        const types = registry.listTypes();

        expect(types).toEqual(['test-type']);
      });

      it('should return array with all registered types', () => {
        const mockView1 = {
          mount: jest.fn(() => document.createElement('div'))
        };
        const mockView2 = {
          mount: jest.fn(() => document.createElement('span'))
        };
        const mockView3 = {
          mount: jest.fn(() => document.createElement('p'))
        };

        registry.register('type1', mockView1);
        registry.register('type2', mockView2);
        registry.register('type3', mockView3);

        const types = registry.listTypes();

        expect(types).toHaveLength(3);
        expect(types).toContain('type1');
        expect(types).toContain('type2');
        expect(types).toContain('type3');
      });

      it('should not include duplicates when type is overwritten', () => {
        const mockView1 = {
          mount: jest.fn(() => document.createElement('div'))
        };
        const mockView2 = {
          mount: jest.fn(() => document.createElement('span'))
        };

        registry.register('test-type', mockView1);
        registry.register('test-type', mockView2);

        const types = registry.listTypes();

        expect(types).toEqual(['test-type']);
      });

      it('should return shallow copy (not affect internal state)', () => {
        const mockView = {
          mount: jest.fn(() => document.createElement('div'))
        };

        registry.register('test-type', mockView);
        const types1 = registry.listTypes();
        types1.push('modified');

        const types2 = registry.listTypes();

        expect(types2).toEqual(['test-type']);
        expect(types2).not.toContain('modified');
      });
    });

    describe('registry isolation', () => {
      it('should maintain separate state for different registry instances', () => {
        const registry1 = createRegistry();
        const registry2 = createRegistry();

        const mockView1 = {
          mount: jest.fn(() => document.createElement('div'))
        };
        const mockView2 = {
          mount: jest.fn(() => document.createElement('span'))
        };

        registry1.register('type1', mockView1);
        registry2.register('type2', mockView2);

        expect(registry1.viewFor('type1')).toBe(mockView1);
        expect(registry1.viewFor('type2')).toBeUndefined();
        expect(registry2.viewFor('type1')).toBeUndefined();
        expect(registry2.viewFor('type2')).toBe(mockView2);

        expect(registry1.listTypes()).toEqual(['type1']);
        expect(registry2.listTypes()).toEqual(['type2']);
      });
    });
  });

  describe('elementRegistry (shared instance)', () => {
    // Test the singleton instance behavior
    it('should be a singleton instance', () => {
      expect(elementRegistry).toBeDefined();
      expect(elementRegistry.register).toBeDefined();
      expect(elementRegistry.viewFor).toBeDefined();
      expect(elementRegistry.listTypes).toBeDefined();
    });

    it('should persist registrations across imports', () => {
      const mockView = {
        mount: jest.fn(() => document.createElement('div'))
      };

      // Register in the shared instance
      elementRegistry.register('persistent-type', mockView);

      // Should be retrievable
      const view = elementRegistry.viewFor('persistent-type');
      expect(view).toBe(mockView);
    });
  });

  describe('window.registerElementType global', () => {
    it('should expose registerElementType on window object', () => {
      // Check if window.registerElementType exists
      expect((window as any).registerElementType).toBeDefined();
      expect(typeof (window as any).registerElementType).toBe('function');
    });

    it('should allow registration through window.registerElementType', () => {
      const mockView = {
        mount: jest.fn(() => document.createElement('div'))
      };

      // Register through window global
      (window as any).registerElementType('window-type', mockView);

      // Should be retrievable from elementRegistry
      const view = elementRegistry.viewFor('window-type');
      expect(view).toBe(mockView);
    });

    it('should be the same function as elementRegistry.register', () => {
      expect((window as any).registerElementType).toBe(elementRegistry.register);
    });
  });

  describe('ElementView lifecycle hooks', () => {
    let registry: ReturnType<typeof createRegistry>;

    beforeEach(() => {
      registry = createRegistry();
    });

    it('should call mount hook with element and controller', () => {
      const mockElement: CanvasElement = {
        id: 'test-1',
        type: 'test',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        content: 'test content'
      };
      const mockController = { requestRender: jest.fn() };
      const mockMount = jest.fn(() => document.createElement('div'));

      const mockView = {
        mount: mockMount
      };

      registry.register('test', mockView);
      const view = registry.viewFor('test');

      const result = view!.mount(mockElement, mockController);

      expect(mockMount).toHaveBeenCalledWith(mockElement, mockController);
      expect(mockMount).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(HTMLElement);
    });

    it('should call update hook when provided', () => {
      const mockElement: CanvasElement = {
        id: 'test-1',
        type: 'test',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        content: 'test content'
      };
      const mockController = { requestRender: jest.fn() };
      const mockDom = document.createElement('div');
      const mockUpdate = jest.fn();

      const mockView = {
        mount: jest.fn(() => mockDom),
        update: mockUpdate
      };

      registry.register('test', mockView);
      const view = registry.viewFor('test');

      view!.update!(mockElement, mockDom, mockController);

      expect(mockUpdate).toHaveBeenCalledWith(mockElement, mockDom, mockController);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });

    it('should call unmount hook when provided', () => {
      const mockDom = document.createElement('div');
      const mockUnmount = jest.fn();

      const mockView = {
        mount: jest.fn(() => mockDom),
        unmount: mockUnmount
      };

      const registry = createRegistry();
      registry.register('test', mockView);
      const view = registry.viewFor('test');

      view!.unmount!(mockDom);

      expect(mockUnmount).toHaveBeenCalledWith(mockDom);
      expect(mockUnmount).toHaveBeenCalledTimes(1);
    });

    it('should handle view without update hook', () => {
      const mockElement: CanvasElement = {
        id: 'test-1',
        type: 'test',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        content: 'test content'
      };
      const mockController = { requestRender: jest.fn() };
      const mockDom = document.createElement('div');

      const mockView = {
        mount: jest.fn(() => mockDom)
      };

      registry.register('test', mockView);
      const view = registry.viewFor('test');

      expect(view!.update).toBeUndefined();
    });

    it('should handle view without unmount hook', () => {
      const mockDom = document.createElement('div');

      const mockView = {
        mount: jest.fn(() => mockDom)
      };

      registry.register('test', mockView);
      const view = registry.viewFor('test');

      expect(view!.unmount).toBeUndefined();
    });
  });
});
