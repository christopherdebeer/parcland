/* 
 * ---------------------------------------------------------------------------
 * XState finite-state machine describing     (  mode   ×   gesture  )
 * ---------------------------------------------------------------------------
 */
import { createMachine, assign } from 'xstate';
import { buildContextMenu } from './context-menu';

export const gestureMachine = createMachine({

  id: 'canvas',
  preserveActionOrder: true,
  context: {
    pointers: {},
    draft: {}
  },
  type: 'parallel',
  states: {
    mode: {
      initial: 'navigate',
      states: {
        navigate: {
          entry: ['log', 'updateMode'],
          on: {
            TOGGLE_MODE: 'direct',
            KEYUP: { cond: 'keyIsEscape', target: 'direct' }
          }
        },
        direct: {
          entry: ['log', 'updateMode'],
          on: {
            TOGGLE_MODE: 'navigate',
            KEYUP: { cond: 'keyIsEscape', target: 'navigate' }
          }
        }
      }
    },
    gesture: {
      initial: 'idle',
      states: {
        idle: {
          entry: 'log',
          on: {
            POINTER_DOWN: [
              { cond: 'twoPointersPinch', target: 'pinchCanvas', actions: 'capPinch' },
              { cond: 'onePointerBlankNavigate', target: 'panCanvas', actions: ['clearSelection', 'hideContextMenu', 'capPan'] },

              { cond: 'onePointerBlankDirect', target: 'lassoSelect', actions: ['clearSelection', 'hideContextMenu', 'capLasso'] },
              { cond: 'onePointerGroupDirect', target: 'moveGroup', actions: 'capGroupMove' },
              { cond: 'onePointerElementDirect', target: 'moveElement', actions: ['selectElement', 'capMove'] },
              { cond: 'onePointerElementNavigate', target: 'panCanvas', actions: ['selectElement', 'capPan'] },

              { cond: 'handleResize', target: 'resizeElement', actions: 'capResize' },
              { cond: 'handleScale', target: 'scaleElement', actions: 'capScale' },
              { cond: 'handleRotate', target: 'rotateElement', actions: 'capRotate' },
              { cond: 'handleReorder', target: 'reorderElement', actions: 'capReorder' },
              { cond: 'handleType', target: 'typeElement', actions: ['buildContextMenu', 'showContextMenu'] },
              { cond: 'edgeHandleDrag', target: 'createEdge', actions: ['capEdge', 'startTempLine'] },
              { cond: 'createNodeHandleDrag', target: 'createNode', actions: ['capNode', 'startTempLine'] },
              { cond: 'twoPointersGroupDirect', target: 'pinchGroup', actions: ['capGroupPinch'] },
              { cond: 'twoPointersElementDirect', target: 'pinchElement', actions: ['capPinchElement'] },
            ],
            LONG_PRESS : { target:'idle', actions:['buildContextMenu','showContextMenu'] },
            WHEEL: { target: 'wheelZoom' },
            DOUBLE_TAP: [
              { cond: 'doubleTapElementNavigate', target: 'doubleTapElement', actions: ['selectElement', 'switchToDirect'] },
              { cond: 'doubleTapCanvasBlank', target: 'doubleTapCanvas' },
              { cond: 'doubleTapElement', target: 'doubleTapElement', actions: ['selectElement', 'openEditModal'] },
              { cond: 'doubleTapEdgeLabel', target: 'doubleTapEdgeLabel' }
            ]
          }
        },
        panCanvas: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyCanvasPan' },
            POINTER_DOWN: {
              cond: 'twoPointersPinch',
              target: 'pinchCanvas',
              actions: 'capPinch'
            },
            POINTER_UP: {
              target: 'idle',
              actions: 'persistViewState'
            }
          }
        },
        pinchCanvas: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyCanvasPinch' },
            POINTER_UP: { target: 'idle', actions: 'persistViewState' }
          }
        },
        wheelZoom: {
          entry: ['log', 'applyWheelZoom'],
          on: {
            WHEEL: { actions: 'applyWheelZoom' }
          },
          after: {
            100: {
              target: 'idle',
              actions: 'persistViewState'
            }
          }
        },
        lassoSelect: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyLassoUpdate' },
            POINTER_UP: { target: 'idle', actions: 'commitLassoSelection' }
          }
        },
        moveGroup: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyGroupMove' },
            POINTER_DOWN: {
              cond: 'twoPointersGroupDirect',
              target: 'pinchGroup',
              actions: 'capGroupPinch'
            },
            POINTER_UP: {
              target: 'idle',
              actions: 'commitElementMutation'
            }
          }
        },
        pinchGroup: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyGroupPinch' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },
        moveElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyMoveElement' },
            POINTER_DOWN: {
              cond: 'twoPointersElementDirect',
              target: 'pinchElement',
              actions: 'capPinchElement'
            },
            POINTER_UP: {
              target: 'idle',
              actions: 'commitElementMutation'
            }
          }
        },
        resizeElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyResizeElement' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },
        scaleElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyScaleElement' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },
        rotateElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyRotateElement' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },
        reorderElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyReorderElement' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },
        typeElement: {
          entry: 'log',
          on: {
            POINTER_UP: { target: 'idle' }
          }
        },
        pinchElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyPinchElement' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },
        createEdge: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyEdgeDrag' },
            POINTER_UP: { target: 'idle', actions: 'commitEdgeCreation' }
          }
        },
        createNode: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyEdgeDrag' },
            POINTER_UP: { target: 'idle', actions: 'commitNodeCreation' }
          }
        },
        doubleTapCanvas: { entry: ['log', 'spawnNewElementAtTap', 'switchToDirect'], after: { 100: 'idle' } },
        doubleTapElement: { entry: 'log', after: { 100: 'idle' } },
        doubleTapEdgeLabel: { entry: ['log', 'editEdgeLabel'], after: { 100: 'idle' } },

        /* fallback (keep XState happy) */
        '*': {}
      }
    }
  }
},
  {
    guards: {
      isNavigate: (_c, _e, { state }) => state.matches('mode.navigate'),
      isDirect: (_c, _e, { state }) => state.matches('mode.direct'),
      //twoPointersNavigate: (_c, e, p) => Object.keys(e.active || {}).length === 2 && p.state.matches('mode.navigate'),
      twoPointersPinch: (_c,e)=>Object.keys(e.active||{}).length===2,
      onePointerBlankNavigate: (_c, e, p) => Object.keys(e.active || {}).length === 1 && !e.hitElement && p.state.matches('mode.navigate'),
      onePointerElementNavigate: (_c, e, p) => Object.keys(e.active || {}).length === 1 && e.hitElement && !e.groupSelected && p.state.matches('mode.navigate'),

      onePointerBlankDirect: (_c, e, p) => Object.keys(e.active || {}).length === 1 && !e.hitElement && !e.handle && p.state.matches('mode.direct'),
      onePointerElementDirect: (_c, e, p) => Object.keys(e.active || {}).length === 1 && e.hitElement && !e.handle && !e.groupSelected && p.state.matches('mode.direct'),
      onePointerGroupDirect: (_c, e, p) => Object.keys(e.active || {}).length === 1 && e.groupSelected && !e.handle && p.state.matches('mode.direct'),

      twoPointersGroupDirect: (_c, e, p) => Object.keys(e.active || {}).length === 2 && e.groupSelected && p.state.matches('mode.direct'),
      twoPointersElementDirect: (_c, e, p) => Object.keys(e.active || {}).length === 2 && e.hitElement && !e.groupSelected && p.state.matches('mode.direct'),

      handleResize: (_c, e) => e.handle === 'resize',
      handleScale: (_c, e) => e.handle === 'scale',
      handleRotate: (_c, e) => e.handle === 'rotate',
      handleReorder: (_c, e) => e.handle === 'reorder',
      handleType: (_c, e) => e.handle === 'type',

      edgeHandleDrag: (_c, e) => e.handle === 'edge',
      createNodeHandleDrag: (_c, e) => e.handle === 'createNode',

      doubleTapElementNavigate: (_c, e, p) => e.hitElement && p.state.matches('mode.navigate'),
      doubleTapCanvasBlank: (_c, e) => !e.hitElement && !e.edgeLabel,
      doubleTapElement: (_c, e) => e.hitElement && !e.edgeLabel,
      doubleTapEdgeLabel: (_c, e) => e.edgeLabel,

      keyIsEscape: (_c, e) => {
        const isEscape = e.key === 'Escape';
        console.log("[FSM] Guard keyIsEscape", isEscape);
        return isEscape;
      },
    },

    actions: {
      log: (c, e, meta) => console.log('[FSM]', `${meta.state.value.mode}:${meta.state.value.gesture}`, { c, e, meta }),
      capPan: assign({ draft: (_c, e) => ({ start: e.xy, view: e.view }) }),
      capPinch: assign({
        draft: (_c, e) => {
          // 1. Get the active pointer coordinates as an array of {x, y} objects.
          //    Handle the case where e.active might be null/undefined briefly.
          const points = Object.values(e.active || {});

          // 2. Ensure we actually have two points before proceeding. This prevents errors
          //    if the event somehow triggers with fewer than two active pointers.
          if (points.length < 2) {
            console.error("capPinch called with less than 2 active pointers:", points);
            // Return an empty object or the existing draft to avoid further errors.
            // Returning an empty object might trigger checks in subsequent actions.
            return {};
          }

          // 3. Use the *array elements* (points[0], points[1]) for calculations.
          //    Destructure the first two points from the array.
          const [p1, p2] = points;

          // 4. Calculate the starting distance between the two points.
          const startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

          // 5. Calculate the starting center point (midpoint) on the screen.
          const centerX = (p1.x + p2.x) / 2;
          const centerY = (p1.y + p2.y) / 2;

          return {
            points: points,
            startDist: startDist,
            initialScale: e.view.scale,
            center: { x: centerX, y: centerY }
          };
        }
      }),

      capLasso: assign({ draft: (_c, e) => ({ start: e.xy }) }),
      capMove: assign({
        draft: (c, e) => {
          const el = c.controller.findElementById(e.elementId);
          if (!el) {
            console.error("capMove: Element not found!", e.elementId);
            return { origin: e.xy, id: e.elementId, startPos: { x: NaN, y: NaN } };
          }
          return {
            origin: e.xy,
            id: e.elementId,
            startPos: { x: el.x, y: el.y }
          };
        }
      }),

      capGroupMove: assign({
        draft: (_c, e, { state }) => {
          const ids = [...state.context.controller.selectedElementIds];
          const start = new Map();
          ids.forEach(id => {
            const el = state.context.controller.findElementById(id);
            start.set(id, { x: el.x, y: el.y });
          });
          return { origin: e.xy, startPositions: start };
        }
      }),

      capResize: assign({
        draft: (c, e) => {
          const el = c.controller.findElementById(e.elementId);
          if (!el) return { resize: { startX: e.xy.x, startY: e.xy.y, startW: NaN, startH: NaN } };
          return {
            resize: {
              startX: e.xy.x,
              startY: e.xy.y,
              startW: el.width,
              startH: el.height
            },
            id: e.elementId
          };
        }
      }),

      capScale: assign({
        draft: (c, e) => {
          const el = c.controller.findElementById(e.elementId);
          if (!el) return { origin: e.xy, id: e.elementId, startScale: 1 };
          return {
            origin: e.xy,
            id: e.elementId,
            startScale: el.scale || 1
          };
        }
      }),

      capRotate: assign({
        draft: (c, e) => {
          const el = c.controller.findElementById(e.elementId);
          if (!el) return { rotate: { startScreen: e.xy, center: null, startRotation: NaN }, id: e.elementId };
          return {
            rotate: {
              startScreen: e.xy,
              center: {
                x: el.x + (el.width * (el.scale || 1)) / 2,
                y: el.y + (el.height * (el.scale || 1)) / 2
              },
              startRotation: el.rotation || 0
            },
            id: e.elementId
          };
        }
      }),
      capGroupPinch: assign({
        draft: (_c, e, { state }) => {
          const ids = [...state.context.controller.selectedElementIds];
          const start = new Map();
          ids.forEach(id => {
            const el = state.context.controller.findElementById(id);
            start.set(id, {
              width: el.width, height: el.height,
              x: el.x, y: el.y,
              scale: el.scale || 1, // Store initial scale
              rotation: el.rotation||0,
            });
          });
          const pts = Object.values(e.active || {});
          return {
            startAngle : Math.atan2(pts[1].y-pts[0].y, pts[1].x-pts[0].x),
            startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
            startPositions: start,
            bboxCenter: state.context.controller.getGroupBBox()
          };
        }
      }),
      capPinchElement: assign({
        draft: (c, e) => {
          const el = c.controller.findElementById(e.elementId);
          const pts = Object.values(e.active || {});
          return {
            id: e.elementId,
            center: { x: el.x, y: el.y },
            startCx: el.x, startCy: el.y,
            startW: el.width, startH: el.height,
            startScale: el.scale || 1,
            startRotation: el.rotation || 0,
            startDist: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y),
            startAngle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x)
          };
        }
      }),

      updateMode: (c, _e, meta) => {
        console.log("[FSM] action updateMode", );
        c.controller.mode = meta.state.matches('mode.direct') ? 'direct' : 'navigate';
        c.controller.updateModeUI();
      },

      switchToDirect: (c, _e, meta) => {
        console.log("[FSM] action switchToDirect", meta.state.matches('mode.navigate') )
        if (meta.state.matches('mode.navigate')) {
          c.controller.switchMode('direct');
        }
      },

      capReorder: assign({ draft: (_c, e) => ({ origin: e.xy, id: e.elementId }) }),
      capEdge: assign({ draft: (_c, e) => ({ start: e.xy, sourceId: e.elementId }) }),
      capNode: assign({ draft: (_c, e) => ({ start: e.xy, sourceId: e.elementId }) })
    }
  });
