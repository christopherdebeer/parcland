/**
 * Core interaction unit tests for gesture machine
 * Testing through pointer adapter to catch interaction bugs and edge cases
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { gestureMachine } from '../src/lib/gesture-machine/gestureMachine';
import { interpret } from 'xstate';

describe('GestureMachine - Core Interactions', () => {
  let service: any;
  let mockController: any;

  beforeEach(() => {
    // Mock CanvasController
    mockController = {
      mode: 'navigate',
      selectedElementIds: new Set(),
      canvasState: { elements: [], edges: [] },
      viewState: { translateX: 0, translateY: 0, scale: 1 },
      MIN_SCALE: 0.1,
      MAX_SCALE: 5,

      // Mock methods
      updateMode: jest.fn(),
      updateModeUI: jest.fn(),
      switchMode: jest.fn((mode: string) => { mockController.mode = mode; }),
      findElementById: jest.fn(),
      requestRender: jest.fn(),
      clearSelection: jest.fn(() => mockController.selectedElementIds.clear()),
      isElementSelected: jest.fn((id: string) => mockController.selectedElementIds.has(id)),
      updateCanvasTransform: jest.fn(),
      screenToCanvas: jest.fn((x: number, y: number) => ({ x, y })),
      updateSelectionBox: jest.fn(),
      removeSelectionBox: jest.fn(),
      updateElementNode: jest.fn(),
      getGroupBBox: jest.fn(() => ({ x1: 0, y1: 0, x2: 100, y2: 100, cx: 50, cy: 50 })),
      saveLocalViewState: jest.fn(),
    };

    // Create service with mock controller in context (XState v4 API)
    service = interpret(
      gestureMachine.withContext({
        controller: mockController,
        pointers: {},
        draft: {}
      })
    ).start();
  });

  describe('Initial State', () => {
    it('should start in navigate mode', () => {
      expect(service.state.matches({ mode: 'navigate' })).toBe(true);
    });

    it('should start in idle gesture state', () => {
      expect(service.state.matches({ gesture: 'idle' })).toBe(true);
    });

    it('should have empty pointers and draft context', () => {
      expect(service.state.context.pointers).toEqual({});
      expect(service.state.context.draft).toEqual({});
    });
  });

  describe('Mode Switching', () => {
    it('should switch from navigate to direct mode on TOGGLE_MODE', () => {
      service.send({ type: 'TOGGLE_MODE' });
      // service.state;
      expect(service.state.matches({ mode: 'direct' })).toBe(true);
    });

    it('should switch from direct to navigate mode on TOGGLE_MODE', () => {
      service.send({ type: 'TOGGLE_MODE' });
      service.send({ type: 'TOGGLE_MODE' });
      // service.state;
      expect(service.state.matches({ mode: 'navigate' })).toBe(true);
    });

    it('should switch to direct mode on Escape key in navigate mode', () => {
      service.send({ type: 'KEYUP', key: 'Escape' });
      // service.state;
      expect(service.state.matches({ mode: 'direct' })).toBe(true);
    });

    it('should switch to navigate mode on Escape key in direct mode', () => {
      service.send({ type: 'TOGGLE_MODE' });
      service.send({ type: 'KEYUP', key: 'Escape' });
      // service.state;
      expect(service.state.matches({ mode: 'navigate' })).toBe(true);
    });
  });

  describe('Single Pointer - Navigate Mode', () => {
    it('should transition to pressPendingNavigate on pointer down in navigate mode', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      // service.state;
      expect(service.state.matches({ gesture: 'pressPendingNavigate' })).toBe(true);
    });

    it('should transition to panCanvas when moving beyond deadzone', () => {
      // Initial pointer down
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      // Move beyond deadzone (>5px)
      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 110, y: 110 },
        active: { 1: { x: 110, y: 110 } }
      });

      // service.state;
      expect(service.state.matches({ gesture: 'panCanvas' })).toBe(true);
    });

    it('should not transition to panCanvas when within deadzone', () => {
      // Initial pointer down
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      // Small move within deadzone (<=5px)
      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 102, y: 102 },
        active: { 1: { x: 102, y: 102 } }
      });

      // service.state;
      expect(service.state.matches({ gesture: 'pressPendingNavigate' })).toBe(true);
    });

    it('should select element on pointer up when hitting element', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1'
      });

      service.send({
        type: 'POINTER_UP',
        xy: { x: 100, y: 100 },
        hitElement: true,
        elementId: 'el-1'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'idle' })).toBe(true);
    });

    it('should clear selection on pointer up when not hitting element', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      service.send({
        type: 'POINTER_UP',
        xy: { x: 100, y: 100 },
        hitElement: false
      });

      expect(mockController.clearSelection).toHaveBeenCalled();
    });
  });

  describe('Single Pointer - Direct Mode', () => {
    beforeEach(() => {
      // Switch to direct mode
      service.send({ type: 'TOGGLE_MODE' });
    });

    it('should transition to lassoSelect on blank pointer down in direct mode', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false,
        handle: null
      });

      // service.state;
      expect(service.state.matches({ gesture: 'lassoSelect' })).toBe(true);
    });

    it('should transition to pressPendingDirect on selected element', () => {
      // Mock selected element
      mockController.selectedElementIds.add('el-1');

      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        selected: new Set(['el-1'])
      });

      // service.state;
      expect(service.state.matches({ gesture: 'pressPendingDirect' })).toBe(true);
    });

    it('should transition to moveGroup when dragging selected element', () => {
      mockController.selectedElementIds.add('el-1');

      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        selected: new Set(['el-1'])
      });

      // Move beyond deadzone
      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 110, y: 110 },
        active: { 1: { x: 110, y: 110 } }
      });

      // service.state;
      expect(service.state.matches({ gesture: 'moveGroup' })).toBe(true);
    });
  });

  describe('Two Pointer Interactions - Pinch', () => {
    it('should transition to pinchCanvas with two pointers', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: {
          1: { x: 100, y: 100 },
          2: { x: 200, y: 200 }
        },
        hitElement: false
      });

      // service.state;
      expect(service.state.matches({ gesture: 'pinchCanvas' })).toBe(true);
    });

    it('should capture initial pinch distance and scale', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: {
          1: { x: 100, y: 100 },
          2: { x: 200, y: 200 }
        },
        hitElement: false,
        view: { scale: 1, translateX: 0, translateY: 0 }
      });

      // service.state;
      expect(service.state.context.draft.startDist).toBeDefined();
      expect(service.state.context.draft.initialScale).toBe(1);
      expect(service.state.context.draft.center).toBeDefined();
    });

    it('should transition from pressPendingNavigate to pinchCanvas on second pointer', () => {
      // First pointer down
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      expect(service.state.matches({ gesture: 'pressPendingNavigate' })).toBe(true);

      // Second pointer down
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 200, y: 200 },
        active: {
          1: { x: 100, y: 100 },
          2: { x: 200, y: 200 }
        },
        hitElement: false,
        view: { scale: 1, translateX: 0, translateY: 0 }
      });

      expect(service.state.matches({ gesture: 'pinchCanvas' })).toBe(true);
    });

    it('should transition from panCanvas to pinchCanvas on second pointer', () => {
      // Start panning
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 110, y: 110 },
        active: { 1: { x: 110, y: 110 } }
      });

      expect(service.state.matches({ gesture: 'panCanvas' })).toBe(true);

      // Add second pointer
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 200, y: 200 },
        active: {
          1: { x: 110, y: 110 },
          2: { x: 200, y: 200 }
        },
        view: { scale: 1, translateX: 0, translateY: 0 }
      });

      expect(service.state.matches({ gesture: 'pinchCanvas' })).toBe(true);
    });
  });

  describe('Handle Interactions', () => {
    beforeEach(() => {
      // Switch to direct mode
      service.send({ type: 'TOGGLE_MODE' });
    });

    it('should transition to resizeElement on resize handle', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        handle: 'resize'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'resizeElement' })).toBe(true);
    });

    it('should transition to scaleElement on scale handle', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        handle: 'scale'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'scaleElement' })).toBe(true);
    });

    it('should transition to rotateElement on rotate handle', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        handle: 'rotate'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'rotateElement' })).toBe(true);
    });

    it('should transition to reorderElement on reorder handle', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        handle: 'reorder'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'reorderElement' })).toBe(true);
    });

    it('should transition to createEdge on edge handle', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        handle: 'edge'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'createEdge' })).toBe(true);
    });

    it('should transition to createNode on createNode handle', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        handle: 'createNode'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'createNode' })).toBe(true);
    });
  });

  describe('Wheel Zoom', () => {
    it('should transition to wheelZoom on WHEEL event', () => {
      service.send({
        type: 'WHEEL',
        xy: { x: 100, y: 100 },
        deltaY: -100
      });

      // service.state;
      expect(service.state.matches({ gesture: 'wheelZoom' })).toBe(true);
    });

    it('should return to idle after wheel zoom timeout', (done) => {
      service.send({
        type: 'WHEEL',
        xy: { x: 100, y: 100 },
        deltaY: -100
      });

      setTimeout(() => {
        // service.state;
        expect(service.state.matches({ gesture: 'idle' })).toBe(true);
        done();
      }, 150); // Timeout is 100ms, adding buffer
    }, 200);
  });

  describe('Double Tap', () => {
    beforeEach(() => {
      // Switch to direct mode
      service.send({ type: 'TOGGLE_MODE' });
    });

    it('should handle double tap on canvas to spawn element', () => {
      service.send({
        type: 'DOUBLE_TAP',
        xy: { x: 100, y: 100 },
        hitElement: false,
        edgeLabel: false
      });

      // service.state;
      expect(service.state.matches({ gesture: 'doubleTapCanvas' })).toBe(true);
    });

    it('should handle double tap on element in navigate mode', () => {
      // Switch back to navigate
      service.send({ type: 'TOGGLE_MODE' });

      service.send({
        type: 'DOUBLE_TAP',
        xy: { x: 100, y: 100 },
        hitElement: true,
        elementId: 'el-1',
        edgeLabel: false
      });

      // service.state;
      expect(service.state.matches({ gesture: 'doubleTapElement' })).toBe(true);
      expect(mockController.switchMode).toHaveBeenCalledWith('direct');
    });

    it('should handle double tap on edge label', () => {
      service.send({
        type: 'DOUBLE_TAP',
        xy: { x: 100, y: 100 },
        hitElement: false,
        edgeLabel: true,
        edgeId: 'edge-1'
      });

      // service.state;
      expect(service.state.matches({ gesture: 'doubleTapEdgeLabel' })).toBe(true);
    });
  });

  describe('Lasso Selection', () => {
    beforeEach(() => {
      // Switch to direct mode
      service.send({ type: 'TOGGLE_MODE' });
    });

    it('should start lasso selection on blank area in direct mode', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false,
        handle: null
      });

      // service.state;
      expect(service.state.matches({ gesture: 'lassoSelect' })).toBe(true);
      expect(service.state.context.draft.start).toEqual({ x: 100, y: 100 });
    });

    it('should update lasso box on pointer move', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false,
        handle: null
      });

      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 200, y: 200 },
        active: { 1: { x: 200, y: 200 } }
      });

      expect(mockController.updateSelectionBox).toHaveBeenCalled();
    });

    it('should cancel lasso and transition to pinch on second pointer', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false,
        handle: null
      });

      expect(service.state.matches({ gesture: 'lassoSelect' })).toBe(true);

      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 200, y: 200 },
        active: {
          1: { x: 100, y: 100 },
          2: { x: 200, y: 200 }
        },
        view: { scale: 1, translateX: 0, translateY: 0 }
      });

      expect(service.state.matches({ gesture: 'pinchCanvas' })).toBe(true);
      expect(mockController.removeSelectionBox).toHaveBeenCalled();
    });
  });

  describe('Group Pinch Gesture', () => {
    beforeEach(() => {
      // Switch to direct mode and select multiple elements
      service.send({ type: 'TOGGLE_MODE' });
      mockController.selectedElementIds.add('el-1');
      mockController.selectedElementIds.add('el-2');

      mockController.findElementById = jest.fn((id: string) => ({
        id,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        scale: 1,
        rotation: 0
      }));
    });

    it('should transition to pinchGroup on two pointers with selected group', () => {
      // Start moving group
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: true,
        elementId: 'el-1',
        selected: new Set(['el-1', 'el-2'])
      });

      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 110, y: 110 },
        active: { 1: { x: 110, y: 110 } }
      });

      expect(service.state.matches({ gesture: 'moveGroup' })).toBe(true);

      // Add second pointer
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 200, y: 200 },
        active: {
          1: { x: 110, y: 110 },
          2: { x: 200, y: 200 }
        },
        hitElement: true,
        elementId: 'el-1',
        selected: new Set(['el-1', 'el-2'])
      });

      expect(service.state.matches({ gesture: 'pinchGroup' })).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid mode switches', () => {
      service.send({ type: 'TOGGLE_MODE' });
      service.send({ type: 'TOGGLE_MODE' });
      service.send({ type: 'TOGGLE_MODE' });

      // service.state;
      expect(service.state.matches({ mode: 'direct' })).toBe(true);
      expect(service.state.matches({ gesture: 'idle' })).toBe(true);
    });

    it('should handle pointer up without prior pointer down', () => {
      expect(() => {
        service.send({
          type: 'POINTER_UP',
          xy: { x: 100, y: 100 },
          hitElement: false
        });
      }).not.toThrow();
    });

    it('should handle pointer move without prior pointer down', () => {
      expect(() => {
        service.send({
          type: 'POINTER_MOVE',
          xy: { x: 100, y: 100 }
        });
      }).not.toThrow();
    });

    it('should handle deadzone edge case (exactly 5px)', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      // Move exactly 5px (at deadzone boundary)
      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 105, y: 100 },
        active: { 1: { x: 105, y: 100 } }
      });

      // Should still be in pressPendingNavigate (deadzone is >5, not >=5)
      // service.state;
      expect(service.state.matches({ gesture: 'pressPendingNavigate' })).toBe(true);
    });

    it('should handle concurrent gesture and mode changes', () => {
      // Start a gesture
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      // Change mode during gesture
      service.send({ type: 'TOGGLE_MODE' });

      // Complete gesture
      service.send({
        type: 'POINTER_UP',
        xy: { x: 100, y: 100 },
        hitElement: false
      });

      // Should be in direct mode and idle
      // service.state;
      expect(service.state.matches({ mode: 'direct' })).toBe(true);
      expect(service.state.matches({ gesture: 'idle' })).toBe(true);
    });

    it('should maintain context data through state transitions', () => {
      service.send({
        type: 'POINTER_DOWN',
        xy: { x: 100, y: 100 },
        active: { 1: { x: 100, y: 100 } },
        hitElement: false
      });

      let snapshot = service.state;
      expect(service.state.context.draft.start).toEqual({ x: 100, y: 100 });

      service.send({
        type: 'POINTER_MOVE',
        xy: { x: 110, y: 110 },
        active: { 1: { x: 110, y: 110 } },
        view: { scale: 1, translateX: 0, translateY: 0 }
      });

      snapshot = service.state;
      expect(service.state.context.draft.start).toEqual({ x: 100, y: 100 });
      expect(service.state.context.draft.view).toBeDefined();
    });
  });
});
