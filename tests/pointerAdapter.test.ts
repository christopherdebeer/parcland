/**
 * Pointer Adapter unit tests
 * Testing DOM event handling and transformation to FSM events
 */
import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { installPointerAdapter } from '../src/lib/gesture-machine/pointerAdapter';

describe('PointerAdapter - Event Translation', () => {
  let rootEl: HTMLElement;
  let service: any;
  let getViewState: any;
  let selected: any;
  let cleanup: () => void;
  let sentEvents: any[];

  beforeEach(() => {
    // Create root element
    rootEl = document.createElement('div');
    rootEl.id = 'canvas-root';
    document.body.appendChild(rootEl);

    // Track sent events
    sentEvents = [];

    // Mock service
    service = {
      send: jest.fn((event: any) => {
        sentEvents.push(event);
      }),
      state: {
        context: {
          controller: {
            undo: jest.fn(),
            redo: jest.fn()
          }
        }
      }
    };

    // Mock view state
    getViewState = jest.fn(() => ({
      scale: 1,
      translateX: 0,
      translateY: 0
    }));

    // Mock selection
    selected = jest.fn(() => new Set());

    // Install adapter
    cleanup = installPointerAdapter(rootEl, service, getViewState, selected);
  });

  afterEach(() => {
    cleanup();
    document.body.removeChild(rootEl);
    sentEvents = [];
  });

  describe('Single Pointer Events', () => {
    it('should translate pointerdown to POINTER_DOWN FSM event', () => {
      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 200,
        bubbles: true
      });

      rootEl.dispatchEvent(event);

      expect(service.send).toHaveBeenCalled();
      const sentEvent = sentEvents[0];
      expect(sentEvent.type).toBe('POINTER_DOWN');
      expect(sentEvent.xy).toEqual({ x: 100, y: 200 });
      expect(sentEvent.active).toHaveProperty('1');
    });

    it('should translate pointermove to POINTER_MOVE FSM event', () => {
      // First pointer down to activate
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(downEvent);

      sentEvents = [];

      // Then pointer move
      const moveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 150,
        clientY: 150,
        bubbles: true
      });
      rootEl.dispatchEvent(moveEvent);

      const sentEvent = sentEvents[0];
      expect(sentEvent.type).toBe('POINTER_MOVE');
      expect(sentEvent.xy).toEqual({ x: 150, y: 150 });
    });

    it('should translate pointerup to POINTER_UP FSM event', () => {
      // First pointer down
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(downEvent);

      sentEvents = [];

      // Then pointer up
      const upEvent = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(upEvent);

      const sentEvent = sentEvents[0];
      expect(sentEvent.type).toBe('POINTER_UP');
      expect(sentEvent.xy).toEqual({ x: 100, y: 100 });
    });

    it('should ignore pointermove without prior pointerdown', () => {
      const moveEvent = new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(moveEvent);

      expect(service.send).not.toHaveBeenCalled();
    });
  });

  describe('Multi-pointer Events', () => {
    it('should track multiple active pointers', () => {
      // First pointer down
      const down1 = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(down1);

      // Second pointer down
      const down2 = new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
        bubbles: true
      });
      rootEl.dispatchEvent(down2);

      const lastEvent = sentEvents[sentEvents.length - 1];
      expect(Object.keys(lastEvent.active)).toHaveLength(2);
      expect(lastEvent.active['1']).toEqual({ x: 100, y: 100 });
      expect(lastEvent.active['2']).toEqual({ x: 200, y: 200 });
    });

    it('should update active pointers on move', () => {
      // Two pointers down
      rootEl.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      }));

      rootEl.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
        bubbles: true
      }));

      sentEvents = [];

      // Move first pointer
      rootEl.dispatchEvent(new PointerEvent('pointermove', {
        pointerId: 1,
        clientX: 150,
        clientY: 150,
        bubbles: true
      }));

      const lastEvent = sentEvents[sentEvents.length - 1];
      expect(lastEvent.active['1']).toEqual({ x: 150, y: 150 });
      expect(lastEvent.active['2']).toEqual({ x: 200, y: 200 });
    });

    it('should remove pointer from active on pointerup', () => {
      // Two pointers down
      rootEl.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      }));

      rootEl.dispatchEvent(new PointerEvent('pointerdown', {
        pointerId: 2,
        clientX: 200,
        clientY: 200,
        bubbles: true
      }));

      // Lift first pointer
      rootEl.dispatchEvent(new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      }));

      const lastEvent = sentEvents[sentEvents.length - 1];
      expect(Object.keys(lastEvent.active)).toHaveLength(1);
      expect(lastEvent.active['2']).toEqual({ x: 200, y: 200 });
    });
  });

  describe('Element Hit Detection', () => {
    let canvasElement: HTMLElement;

    beforeEach(() => {
      canvasElement = document.createElement('div');
      canvasElement.className = 'canvas-element';
      canvasElement.dataset.elId = 'el-1';
      canvasElement.style.position = 'absolute';
      canvasElement.style.left = '50px';
      canvasElement.style.top = '50px';
      canvasElement.style.width = '100px';
      canvasElement.style.height = '100px';
      rootEl.appendChild(canvasElement);
    });

    it('should detect hits on canvas elements', () => {
      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      Object.defineProperty(event, 'target', {
        value: canvasElement,
        configurable: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.hitElement).toBe(true);
      expect(sentEvent.elementId).toBe('el-1');
    });

    it('should not detect hits on blank canvas', () => {
      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 300,
        clientY: 300,
        bubbles: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.hitElement).toBe(false);
      expect(sentEvent.elementId).toBeNull();
    });
  });

  describe('Handle Classification', () => {
    it('should classify resize handle', () => {
      const handle = document.createElement('div');
      handle.className = 'element-handle resize-handle';
      rootEl.appendChild(handle);

      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      Object.defineProperty(event, 'target', {
        value: handle,
        configurable: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.handle).toBe('resize');
    });

    it('should classify scale handle', () => {
      const handle = document.createElement('div');
      handle.className = 'element-handle scale-handle';
      rootEl.appendChild(handle);

      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      Object.defineProperty(event, 'target', {
        value: handle,
        configurable: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.handle).toBe('scale');
    });

    it('should classify rotate handle', () => {
      const handle = document.createElement('div');
      handle.className = 'element-handle rotate-handle';
      rootEl.appendChild(handle);

      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      Object.defineProperty(event, 'target', {
        value: handle,
        configurable: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.handle).toBe('rotate');
    });

    it('should classify edge handle', () => {
      const handle = document.createElement('div');
      handle.className = 'element-handle edge-handle';
      rootEl.appendChild(handle);

      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      Object.defineProperty(event, 'target', {
        value: handle,
        configurable: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.handle).toBe('edge');
    });

    it('should return null for non-handle elements', () => {
      const div = document.createElement('div');
      rootEl.appendChild(div);

      const event = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      Object.defineProperty(event, 'target', {
        value: div,
        configurable: true
      });

      rootEl.dispatchEvent(event);

      const sentEvent = sentEvents[0];
      expect(sentEvent.handle).toBeNull();
    });
  });

  describe('Double Tap Detection', () => {
    it('should detect double tap within time and distance threshold', (done) => {
      // First tap
      const down1 = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        button: 0
      });
      rootEl.dispatchEvent(down1);

      const up1 = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        button: 0
      });
      rootEl.dispatchEvent(up1);

      // Second tap (within 300ms and 10px)
      setTimeout(() => {
        const down2 = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 105,
          clientY: 105,
          bubbles: true,
          button: 0
        });
        rootEl.dispatchEvent(down2);

        const up2 = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 105,
          clientY: 105,
          bubbles: true,
          button: 0
        });
        rootEl.dispatchEvent(up2);

        const doubleTapEvent = sentEvents.find((e: any) => e.type === 'DOUBLE_TAP');
        expect(doubleTapEvent).toBeDefined();
        done();
      }, 100);
    }, 1000);

    it('should not detect double tap beyond distance threshold', (done) => {
      // First tap
      const down1 = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        button: 0
      });
      rootEl.dispatchEvent(down1);

      const up1 = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        button: 0
      });
      rootEl.dispatchEvent(up1);

      // Second tap (too far - >10px)
      setTimeout(() => {
        const down2 = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 120,
          clientY: 120,
          bubbles: true,
          button: 0
        });
        rootEl.dispatchEvent(down2);

        const up2 = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 120,
          clientY: 120,
          bubbles: true,
          button: 0
        });
        rootEl.dispatchEvent(up2);

        const doubleTapEvent = sentEvents.find((e: any) => e.type === 'DOUBLE_TAP');
        expect(doubleTapEvent).toBeUndefined();
        done();
      }, 100);
    }, 1000);

    it('should not detect double tap beyond time threshold', (done) => {
      // First tap
      const down1 = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        button: 0
      });
      rootEl.dispatchEvent(down1);

      const up1 = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true,
        button: 0
      });
      rootEl.dispatchEvent(up1);

      // Second tap (too late - >300ms)
      setTimeout(() => {
        const down2 = new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 105,
          clientY: 105,
          bubbles: true,
          button: 0
        });
        rootEl.dispatchEvent(down2);

        const up2 = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 105,
          clientY: 105,
          bubbles: true,
          button: 0
        });
        rootEl.dispatchEvent(up2);

        const doubleTapEvent = sentEvents.find((e: any) => e.type === 'DOUBLE_TAP');
        expect(doubleTapEvent).toBeUndefined();
        done();
      }, 350);
    }, 1000);
  });

  describe('Long Press Detection', () => {
    it('should detect long press after 600ms', (done) => {
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(downEvent);

      setTimeout(() => {
        const longPressEvent = sentEvents.find((e: any) => e.type === 'LONG_PRESS');
        expect(longPressEvent).toBeDefined();
        done();
      }, 650);
    }, 1000);

    it('should cancel long press on pointer move', (done) => {
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(downEvent);

      // Move before long press triggers
      setTimeout(() => {
        const moveEvent = new PointerEvent('pointermove', {
          pointerId: 1,
          clientX: 110,
          clientY: 110,
          bubbles: true
        });
        rootEl.dispatchEvent(moveEvent);

        // Wait for long press time
        setTimeout(() => {
          const longPressEvent = sentEvents.find((e: any) => e.type === 'LONG_PRESS');
          expect(longPressEvent).toBeUndefined();
          done();
        }, 600);
      }, 100);
    }, 1000);

    it('should cancel long press on pointer up', (done) => {
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(downEvent);

      // Lift before long press triggers
      setTimeout(() => {
        const upEvent = new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 100,
          clientY: 100,
          bubbles: true
        });
        rootEl.dispatchEvent(upEvent);

        // Wait for long press time
        setTimeout(() => {
          const longPressEvent = sentEvents.find((e: any) => e.type === 'LONG_PRESS');
          expect(longPressEvent).toBeUndefined();
          done();
        }, 600);
      }, 100);
    }, 1000);
  });

  describe('Wheel Events', () => {
    it('should translate wheel events to WHEEL FSM events', () => {
      const wheelEvent = new WheelEvent('wheel', {
        deltaY: -100,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(wheelEvent);

      expect(service.send).toHaveBeenCalled();
      const sentEvent = sentEvents[0];
      expect(sentEvent.type).toBe('WHEEL');
      expect(sentEvent.deltaY).toBe(-100);
    });
  });

  describe('Keyboard Events', () => {
    it('should translate keyup events to KEYUP FSM events', () => {
      const keyEvent = new KeyboardEvent('keyup', {
        key: 'Escape',
        bubbles: true
      });

      // Mock target for keyboard events
      Object.defineProperty(keyEvent, 'target', {
        value: rootEl,
        configurable: true
      });

      window.dispatchEvent(keyEvent);

      expect(service.send).toHaveBeenCalled();
      const sentEvent = sentEvents.find((e: any) => e.type === 'KEYUP');
      expect(sentEvent).toBeDefined();
      expect(sentEvent.key).toBe('Escape');
    });

    it('should handle undo keyboard shortcut (Ctrl+Z)', () => {
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true
      });

      Object.defineProperty(keyEvent, 'target', {
        value: rootEl,
        configurable: true
      });

      window.dispatchEvent(keyEvent);

      expect(service.state.context.controller.undo).toHaveBeenCalled();
    });

    it('should handle redo keyboard shortcut (Ctrl+Shift+Z)', () => {
      const keyEvent = new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true
      });

      Object.defineProperty(keyEvent, 'target', {
        value: rootEl,
        configurable: true
      });

      window.dispatchEvent(keyEvent);

      expect(service.state.context.controller.redo).toHaveBeenCalled();
    });
  });

  describe('Pointer Capture', () => {
    it('should set pointer capture on pointer down', () => {
      const setPointerCaptureSpy = jest.spyOn(rootEl, 'setPointerCapture');

      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(downEvent);

      expect(setPointerCaptureSpy).toHaveBeenCalledWith(1);
    });

    it('should release pointer capture on pointer up', () => {
      const releasePointerCaptureSpy = jest.spyOn(rootEl, 'releasePointerCapture');

      // Down first
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(downEvent);

      // Then up
      const upEvent = new PointerEvent('pointerup', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(upEvent);

      expect(releasePointerCaptureSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle pointercancel like pointerup', () => {
      // Down first
      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(downEvent);

      sentEvents = [];

      // Cancel
      const cancelEvent = new PointerEvent('pointercancel', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });
      rootEl.dispatchEvent(cancelEvent);

      const sentEvent = sentEvents[0];
      expect(sentEvent.type).toBe('POINTER_UP');
    });

    it('should handle rapid pointer events', () => {
      // Rapid down/up/down/up
      for (let i = 0; i < 10; i++) {
        rootEl.dispatchEvent(new PointerEvent('pointerdown', {
          pointerId: 1,
          clientX: 100 + i,
          clientY: 100 + i,
          bubbles: true
        }));

        rootEl.dispatchEvent(new PointerEvent('pointerup', {
          pointerId: 1,
          clientX: 100 + i,
          clientY: 100 + i,
          bubbles: true
        }));
      }

      expect(service.send).toHaveBeenCalled();
      expect(sentEvents.length).toBeGreaterThan(0);
    });

    it('should cleanup event listeners on teardown', () => {
      const removeEventListenerSpy = jest.spyOn(rootEl, 'removeEventListener');
      const windowRemoveSpy = jest.spyOn(window, 'removeEventListener');

      cleanup();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointermove', expect.any(Function));
      expect(removeEventListenerSpy).toHaveBeenCalledWith('pointerup', expect.any(Function));
      expect(windowRemoveSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
      expect(windowRemoveSpy).toHaveBeenCalledWith('keyup', expect.any(Function));
    });
  });

  describe('View State Integration', () => {
    it('should include view state in events', () => {
      getViewState.mockReturnValue({
        scale: 1.5,
        translateX: 100,
        translateY: 200
      });

      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(downEvent);

      const sentEvent = sentEvents[0];
      expect(sentEvent.view).toEqual({
        scale: 1.5,
        translateX: 100,
        translateY: 200
      });
    });
  });

  describe('Selection Integration', () => {
    it('should include selection state in events', () => {
      const selectedSet = new Set(['el-1', 'el-2']);
      selected.mockReturnValue(selectedSet);

      const downEvent = new PointerEvent('pointerdown', {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
        bubbles: true
      });

      rootEl.dispatchEvent(downEvent);

      const sentEvent = sentEvents[0];
      expect(sentEvent.selected).toBe(selectedSet);
    });
  });
});
