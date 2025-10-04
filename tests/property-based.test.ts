/**
 * Property-Based Tests
 *
 * These tests use fast-check to generate random inputs and verify
 * that certain properties (invariants) always hold true, regardless
 * of the input. This helps find edge cases that manual tests might miss.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import fc from 'fast-check';
import { HistoryManager } from '../src/services/HistoryManager';
import { ViewportManager } from '../src/services/ViewportManager';
import { SelectionManager } from '../src/services/SelectionManager';
import type { CanvasState, ViewState } from '../src/types';

// Test data generators
const canvasStateArbitrary = fc.record({
  elements: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      type: fc.constantFrom('text', 'rectangle', 'circle'),
      x: fc.integer({ min: -10000, max: 10000 }),
      y: fc.integer({ min: -10000, max: 10000 }),
      width: fc.integer({ min: 10, max: 1000 }),
      height: fc.integer({ min: 10, max: 1000 }),
    }),
    { maxLength: 50 }
  ),
  edges: fc.array(
    fc.record({
      id: fc.string({ minLength: 1, maxLength: 20 }),
      from: fc.string({ minLength: 1, maxLength: 20 }),
      to: fc.string({ minLength: 1, maxLength: 20 }),
    }),
    { maxLength: 50 }
  ),
});

const viewStateArbitrary = fc.record({
  scale: fc.double({ min: 0.1, max: 10, noNaN: true }),
  translateX: fc.double({ min: -10000, max: 10000, noNaN: true }),
  translateY: fc.double({ min: -10000, max: 10000, noNaN: true }),
});

describe('Property-Based Tests', () => {
  // Setup DOM for tests that need it
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="canvas-container"></div>
      <div id="canvas"></div>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('HistoryManager', () => {
    it('undo/redo should be inverse operations', () => {
      fc.assert(
        fc.property(canvasStateArbitrary, viewStateArbitrary, (canvasState, viewState) => {
          let currentState = { canvasState, viewState };
          const getState = () => structuredClone(currentState);
          const setState = (state: any) => {
            currentState = state;
          };

          const manager = new HistoryManager(getState, setState);

          // Save initial element count
          const initialCount = canvasState.elements.length;

          // Make a change
          currentState = {
            canvasState: {
              ...canvasState,
              elements: [...canvasState.elements, { id: 'new', type: 'text', x: 0, y: 0, width: 100, height: 50 }],
            },
            viewState,
          };
          manager.snapshot('Add element');

          // Undo should restore to state with one less element
          manager.undo();

          expect(currentState.canvasState.elements.length).toBe(initialCount);
        })
      );
    });

    it('should maintain history size limit', () => {
      fc.assert(
        fc.property(fc.array(fc.string(), { minLength: 0, maxLength: 200 }), (labels) => {
          let state = { canvasState: { elements: [], edges: [] }, viewState: { scale: 1, translateX: 0, translateY: 0 } };
          const getState = () => state;
          const setState = (s: any) => {
            state = s;
          };

          const manager = new HistoryManager(getState, setState);

          // Add many snapshots
          labels.forEach((label, i) => {
            state = {
              canvasState: { elements: [{ id: `el-${i}`, type: 'text', x: i, y: i, width: 100, height: 50 }], edges: [] },
              viewState: { scale: 1, translateX: i, translateY: i },
            };
            manager.snapshot(label);
          });

          // History should not grow unbounded (max 100 items)
          const undoCount = manager.getUndoCount();
          expect(undoCount).toBeLessThanOrEqual(100);
        })
      );
    });

    it('redo stack should clear after new action', () => {
      fc.assert(
        fc.property(fc.integer({ min: 2, max: 10 }), (numActions) => {
          let state = { canvasState: { elements: [], edges: [] }, viewState: { scale: 1, translateX: 0, translateY: 0 } };
          const getState = () => structuredClone(state);
          const setState = (s: any) => {
            state = s;
          };

          const manager = new HistoryManager(getState, setState);

          // Perform actions
          for (let i = 0; i < numActions; i++) {
            state = {
              canvasState: { elements: [{ id: `el-${i}`, type: 'text', x: i, y: i, width: 100, height: 50 }], edges: [] },
              viewState: { scale: 1, translateX: i, translateY: i },
            };
            manager.snapshot(`Action ${i}`);
          }

          // Undo at least one action
          const undoCount = Math.max(1, Math.floor(numActions / 2));
          for (let i = 0; i < undoCount; i++) {
            if (manager.canUndo()) {
              manager.undo();
            }
          }

          // Should have redo available
          const hadRedo = manager.canRedo();

          // Make new action
          state = {
            canvasState: { elements: [{ id: 'new', type: 'text', x: 999, y: 999, width: 100, height: 50 }], edges: [] },
            viewState: { scale: 1, translateX: 999, translateY: 999 },
          };
          manager.snapshot('New action');

          // Redo stack should be cleared (only test if we had redo before)
          if (hadRedo) {
            expect(manager.canRedo()).toBe(false);
          }
        })
      );
    });
  });

  describe('ViewportManager', () => {
    it('scale should accept any numeric value', () => {
      fc.assert(
        fc.property(fc.double({ min: 0.001, max: 1000, noNaN: true }), (scale) => {
          const canvasElement = document.createElement('div');
          const containerElement = document.createElement('div');
          const initialViewState: ViewState = { scale: 1, translateX: 0, translateY: 0 };

          const manager = new ViewportManager(canvasElement, containerElement, initialViewState);

          manager.setViewState({ scale });

          // Scale should be set as provided (no clamping in service layer)
          const viewState = manager.getViewState();
          expect(viewState.scale).toBe(scale);
        })
      );
    });

    it('viewport transformations should be commutative for translate', () => {
      fc.assert(
        fc.property(
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          fc.double({ min: -1000, max: 1000, noNaN: true }),
          (dx, dy) => {
            const canvasElement = document.createElement('div');
            const containerElement = document.createElement('div');
            const initialViewState: ViewState = { scale: 1, translateX: 0, translateY: 0 };

            const manager1 = new ViewportManager(canvasElement, containerElement, initialViewState);
            const manager2 = new ViewportManager(canvasElement.cloneNode() as HTMLElement, containerElement, initialViewState);

            // Apply transformations in different order
            manager1.setViewState({ translateX: dx, translateY: dy });
            manager2.setViewState({ translateY: dy, translateX: dx });

            // Results should be the same
            expect(manager1.getViewState().translateX).toBe(manager2.getViewState().translateX);
            expect(manager1.getViewState().translateY).toBe(manager2.getViewState().translateY);
          }
        )
      );
    });

    it('viewState mutations should persist', () => {
      fc.assert(
        fc.property(viewStateArbitrary, (randomViewState) => {
          const canvasElement = document.createElement('div');
          const containerElement = document.createElement('div');
          const initialViewState: ViewState = { scale: 1, translateX: 0, translateY: 0 };

          const manager = new ViewportManager(canvasElement, containerElement, initialViewState);

          // Get mutable reference
          const viewState = manager.getViewState();

          // Mutate it
          viewState.translateX = randomViewState.translateX;
          viewState.translateY = randomViewState.translateY;

          // Mutations should persist
          expect(manager.getViewState().translateX).toBe(randomViewState.translateX);
          expect(manager.getViewState().translateY).toBe(randomViewState.translateY);
        })
      );
    });
  });

  describe('SelectionManager', () => {
    it('selection should be idempotent', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 10 }).map(s => `id-${s}`), { minLength: 1, maxLength: 20 }), (elementIds) => {
          // Ensure unique IDs
          const uniqueIds = Array.from(new Set(elementIds));

          const elements = uniqueIds.map((id) => ({
            id,
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          }));

          const canvas = document.getElementById('canvas')!;
          const container = document.getElementById('canvas-container')!;

          const manager = new SelectionManager(
            canvas,
            container,
            (id) => elements.find(el => el.id === id),
            () => elements
          );

          // Select the same element multiple times (non-additive)
          const elementId = uniqueIds[0];
          manager.selectElement(elementId, false);
          manager.selectElement(elementId, false);
          manager.selectElement(elementId, false);

          // Should only be selected once
          expect(manager.getSelectedIds().size).toBe(1);
          expect(manager.getSelectedIds().has(elementId)).toBe(true);
        })
      );
    });

    it('clear selection should always result in empty set', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 10 }).map(s => `id-${s}`), { maxLength: 50 }), (elementIds) => {
          const uniqueIds = Array.from(new Set(elementIds));

          const elements = uniqueIds.map((id) => ({
            id,
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          }));

          const canvas = document.getElementById('canvas')!;
          const container = document.getElementById('canvas-container')!;

          const manager = new SelectionManager(
            canvas,
            container,
            (id) => elements.find(el => el.id === id),
            () => elements
          );

          // Select all elements (additive)
          uniqueIds.forEach((id) => manager.selectElement(id, true));

          // Clear selection
          manager.clearSelection();

          // Should be empty
          expect(manager.getSelectedIds().size).toBe(0);
        })
      );
    });

    it('selection mutations should persist', () => {
      fc.assert(
        fc.property(fc.array(fc.string({ minLength: 1, maxLength: 10 }).map(s => `id-${s}`), { minLength: 1, maxLength: 20 }), (elementIds) => {
          const uniqueIds = Array.from(new Set(elementIds));

          const elements = uniqueIds.map((id) => ({
            id,
            type: 'text',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
          }));

          const canvas = document.getElementById('canvas')!;
          const container = document.getElementById('canvas-container')!;

          const manager = new SelectionManager(
            canvas,
            container,
            (id) => elements.find(el => el.id === id),
            () => elements
          );

          // Get mutable Set reference
          const selectedIds = manager.getSelectedIds();

          // Mutate it directly
          uniqueIds.forEach((id) => selectedIds.add(id));

          // Mutations should persist
          expect(manager.getSelectedIds().size).toBe(uniqueIds.length);
          uniqueIds.forEach((id) => {
            expect(manager.getSelectedIds().has(id)).toBe(true);
          });
        })
      );
    });

    it('selecting non-existent element should not crash', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 1, maxLength: 20 }).map(s => `id-${s}`), (randomId) => {
          const canvas = document.getElementById('canvas')!;
          const container = document.getElementById('canvas-container')!;

          const manager = new SelectionManager(
            canvas,
            container,
            (id) => undefined,
            () => []
          );

          // Should not throw
          expect(() => manager.selectElement(randomId)).not.toThrow();

          // Selection should be empty (or contain the ID if implementation allows)
          // This test verifies the operation doesn't crash
        })
      );
    });
  });

  describe('Cross-Service Invariants', () => {
    it('viewport scale changes should not affect selection', () => {
      fc.assert(
        fc.property(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }).map(s => `id-${s}`), { minLength: 1, maxLength: 10 }),
          fc.double({ min: 0.1, max: 10, noNaN: true }),
          (elementIds, scale) => {
            const uniqueIds = Array.from(new Set(elementIds));

            const canvasElement = document.createElement('div');
            const containerElement = document.createElement('div');
            const initialViewState: ViewState = { scale: 1, translateX: 0, translateY: 0 };

            const elements = uniqueIds.map((id) => ({
              id,
              type: 'text',
              x: 0,
              y: 0,
              width: 100,
              height: 50,
            }));

            const canvas = document.getElementById('canvas')!;
            const container = document.getElementById('canvas-container')!;

            const viewportManager = new ViewportManager(canvasElement, containerElement, initialViewState);
            const selectionManager = new SelectionManager(
              canvas,
              container,
              (id) => elements.find(el => el.id === id),
              () => elements
            );

            // Select some elements (additive)
            uniqueIds.forEach((id) => selectionManager.selectElement(id, true));
            const selectedCount = selectionManager.getSelectedIds().size;

            // Change viewport scale
            viewportManager.setViewState({ scale });

            // Selection should remain unchanged
            expect(selectionManager.getSelectedIds().size).toBe(selectedCount);
          }
        )
      );
    });

    it('history operations should preserve canvas state integrity', () => {
      fc.assert(
        fc.property(canvasStateArbitrary, viewStateArbitrary, (canvasState, viewState) => {
          let currentState = { canvasState, viewState };
          const getState = () => currentState;
          const setState = (state: any) => {
            currentState = state;
          };

          const manager = new HistoryManager(getState, setState);

          manager.snapshot('Initial');

          // Perform multiple undo/redo cycles
          for (let i = 0; i < 5; i++) {
            currentState = {
              canvasState: {
                ...canvasState,
                elements: [...canvasState.elements, { id: `el-${i}`, type: 'text', x: i * 10, y: i * 10, width: 100, height: 50 }],
              },
              viewState,
            };
            manager.snapshot(`Action ${i}`);
          }

          // Undo all
          while (manager.canUndo()) {
            manager.undo();
          }

          // Redo all
          while (manager.canRedo()) {
            manager.redo();
          }

          // State should be valid (no undefined/null)
          expect(currentState.canvasState).toBeDefined();
          expect(currentState.viewState).toBeDefined();
          expect(currentState.canvasState.elements).toBeDefined();
          expect(currentState.canvasState.edges).toBeDefined();
        })
      );
    });
  });
});
