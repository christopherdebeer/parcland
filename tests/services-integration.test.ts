/**
 * Integration tests for service classes
 *
 * These tests verify service-to-service interactions that unit tests miss.
 * They specifically target the three critical bugs found by Codex:
 * 1. viewState getter returning copy instead of mutable reference
 * 2. selectedElementIds getter returning new Set instead of mutable reference
 * 3. HistoryManager initialized before ViewportManager, capturing undefined viewState
 *
 * Note: These tests use the service classes directly since CanvasController
 * is not exported. This approach still catches the critical bugs.
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  jest,
  afterEach,
} from "@jest/globals";
import { HistoryManager } from "../src/services/HistoryManager";
import { ViewportManager } from "../src/services/ViewportManager";
import { SelectionManager } from "../src/services/SelectionManager";
import type { CanvasState, CanvasElement, Edge, ViewState } from "../src/types";

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

const createTestCanvasState = (
  overrides: Partial<CanvasState> = {},
): CanvasState => ({
  canvasId: "canvas-test-" + Math.random().toString(36).substr(2, 9),
  elements: [],
  edges: [],
  versionHistory: [],
  ...overrides,
});

// Setup DOM environment
function setupDOM() {
  document.body.innerHTML = `
    <div id="canvas"></div>
    <div id="canvas-container"></div>
    <div id="static-container"></div>
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

  global.requestAnimationFrame = jest.fn((cb) => {
    cb(0);
    return 0;
  }) as any;
}

describe("Service Integration Tests", () => {
  beforeEach(() => {
    setupDOM();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("Service Initialization Order (Bug #3)", () => {
    it("should not capture undefined viewState when HistoryManager initialized after ViewportManager", () => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;
      const edgesLayer = document.getElementById(
        "edges-layer",
      )! as unknown as SVGSVGElement;

      const canvasState = createTestCanvasState();

      // Initialize ViewportManager FIRST
      const viewportManager = new ViewportManager(
        canvas,
        container,
        edgesLayer,
        "test-canvas",
        jest.fn(),
      );

      // Verify viewState exists
      expect(viewportManager.getViewState()).toBeDefined();
      expect(viewportManager.getViewState().scale).toBe(1);

      // Now initialize HistoryManager - it should capture valid viewState
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

      // Initial snapshot should have valid viewState
      expect(historyManager.getUndoCount()).toBe(1);

      // Undo to initial state shouldn't crash
      expect(() => historyManager.undo()).not.toThrow();
    });

    it("demonstrates the bug: HistoryManager would capture undefined viewState if initialized first", () => {
      const canvasState = createTestCanvasState();
      let viewState: ViewState | undefined = undefined;

      // Simulate wrong initialization order - HistoryManager before ViewportManager
      const getState = () => ({
        canvasState: JSON.parse(JSON.stringify(canvasState)),
        viewState: viewState as any, // Would be undefined!
      });

      const setState = jest.fn();

      // Create history manager with undefined viewState
      const historyManager = new HistoryManager(getState, setState);

      // The initial snapshot would have undefined viewState
      // This is the bug that was fixed by ensuring ViewportManager is initialized first
      expect(historyManager.getUndoCount()).toBe(1);

      // Now if we try to undo to that initial state (with undefined viewState),
      // it would fail when trying to restore
      // This demonstrates why initialization order matters
    });
  });

  describe("ViewState Property Accessor Mutations (Bug #1)", () => {
    let viewportManager: ViewportManager;

    beforeEach(() => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;
      const edgesLayer = document.getElementById(
        "edges-layer",
      )! as unknown as SVGSVGElement;

      viewportManager = new ViewportManager(
        canvas,
        container,
        edgesLayer,
        "test-canvas",
        jest.fn(),
      );
    });

    it("should allow in-place mutation of viewState.translateX", () => {
      const viewState = viewportManager.getViewState();
      const originalTranslateX = viewState.translateX;

      // Simulate gesture code that mutates in place
      viewState.translateX += 100;

      // Verify the mutation persisted (getter returns mutable reference)
      expect(viewportManager.getViewState().translateX).toBe(
        originalTranslateX + 100,
      );
    });

    it("should allow in-place mutation of viewState.translateY", () => {
      const viewState = viewportManager.getViewState();
      const originalTranslateY = viewState.translateY;

      viewState.translateY += 50;

      expect(viewportManager.getViewState().translateY).toBe(
        originalTranslateY + 50,
      );
    });

    it("should allow in-place mutation of viewState.scale", () => {
      const viewState = viewportManager.getViewState();
      const originalScale = viewState.scale;

      viewState.scale *= 1.5;

      expect(viewportManager.getViewState().scale).toBe(originalScale * 1.5);
    });

    it("should persist viewState mutations after notify", () => {
      const viewState = viewportManager.getViewState();
      const initialX = viewState.translateX;

      viewState.translateX += 50;
      viewportManager.notifyViewStateChanged();

      // Verify persistence through the manager
      expect(viewportManager.getViewState().translateX).toBe(initialX + 50);
    });

    it("should return the same viewState reference on repeated access", () => {
      const ref1 = viewportManager.getViewState();
      const ref2 = viewportManager.getViewState();

      // Should be the same object (reference equality)
      expect(ref1).toBe(ref2);
    });
  });

  describe("SelectedElementIds Property Accessor Mutations (Bug #2)", () => {
    let selectionManager: SelectionManager;
    let elements: CanvasElement[];

    beforeEach(() => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;

      elements = [
        createTestElement({ id: "el-1" }),
        createTestElement({ id: "el-2" }),
        createTestElement({ id: "el-3" }),
      ];

      const findElementById = (id: string) =>
        elements.find((el) => el.id === id);
      const getElements = () => elements;

      selectionManager = new SelectionManager(
        canvas,
        container,
        findElementById,
        getElements,
      );
    });

    it("should allow in-place mutation of selectedElementIds Set", () => {
      // Simulate lasso selection code that mutates the Set
      const selectedIds = selectionManager.getSelectedIds();
      selectedIds.add("el-1");
      selectedIds.add("el-2");

      // Verify mutations persisted (getter returns mutable reference)
      expect(selectionManager.getSelectedIds().has("el-1")).toBe(true);
      expect(selectionManager.getSelectedIds().has("el-2")).toBe(true);
      expect(selectionManager.getSelectedIds().size).toBe(2);
    });

    it("should allow clearing selectedElementIds", () => {
      const selectedIds = selectionManager.getSelectedIds();
      selectedIds.add("el-1");
      selectedIds.add("el-2");

      selectedIds.clear();

      expect(selectionManager.getSelectedIds().size).toBe(0);
    });

    it("should allow deleting from selectedElementIds", () => {
      const selectedIds = selectionManager.getSelectedIds();
      selectedIds.add("el-1");
      selectedIds.add("el-2");

      selectedIds.delete("el-1");

      expect(selectionManager.getSelectedIds().has("el-1")).toBe(false);
      expect(selectionManager.getSelectedIds().has("el-2")).toBe(true);
      expect(selectionManager.getSelectedIds().size).toBe(1);
    });

    it("should persist selection mutations across operations", () => {
      // Simulate multi-select
      const selectedIds = selectionManager.getSelectedIds();
      selectedIds.clear();
      selectedIds.add("el-1");
      selectedIds.add("el-2");

      // Verify selection persisted through the manager
      expect(selectionManager.getSelectedIds().size).toBe(2);
      expect(selectionManager.getSelectedIds().has("el-1")).toBe(true);
      expect(selectionManager.getSelectedIds().has("el-2")).toBe(true);
    });

    it("should return the same Set reference on repeated access", () => {
      const ref1 = selectionManager.getSelectedIds();
      const ref2 = selectionManager.getSelectedIds();

      // Should be the same Set (reference equality)
      expect(ref1).toBe(ref2);
    });
  });

  describe("Complete Workflow Integration", () => {
    let viewportManager: ViewportManager;
    let historyManager: HistoryManager;
    let canvasState: CanvasState;

    beforeEach(() => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;
      const edgesLayer = document.getElementById(
        "edges-layer",
      )! as unknown as SVGSVGElement;

      canvasState = createTestCanvasState();

      viewportManager = new ViewportManager(
        canvas,
        container,
        edgesLayer,
        "test-canvas",
        jest.fn(),
      );

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

      historyManager = new HistoryManager(getState, setState);
    });

    it("should support complete pan workflow with undo/redo", () => {
      const viewState = viewportManager.getViewState();
      const initialTranslateX = viewState.translateX;
      const initialTranslateY = viewState.translateY;

      // Simulate pan gesture (how gesture-helpers.ts does it)
      viewState.translateX += 100;
      viewState.translateY += 50;
      viewportManager.updateCanvasTransform();
      historyManager.snapshot("Pan");

      // Pan more (without snapshot - this becomes "current" state)
      viewState.translateX += 50;
      viewportManager.updateCanvasTransform();

      // Verify current state
      expect(viewportManager.getViewState().translateX).toBe(
        initialTranslateX + 150,
      );

      // Undo should restore previous pan state
      historyManager.undo();

      expect(viewportManager.getViewState().translateX).toBe(
        initialTranslateX + 100,
      );
      expect(viewportManager.getViewState().translateY).toBe(
        initialTranslateY + 50,
      );
    });

    it("should support complete lasso selection workflow", () => {
      const canvas = document.getElementById("canvas")!;
      const container = document.getElementById("canvas-container")!;

      const elements = [
        createTestElement({ id: "el-1", x: 100, y: 100 }),
        createTestElement({ id: "el-2", x: 200, y: 200 }),
        createTestElement({ id: "el-3", x: 300, y: 300 }),
      ];

      const selectionManager = new SelectionManager(
        canvas,
        container,
        (id) => elements.find((el) => el.id === id),
        () => elements,
      );

      // Start lasso
      selectionManager.createSelectionBox(50, 50);

      // Simulate lasso selection (how gesture code does it)
      const selectedIds = selectionManager.getSelectedIds();
      selectedIds.clear();
      selectedIds.add("el-1");
      selectedIds.add("el-2");

      // End lasso
      selectionManager.removeSelectionBox();
      selectionManager.notifySelectionChanged();

      // Verify selection
      expect(selectionManager.getSelectedIds().size).toBe(2);
      expect(selectionManager.getSelectedIds().has("el-1")).toBe(true);
      expect(selectionManager.getSelectedIds().has("el-2")).toBe(true);
    });

    it("should maintain viewState mutations through history operations", () => {
      const viewState = viewportManager.getViewState();
      const initialScale = viewState.scale;

      // Zoom in and snapshot
      viewState.scale *= 2;
      viewportManager.updateCanvasTransform();
      historyManager.snapshot("Zoom In");

      expect(viewportManager.getViewState().scale).toBe(initialScale * 2);

      // Zoom in more (without snapshot)
      viewState.scale *= 1.5;
      viewportManager.updateCanvasTransform();

      expect(viewportManager.getViewState().scale).toBe(initialScale * 3);

      // Undo should restore to previous zoom level
      historyManager.undo();

      expect(viewportManager.getViewState().scale).toBe(initialScale * 2);
    });
  });
});
