/**
 * Tests for the gesture machine
 */
import { createMachine, interpret } from 'xstate';
import { gestureMachine } from './gestureMachine';

// Mock controller for testing
const createMockController = () => ({
  mode: 'navigate',
  viewState: { scale: 1, translateX: 0, translateY: 0 },
  selectedElementIds: new Set(),
  updateModeUI: jest.fn(),
  switchMode: jest.fn(),
  requestRender: jest.fn(),
  findElementById: jest.fn(),
  updateElementNode: jest.fn(),
  updateCanvasTransform: jest.fn(),
  saveLocalViewState: jest.fn(),
  updateSelectionBox: jest.fn(),
  removeSelectionBox: jest.fn(),
  clearSelection: jest.fn(),
  isElementSelected: jest.fn().mockReturnValue(false),
  elementNodesMap: {},
  canvasState: { elements: [] },
  _pushHistorySnapshot: jest.fn(),
  screenToCanvas: jest.fn().mockImplementation((x, y) => ({ x, y })),
  getGroupBBox: jest.fn().mockReturnValue({ cx: 100, cy: 100 }),
  edgesLayer: { appendChild: jest.fn() },
  createNewEdge: jest.fn(),
  createNewElement: jest.fn(),
  buildContextMenu: jest.fn(),
  showContextMenu: jest.fn(),
  hideContextMenu: jest.fn(),
  openEditModal: jest.fn(),
});

describe('Gesture Machine', () => {
  let service;
  let mockController;

  beforeEach(() => {
    mockController = createMockController();
    
    // Create a test machine with mocked actions
    const testMachine = gestureMachine.withContext({
      pointers: {},
      draft: {},
      controller: mockController
    });
    
    service = interpret(testMachine).start();
  });

  afterEach(() => {
    service.stop();
  });

  test('initial state should be navigate:idle', () => {
    expect(service.state.matches({ mode: 'navigate', gesture: 'idle' })).toBe(true);
  });

  test('TOGGLE_MODE should switch between navigate and direct modes', () => {
    // Start in navigate mode
    expect(service.state.matches({ mode: 'navigate' })).toBe(true);
    
    // Switch to direct mode
    service.send({ type: 'TOGGLE_MODE' });
    expect(service.state.matches({ mode: 'direct' })).toBe(true);
    expect(mockController.updateModeUI).toHaveBeenCalled();
    
    // Switch back to navigate mode
    service.send({ type: 'TOGGLE_MODE' });
    expect(service.state.matches({ mode: 'navigate' })).toBe(true);
    expect(mockController.updateModeUI).toHaveBeenCalledTimes(2);
  });

  test('ESC key should switch from direct to navigate mode', () => {
    // First switch to direct mode
    service.send({ type: 'TOGGLE_MODE' });
    expect(service.state.matches({ mode: 'direct' })).toBe(true);
    
    // Press ESC key
    service.send({ type: 'KEYUP', key: 'Escape' });
    expect(service.state.matches({ mode: 'navigate' })).toBe(true);
  });

  test('POINTER_DOWN on blank canvas in direct mode should start lassoSelect', () => {
    // Switch to direct mode
    service.send({ type: 'TOGGLE_MODE' });
    
    // Pointer down on blank canvas
    service.send({ 
      type: 'POINTER_DOWN', 
      xy: { x: 100, y: 100 }, 
      active: { '1': { x: 100, y: 100 } },
      hitElement: false,
      handle: null
    });
    
    expect(service.state.matches({ mode: 'direct', gesture: 'lassoSelect' })).toBe(true);
  });

  test('POINTER_DOWN on element in direct mode should start pressPendingDirect when element is selected', () => {
    // Switch to direct mode
    service.send({ type: 'TOGGLE_MODE' });
    
    // Mock element selection
    mockController.isElementSelected.mockReturnValue(true);
    mockController.selectedElementIds = new Set(['element1']);
    
    // Pointer down on selected element
    service.send({ 
      type: 'POINTER_DOWN', 
      xy: { x: 100, y: 100 }, 
      active: { '1': { x: 100, y: 100 } },
      hitElement: true,
      elementId: 'element1',
      handle: null,
      selected: new Set(['element1'])
    });
    
    expect(service.state.matches({ mode: 'direct', gesture: 'pressPendingDirect' })).toBe(true);
  });

  test('POINTER_DOWN on resize handle should start resizeElement', () => {
    // Switch to direct mode
    service.send({ type: 'TOGGLE_MODE' });
    
    // Mock element
    mockController.findElementById.mockReturnValue({ id: 'element1', x: 100, y: 100, width: 200, height: 150 });
    
    // Pointer down on resize handle
    service.send({ 
      type: 'POINTER_DOWN', 
      xy: { x: 300, y: 100 }, 
      active: { '1': { x: 300, y: 100 } },
      hitElement: true,
      elementId: 'element1',
      handle: 'resize'
    });
    
    expect(service.state.matches({ mode: 'direct', gesture: 'resizeElement' })).toBe(true);
  });

  test('POINTER_DOWN with two pointers should start pinchCanvas', () => {
    // Pointer down with two pointers
    service.send({ 
      type: 'POINTER_DOWN', 
      xy: { x: 100, y: 100 }, 
      active: { 
        '1': { x: 100, y: 100 },
        '2': { x: 200, y: 200 }
      },
      view: { scale: 1, translateX: 0, translateY: 0 }
    });
    
    expect(service.state.matches({ gesture: 'pinchCanvas' })).toBe(true);
  });

  test('DOUBLE_TAP on canvas should create new element and switch to direct mode', () => {
    // Double tap on canvas
    service.send({ 
      type: 'DOUBLE_TAP', 
      xy: { x: 100, y: 100 },
      hitElement: false,
      edgeLabel: false
    });
    
    expect(service.state.matches({ gesture: 'doubleTapCanvas' })).toBe(true);
    expect(mockController.createNewElement).toHaveBeenCalled();
    expect(mockController.switchMode).toHaveBeenCalledWith('direct');
  });

  test('LONG_PRESS should show context menu', () => {
    // Long press
    service.send({ 
      type: 'LONG_PRESS', 
      xy: { x: 100, y: 100 },
      hitElement: true,
      elementId: 'element1'
    });
    
    expect(mockController.buildContextMenu).toHaveBeenCalled();
    expect(mockController.showContextMenu).toHaveBeenCalled();
  });

  test('ESC key should cancel edge creation', () => {
    // Switch to direct mode
    service.send({ type: 'TOGGLE_MODE' });
    
    // Mock element and edge handle
    mockController.findElementById.mockReturnValue({ id: 'element1', x: 100, y: 100 });
    
    // Start edge creation
    service.send({ 
      type: 'POINTER_DOWN', 
      xy: { x: 100, y: 100 }, 
      active: { '1': { x: 100, y: 100 } },
      hitElement: true,
      elementId: 'element1',
      handle: 'edge'
    });
    
    expect(service.state.matches({ mode: 'direct', gesture: 'createEdge' })).toBe(true);
    
    // Press ESC key
    service.send({ type: 'KEYUP', key: 'Escape' });
    expect(service.state.matches({ mode: 'direct', gesture: 'idle' })).toBe(true);
  });

  test('pinchCanvas should transition to panCanvas when one pointer remains', () => {
    // Start with two pointers in pinchCanvas
    service.send({ 
      type: 'POINTER_DOWN', 
      xy: { x: 100, y: 100 }, 
      active: { 
        '1': { x: 100, y: 100 },
        '2': { x: 200, y: 200 }
      },
      view: { scale: 1, translateX: 0, translateY: 0 }
    });
    
    expect(service.state.matches({ gesture: 'pinchCanvas' })).toBe(true);
    
    // One pointer up, leaving one active
    service.send({ 
      type: 'POINTER_UP', 
      xy: { x: 200, y: 200 }, 
      active: { '1': { x: 100, y: 100 } },
      view: { scale: 1, translateX: 0, translateY: 0 }
    });
    
    expect(service.state.matches({ gesture: 'panCanvas' })).toBe(true);
  });
});