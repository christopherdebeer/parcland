/* ---------------------------------------------------------------------------
 * XState finite-state machine describing     (  mode   ×   gesture  )
 * ---------------------------------------------------------------------------
 * Pure data – the only side-effect is console.log() in state *entry*
 * ---------------------------------------------------------------------------
 */
import { createMachine, assign } from 'xstate';

export const gestureMachine = createMachine({

  id: 'canvas',
  preserveActionOrder: true,

  /* --------------------------------------------------------------------- */
  context: {
    pointers: {},   // { [pointerId]:{x,y} }
    draft: {}    // scratch data captured in entry-actions
  },

  /* --------------------------------------------------------------------- */
  type: 'parallel',
  states: {

    /* ------------------------- 1. HIGH-LEVEL MODE ---------------------- */
    mode: {
      initial: 'navigate',
      states: {
        navigate: { on: { TOGGLE_MODE: 'direct' } },
        direct: { on: { TOGGLE_MODE: 'navigate' } }
      }
    },

    /* ----------------------------- 2. GESTURE -------------------------- */
    gesture: {
      initial: 'idle',
      states: {

        /*  idle – waiting for first contact  ---------------------------- */
        idle: {
          entry: 'log',

          on: {
            /* ---------------- POINTER DOWN ---------------------------- */
            POINTER_DOWN: [
              /* canvas navigation */
              { cond: 'twoPointersNavigate', target: 'pinchCanvas', actions: 'capPinch' },
              { cond: 'onePointerBlankNavigate', target: 'panCanvas', actions: 'capPan' },

              /* direct-mode blank press / group / element moves */
              { cond: 'onePointerBlankDirect', target: 'lassoSelect', actions: ['clearSelection','capLasso'] },
              { cond: 'onePointerGroupDirect', target: 'moveGroup', actions: 'capGroupMove' },
              { cond: 'onePointerElementDirect', target: 'moveElement', actions: ['selectElement', 'capMove'] },
              { cond: 'onePointerElementNavigate', target: 'panCanvas', actions: ['selectElement', 'capPan'] },

              /* element handles */
              { cond: 'handleResize', target: 'resizeElement', actions: 'capResize' },
              { cond: 'handleScale', target: 'scaleElement', actions: 'capScale' },
              { cond: 'handleRotate', target: 'rotateElement', actions: 'capRotate' },
              { cond: 'handleReorder', target: 'reorderElement', actions: 'capReorder' },

{ cond:'edgeHandleDrag',         target:'createEdge',
  actions:['capEdge','startTempLine'] },

{ cond:'createNodeHandleDrag',   target:'createNode',
  actions:['capNode','startTempLine'] },

              /* direct-mode, group selected, two touches → pinchGroup ------------------- */
{ cond:'twoPointersGroupDirect', target:'pinchGroup',
  actions:['capGroupPinch'] },

              { cond:'twoPointersElementDirect', target:'pinchElement',
  actions:['capPinchElement'] },

              /* edge / node creation */
              { cond: 'edgeHandleDrag', target: 'createEdge', actions: 'capEdge' },
              { cond: 'createNodeHandleDrag', target: 'createNode', actions: 'capNode' },
            ],

            /* wheel zoom (desktop) ------------------------------------- */
            WHEEL: { target: 'wheelZoom' },

            /* ---------------- DOUBLE TAP ------------------------------ */
            DOUBLE_TAP : [
  /* highest-priority: element hit while in navigate mode */
  { cond : 'doubleTapElementNavigate',
    target : 'doubleTapElement',
    actions : ['selectElement', 'switchToDirect'] },

  /* the original order follows */
  { cond : 'doubleTapCanvasBlank', target : 'doubleTapCanvas' },
  { cond : 'doubleTapElement',     target : 'doubleTapElement' },
  { cond : 'doubleTapEdgeLabel',   target : 'doubleTapEdgeLabel' }
]
          }
        },

        /* ------------  NAVIGATION gestures ------------- */
        /* -------------  NAVIGATION – one finger pan → two finger pinch -------------- */
panCanvas : {
  entry : 'log',
  on : {
    POINTER_MOVE : { actions : 'applyCanvasPan' },
    /* NEW – escalate to pinch as soon as a second finger appears */
    POINTER_DOWN : { cond : 'twoPointersNavigate',
                     target : 'pinchCanvas',
                     actions : 'capPinch' },
    POINTER_UP   : { target : 'idle',
                     actions : 'persistViewState' }
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
          after: { 0: 'idle' }
        },

        /* ------------  SELECTION / GROUP --------------- */
        lassoSelect: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyLassoUpdate' },
            POINTER_UP: { target: 'idle', actions: 'commitLassoSelection' }
          }
        },
        /* -------------  DIRECT – drag group → group pinch --------------------------- */
moveGroup : {
  entry : 'log',
  on : {
    POINTER_MOVE : { actions : 'applyGroupMove' },
    POINTER_DOWN : { cond : 'twoPointersGroupDirect',
                     target : 'pinchGroup',
                     actions : 'capGroupPinch' },     // NEW
    POINTER_UP   : { target : 'idle',
                     actions : 'commitElementMutation' }
  }
},
        pinchGroup: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyGroupPinch' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },

        /* ------------  SINGLE ELEMENT ------------------ */
        /* -------------  DIRECT – drag element → two-finger transform ---------------- */
moveElement : {
  entry : 'log',
  on : {
    POINTER_MOVE : { actions : 'applyMoveElement' },
    POINTER_DOWN : { cond : 'twoPointersElementDirect',
                     target : 'pinchElement',
                     actions : 'capPinchElement' },   // NEW
    POINTER_UP   : { target : 'idle',
                     actions : 'commitElementMutation' }
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
        pinchElement: {
          entry: 'log',
          on: {
            POINTER_MOVE: { actions: 'applyPinchElement' },
            POINTER_UP: { target: 'idle', actions: 'commitElementMutation' }
          }
        },

        /* ------------  EDGES & NODES ------------------- */
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

        /* ------------  DOUBLE-TAPS  -------------------- */
        doubleTapCanvas: { entry: 'log', after: { 0: 'idle' } },
        doubleTapElement: { entry: 'log', after: { 0: 'idle' } },
        doubleTapEdgeLabel: { entry: 'log', after: { 0: 'idle' } },

        /* fallback (keep XState happy) */
        '*': {}
      }
    }
  }
},
  /* ----------------------------------------------------------------------- */
  /*  OPTIONS – guards + actions                                             */
  /* ----------------------------------------------------------------------- */
  {
    guards: {
      /* basic helpers */
      isNavigate: (_c, _e, { state }) => state.matches('mode.navigate'),
      isDirect: (_c, _e, { state }) => state.matches('mode.direct'),

      /* navigation mode */
      /* canvas pinch: any two touches in NAVIGATE mode, no matter what is under them */
      twoPointersNavigate : (_c, e, p) =>
          Object.keys(e.active || {}).length === 2 &&
          p.state.matches('mode.navigate'),
      onePointerBlankNavigate: (_c, e, p) => Object.keys(e.active || {}).length === 1 && !e.hitElement && p.state.matches('mode.navigate'),
      onePointerElementNavigate:  (_c, e, p) => Object.keys(e.active || {}).length === 1 && e.hitElement && !e.groupSelected && p.state.matches('mode.navigate'),

      /* direct-mode */
      onePointerBlankDirect: (_c, e, p) => Object.keys(e.active || {}).length === 1 && !e.hitElement &&!e.handle && p.state.matches('mode.direct'),
      onePointerElementDirect: (_c, e, p) => Object.keys(e.active || {}).length === 1 && e.hitElement &&!e.handle  && !e.groupSelected && p.state.matches('mode.direct'),
      onePointerGroupDirect: (_c, e, p) => Object.keys(e.active || {}).length === 1 && e.groupSelected &&!e.handle && p.state.matches('mode.direct'),

      /* ---------------- guards (gestureMachine options) ------------------------ */
twoPointersGroupDirect : (_c,e,p)=>
  Object.keys(e.active||{}).length===2 &&
  e.groupSelected &&                     // >1 element selected
  p.state.matches('mode.direct'),

      twoPointersElementDirect: (_c,e,p)=>
  Object.keys(e.active||{}).length===2 &&
  e.hitElement && !e.groupSelected &&
  p.state.matches('mode.direct'),
      
      /* handles */
      handleResize: (_c, e) => e.handle === 'resize',
      handleScale: (_c, e) => e.handle === 'scale',
      handleRotate: (_c, e) => e.handle === 'rotate',
      handleReorder: (_c, e) => e.handle === 'reorder',

      edgeHandleDrag: (_c, e) => e.handle === 'edge',
      createNodeHandleDrag: (_c, e) => e.handle === 'createNode',

      /* double-tap */
      doubleTapElementNavigate : (_c, e, p) =>
  e.hitElement && p.state.matches('mode.navigate'),
      doubleTapCanvasBlank: (_c, e) => !e.hitElement && !e.edgeLabel,
      doubleTapElement: (_c, e) => e.hitElement && !e.edgeLabel,
      doubleTapEdgeLabel: (_c, e) => e.edgeLabel
    },

    actions: {
      /* single-liner console log */
      log: (c, e, meta) => console.log('[FSM]', `${meta.state.value.mode}:${meta.state.value.gesture}`, {c, e, meta}),

      /* scratch capture helpers */
      capPan: assign({ draft: (_c, e) => ({ start: e.xy, view: e.view }) }),
      capPinch: assign({
        draft: (_c, e) => ({
          points: Object.values(e.active || {}),
          startDist: Math.hypot(
            ...((p => [p[1].x - p[0].x, p[1].y - p[0].y])(Object.values(e.active || {})))
          ),
          initialScale: e.view.scale,
          center: {
            x: (e.active[0].x + e.active[1].x) / 2,
            y: (e.active[0].y + e.active[1].y) / 2
          }
        })
      }),
      capLasso: assign({ draft: (_c, e) => ({ start: e.xy }) }),
      // Around lib/gestureMachine.js:246
capMove: assign({
  draft: (c, e) => { // c is context, e is the POINTER_DOWN event
    const el = c.controller.findElementById(e.elementId); // Access controller via context 'c'
    if (!el) {
        console.error("capMove: Element not found!", e.elementId);
        // Return something reasonable or handle error, maybe keep existing draft?
        return { origin: e.xy, id: e.elementId, startPos: { x: NaN, y: NaN } };
    }
    return {
      origin: e.xy,      // Pointer start screen coords
      id: e.elementId,   // Element ID
      startPos: { x: el.x, y: el.y } // <<< FIX: Capture actual element start canvas coords
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
      // In lib/gestureMachine.js, actions section
capResize: assign({
  draft: (c, e) => {
    const el = c.controller.findElementById(e.elementId);
    if (!el) return { resize: { startX: e.xy.x, startY: e.xy.y, startW: NaN, startH: NaN } }; // Handle error
    return {
      resize: {
        startX: e.xy.x,       // Pointer start X
        startY: e.xy.y,       // Pointer start Y
        startW: el.width,     // <<< FIX: Actual initial width
        startH: el.height     // <<< FIX: Actual initial height
      },
      id: e.elementId // Also good to capture ID if helper needs it (applyResizeElement already gets it from event)
    };
  }
}),

      capScale: assign({ draft: (_c, e) => ({ origin: e.xy, id: e.elementId }) }),
      // In lib/gestureMachine.js, actions section
capRotate: assign({
  draft: (c, e) => {
    const el = c.controller.findElementById(e.elementId);
    if (!el) return { rotate: { startScreen: e.xy, center: null, startRotation: NaN }, id: e.elementId }; // Handle error
    return {
      rotate: {
        startScreen: e.xy,       // Where pointer started on screen
        center: {                // <<< FIX: Actual center coords object
          x: el.x + (el.width * (el.scale || 1)) / 2,
          y: el.y + (el.height * (el.scale || 1)) / 2
        },
        startRotation: el.rotation || 0 // <<< FIX: Actual initial rotation number
      },
      id: e.elementId
    };
  }
}),
      /* ---------------- actions (gestureMachine options) ----------------------- */
capGroupPinch : assign({
  draft: (_c,e,{state})=>{
    const ids   = [...state.context.controller.selectedElementIds];
    const start = new Map();
    ids.forEach(id=>{
      const el = state.context.controller.findElementById(id);
      start.set(id,{ width:el.width, height:el.height,
                     x:el.x,       y:el.y });
    });
    const pts = Object.values(e.active||{});
    return {
      startDist : Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y),
      startPositions : start,
      bboxCenter : state.context.controller.getGroupBBox()
    };
  }
}),

      capPinchElement : assign({
  draft: (c,e)=>{
    const el = c.controller.findElementById(e.elementId);
    const pts=Object.values(e.active||{});
    return {
      id : e.elementId,
      center : { x:el.x, y:el.y },
      startCx: el.x,  startCy: el.y,
      startW : el.width, startH : el.height,
      startScale : el.scale||1,
      startRotation : el.rotation||0,
      startDist    : Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y),
      startAngle   : Math.atan2(pts[1].y-pts[0].y, pts[1].x-pts[0].x)
    };
  }
}),

switchToDirect : (c, _e, meta) => {
  if (meta.state.matches('mode.navigate')) {
    c.controller.switchMode('direct');
  }
},

      capReorder: assign({ draft: (_c, e) => ({ origin: e.xy, id: e.elementId }) }),
      capEdge: assign({ draft: (_c, e) => ({ start: e.xy, sourceId: e.elementId }) }),
      capNode: assign({ draft: (_c, e) => ({ start: e.xy, sourceId: e.elementId }) })
    }
  });
