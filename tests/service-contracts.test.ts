/**
 * Contract tests for service APIs
 *
 * These tests verify that services maintain their contracts even after refactoring.
 * They ensure that API behavior (mutability, reference equality, etc.) remains consistent.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { HistoryManager } from "../src/services/HistoryManager";
import { ViewportManager } from "../src/services/ViewportManager";
import { SelectionManager } from "../src/services/SelectionManager";
import type { CanvasState, ViewState, CanvasElement } from "../src/types";

// Test data factories
const createTestElement = (
  overrides: Partial<CanvasElement> = {},
): CanvasElement => ({
  id: "el-test-" + Math.random().toString(36).substr(2, 9),
  x: 100,
  y: 100,
  width: 120,
  height: 80,
  rotation: 0,
  type: "text",
  content: "Test Element",
  scale: 1,
  versions: [],
  static: false,
  ...overrides,
});

const createTestCanvasState = (): CanvasState => ({
  canvasId: "test-canvas",
  elements: [],
  edges: [],
  versionHistory: [],
});

const createTestViewState = (): ViewState => ({
  scale: 1,
  translateX: 0,
  translateY: 0,
});

// Setup DOM environment for managers that need it
function setupDOM() {
  document.body.innerHTML = `
    <div id="canvas"></div>
    <div id="canvas-container"></div>
    <svg id="edges-layer"></svg>
  `;

  const canvas = document.getElementById("canvas")!;
  canvas.getBoundingClientRect = jest.fn(() => ({
    width: 800,
    height: 600,
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));

  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    clear: jest.fn(),
    removeItem: jest.fn(),
    length: 0,
    key: jest.fn(),
  };
  Object.defineProperty(window, "localStorage", {
    value: localStorageMock,
    writable: true,
  });
}

describe("Service Contract Tests", () => {
  beforeEach(() => {
    setupDOM();
  });

  describe("ViewportManager Contract", () => {
    let manager: ViewportManager;
    let canvas: HTMLElement;
    let container: HTMLElement;
    let edgesLayer: SVGSVGElement;

    beforeEach(() => {
      canvas = document.getElementById("canvas")!;
      container = document.getElementById("canvas-container")!;
      edgesLayer = document.getElementById(
        "edges-layer",
      )! as unknown as SVGSVGElement;

      const findElementById = jest.fn();
      manager = new ViewportManager(
        canvas,
        container,
        edgesLayer,
        "test-canvas",
        findElementById,
      );
    });

    it("getViewState() should return mutable reference", () => {
      const state1 = manager.getViewState();
      const state2 = manager.getViewState();

      // Should be the same object (reference equality)
      expect(state1).toBe(state2);

      // Mutations should be visible through both references
      state1.translateX = 999;
      expect(state2.translateX).toBe(999);
    });

    it("mutations to getViewState() result should persist", () => {
      const state = manager.getViewState();
      const originalX = state.translateX;

      // Mutate in place
      state.translateX += 100;

      // Get state again - should reflect mutation
      const newState = manager.getViewState();
      expect(newState.translateX).toBe(originalX + 100);
    });

    it("setViewState() should update the mutable reference", () => {
      const originalState = manager.getViewState();

      manager.setViewState({ translateX: 500 });

      // Original reference should be updated
      expect(originalState.translateX).toBe(500);
    });

    it("should allow scale mutations without automatic clamping", () => {
      const state = manager.getViewState();

      // Direct mutations are allowed - no automatic clamping
      // (Clamping happens at a higher level, e.g., in gesture handlers)
      state.scale = 999;
      expect(manager.getViewState().scale).toBe(999);

      // setViewState also doesn't clamp - it's a dumb setter
      manager.setViewState({ scale: -1 });
      expect(manager.getViewState().scale).toBe(-1);

      // The bounds constants are exposed for external code to use
      expect(manager.MAX_SCALE).toBe(10);
      expect(manager.MIN_SCALE).toBe(0.1);
    });
  });

  describe("SelectionManager Contract", () => {
    let manager: SelectionManager;
    let canvas: HTMLElement;
    let container: HTMLElement;
    let elements: CanvasElement[];

    beforeEach(() => {
      canvas = document.getElementById("canvas")!;
      container = document.getElementById("canvas-container")!;

      elements = [
        createTestElement({ id: "el-1" }),
        createTestElement({ id: "el-2" }),
        createTestElement({ id: "el-3" }),
      ];

      const findElementById = (id: string) =>
        elements.find((el) => el.id === id);
      const getElements = () => elements;

      manager = new SelectionManager(
        canvas,
        container,
        findElementById,
        getElements,
      );
    });

    it("getSelectedIds() should return mutable Set", () => {
      const set1 = manager.getSelectedIds();
      const set2 = manager.getSelectedIds();

      // Should be the same Set (reference equality)
      expect(set1).toBe(set2);

      // Mutations should be visible through both references
      set1.add("test-id");
      expect(set2.has("test-id")).toBe(true);
    });

    it("mutations to getSelectedIds() result should persist", () => {
      const selectedIds = manager.getSelectedIds();

      // Mutate in place
      selectedIds.add("el-1");
      selectedIds.add("el-2");

      // Get Set again - should reflect mutations
      const newIds = manager.getSelectedIds();
      expect(newIds.size).toBe(2);
      expect(newIds.has("el-1")).toBe(true);
      expect(newIds.has("el-2")).toBe(true);
    });

    it("selectElement() should update the mutable Set", () => {
      const selectedIds = manager.getSelectedIds();

      manager.selectElement("el-1");

      // Original reference should be updated
      expect(selectedIds.has("el-1")).toBe(true);
      expect(selectedIds.size).toBe(1);
    });

    it("clearSelection() should clear the mutable Set", () => {
      const selectedIds = manager.getSelectedIds();

      selectedIds.add("el-1");
      selectedIds.add("el-2");

      manager.clearSelection();

      // Original reference should be cleared
      expect(selectedIds.size).toBe(0);
    });

    it("should support direct Set mutations (add, delete, clear)", () => {
      const selectedIds = manager.getSelectedIds();

      // Add
      selectedIds.add("el-1");
      expect(manager.getSelectedIds().has("el-1")).toBe(true);

      // Add more
      selectedIds.add("el-2");
      selectedIds.add("el-3");
      expect(manager.getSelectedIds().size).toBe(3);

      // Delete
      selectedIds.delete("el-2");
      expect(manager.getSelectedIds().has("el-2")).toBe(false);
      expect(manager.getSelectedIds().size).toBe(2);

      // Clear
      selectedIds.clear();
      expect(manager.getSelectedIds().size).toBe(0);
    });
  });

  describe("HistoryManager Contract", () => {
    let manager: HistoryManager;
    let canvasState: CanvasState;
    let viewState: ViewState;

    beforeEach(() => {
      canvasState = createTestCanvasState();
      viewState = createTestViewState();

      const getState = jest.fn(() => ({
        canvasState: JSON.parse(JSON.stringify(canvasState)), // Deep clone
        viewState: JSON.parse(JSON.stringify(viewState)),
      }));

      const setState = jest.fn(
        (state: { canvasState: CanvasState; viewState: ViewState }) => {
          canvasState = state.canvasState;
          viewState = state.viewState;
        },
      );

      manager = new HistoryManager(getState, setState);
    });

    it("should not capture undefined viewState in snapshots", () => {
      // Manager should have called getState during construction and created initial snapshot
      expect(manager.getUndoCount()).toBe(1); // Initial "Init" snapshot exists

      // Make a change and snapshot
      canvasState.elements.push(createTestElement());
      manager.snapshot("Add Element");

      expect(manager.getUndoCount()).toBe(2); // Init + Add Element

      // Should be able to undo without errors
      expect(() => manager.undo()).not.toThrow();
    });

    it("should deep clone state to prevent mutations", () => {
      // Add element and snapshot
      const element = createTestElement({ id: "el-1", x: 100 });
      canvasState.elements.push(element);
      manager.snapshot("Add Element");

      // Mutate current state
      element.x = 999;
      canvasState.elements[0].x = 999;

      // Undo should restore original value
      manager.undo();
      expect(canvasState.elements[0].x).toBe(100);
    });

    it("should maintain separate undo and redo stacks", () => {
      // Initial state - has "Init" snapshot
      expect(manager.canUndo()).toBe(true); // Can undo to initial snapshot
      expect(manager.canRedo()).toBe(false);

      // Make change 1
      canvasState.elements.push(createTestElement({ id: "el-1" }));
      manager.snapshot("Add Element 1");

      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);

      // Make change 2
      canvasState.elements.push(createTestElement({ id: "el-2" }));
      manager.snapshot("Add Element 2");

      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(false);

      // Undo once
      manager.undo();
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(true);

      // Undo again
      manager.undo();
      expect(manager.canUndo()).toBe(true); // Still have Init snapshot
      expect(manager.canRedo()).toBe(true);

      // Redo
      manager.redo();
      expect(manager.canUndo()).toBe(true);
      expect(manager.canRedo()).toBe(true);
    });

    it("should clear redo stack on new snapshot", () => {
      // Make changes
      canvasState.elements.push(createTestElement({ id: "el-1" }));
      manager.snapshot("Add Element 1");

      canvasState.elements.push(createTestElement({ id: "el-2" }));
      manager.snapshot("Add Element 2");

      // Undo
      manager.undo();
      expect(manager.canRedo()).toBe(true);

      // Make new change - should clear redo
      canvasState.elements.push(createTestElement({ id: "el-3" }));
      manager.snapshot("Add Element 3");

      expect(manager.canRedo()).toBe(false);
    });

    it("should respect maxHistory limit", () => {
      const smallManager = new HistoryManager(
        () => ({ canvasState, viewState }),
        () => {},
        5, // Max 5 entries
      );

      // Add 10 snapshots
      for (let i = 0; i < 10; i++) {
        canvasState.elements.push(createTestElement({ id: `el-${i}` }));
        smallManager.snapshot(`Add Element ${i}`);
      }

      // Should only keep last 5 (plus initial state is dropped when limit reached)
      let undoCount = 0;
      while (smallManager.canUndo()) {
        smallManager.undo();
        undoCount++;
      }

      // Should have at most 5 undo steps (ring buffer behavior)
      expect(undoCount).toBeLessThanOrEqual(5);
    });
  });

  describe("Cross-Service Integration Contracts", () => {
    it("ViewportManager and HistoryManager should work together", () => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;
      const edgesLayer = document.getElementById(
        "edges-layer",
      )! as unknown as SVGSVGElement;

      const viewportManager = new ViewportManager(
        canvas,
        container,
        edgesLayer,
        "test-canvas",
        jest.fn(),
      );

      const canvasState = createTestCanvasState();

      const getState = () => ({
        canvasState: JSON.parse(JSON.stringify(canvasState)),
        viewState: JSON.parse(JSON.stringify(viewportManager.getViewState())),
      });

      const setState = (state: {
        canvasState: CanvasState;
        viewState: ViewState;
      }) => {
        viewportManager.setViewState(state.viewState);
      };

      const historyManager = new HistoryManager(getState, setState);

      // Mutate viewState and snapshot
      const viewState = viewportManager.getViewState();
      viewState.translateX = 100;
      viewState.translateY = 50;
      historyManager.snapshot("Pan");

      // Mutate more (without snapshot - this is the "current" state we want to undo from)
      viewState.translateX = 200;

      // Undo should restore to previous snapshot
      historyManager.undo();

      // Should restore to Pan snapshot state
      expect(viewportManager.getViewState().translateX).toBe(100);
      expect(viewportManager.getViewState().translateY).toBe(50);
    });

    it("SelectionManager and HistoryManager should work together", () => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;

      const elements: CanvasElement[] = [
        createTestElement({ id: "el-1" }),
        createTestElement({ id: "el-2" }),
      ];

      const selectionManager = new SelectionManager(
        canvas,
        container,
        (id) => elements.find((el) => el.id === id),
        () => elements,
      );

      const canvasState = createTestCanvasState();
      canvasState.elements = elements;
      const viewState = createTestViewState();

      const getState = () => ({
        canvasState: JSON.parse(JSON.stringify(canvasState)),
        viewState: JSON.parse(JSON.stringify(viewState)),
      });

      const setState = (state: {
        canvasState: CanvasState;
        viewState: ViewState;
      }) => {
        // Note: In real implementation, this would restore selection state
        // For this test, we're just verifying the contract
      };

      const historyManager = new HistoryManager(getState, setState);

      // Select elements
      const selectedIds = selectionManager.getSelectedIds();
      selectedIds.add("el-1");
      historyManager.snapshot("Select");

      selectedIds.add("el-2");
      historyManager.snapshot("Multi-Select");

      // Verify mutations persisted
      expect(selectionManager.getSelectedIds().size).toBe(2);
      expect(selectionManager.getSelectedIds().has("el-1")).toBe(true);
      expect(selectionManager.getSelectedIds().has("el-2")).toBe(true);
    });
  });
});
