import type { CanvasState, ViewState } from "../types";

/**
 * Snapshot of canvas state for undo/redo operations
 */
interface HistorySnapshot {
  label: string;
  data: {
    canvasState: CanvasState;
    viewState: ViewState;
  };
}

/**
 * Manages undo/redo history for the canvas.
 *
 * Provides:
 * - Snapshot creation and restoration
 * - Undo/redo stack management
 * - Ring buffer with configurable max size
 * - Deep cloning to prevent mutation issues
 */
export class HistoryManager {
  private _undo: HistorySnapshot[] = [];
  private _redo: HistorySnapshot[] = [];
  private _maxHistory: number = 100;
  private getState: () => { canvasState: CanvasState; viewState: ViewState };
  private setState: (state: {
    canvasState: CanvasState;
    viewState: ViewState;
  }) => void;

  /**
   * Creates a new HistoryManager
   *
   * @param getState - Function that returns current canvas and view state
   * @param setState - Function that restores canvas and view state
   * @param maxHistory - Maximum number of history entries to keep (default: 100)
   */
  constructor(
    getState: () => { canvasState: CanvasState; viewState: ViewState },
    setState: (state: {
      canvasState: CanvasState;
      viewState: ViewState;
    }) => void,
    maxHistory: number = 100,
  ) {
    this.getState = getState;
    this.setState = setState;
    this._maxHistory = maxHistory;

    // First entry = pristine state so the user can always go "Back to start"
    this.snapshot("Init");
  }

  /**
   * Undo the last action
   */
  undo(): void {
    this._stepHistory(this._undo, this._redo, "undo");
  }

  /**
   * Redo the last undone action
   */
  redo(): void {
    this._stepHistory(this._redo, this._undo, "redo");
  }

  /**
   * Check if undo is available
   */
  canUndo(): boolean {
    return this._undo.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo(): boolean {
    return this._redo.length > 0;
  }

  /**
   * Create a new snapshot of the current state
   *
   * @param label - Descriptive label for this snapshot
   */
  snapshot(label: string): void {
    const snap = this._createSnapshot(label);
    this._undo.push(snap);

    // Enforce ring buffer size limit
    if (this._undo.length > this._maxHistory) {
      this._undo.shift();
    }

    // Clear redo chain when new action is taken
    this._redo.length = 0;
  }

  /**
   * Get the number of undo steps available
   */
  getUndoCount(): number {
    return this._undo.length;
  }

  /**
   * Get the number of redo steps available
   */
  getRedoCount(): number {
    return this._redo.length;
  }

  /**
   * Clear all history
   */
  clear(): void {
    this._undo.length = 0;
    this._redo.length = 0;
  }

  /**
   * Create a snapshot from current state
   */
  private _createSnapshot(label: string = ""): HistorySnapshot {
    const state = this.getState();
    return {
      label,
      data: structuredClone({
        canvasState: state.canvasState,
        viewState: state.viewState,
      }),
    };
  }

  /**
   * Move through history by swapping stacks
   *
   * The undo stack contains snapshots taken via snapshot() calls.
   * When undoing, we restore the previous snapshot (second from top).
   * When redoing, we restore a snapshot from the redo stack.
   */
  private _stepHistory(
    fromStack: HistorySnapshot[],
    toStack: HistorySnapshot[],
    direction: "undo" | "redo",
  ): void {
    if (fromStack.length === 0) return;

    if (direction === "undo") {
      // Need at least 2 snapshots to undo (current + previous)
      if (fromStack.length < 2) {
        return;
      }

      // Move current snapshot to redo stack
      const currentSnapshot = fromStack.pop()!;
      toStack.push(currentSnapshot);

      // Restore the previous snapshot (now at top of undo stack)
      const previousSnapshot = fromStack[fromStack.length - 1];
      this._restoreSnapshot(previousSnapshot.data);
    } else {
      // Redo: pop from redo stack and restore it
      const snapshotToRestore = fromStack.pop()!;

      // Push it back to undo stack
      toStack.push(snapshotToRestore);

      // Restore the snapshot
      this._restoreSnapshot(snapshotToRestore.data);
    }
  }

  /**
   * Restore a snapshot
   */
  private _restoreSnapshot(data: {
    canvasState: CanvasState;
    viewState: ViewState;
  }): void {
    // Deep clone to prevent mutation issues
    const restoredState = {
      canvasState: structuredClone(data.canvasState),
      viewState: data.viewState, // ViewState can be shallow copied
    };

    this.setState(restoredState);
  }
}
