// ---------------------------------------------------------------------------
// XState finite-state machine describing   (mode  ╳  gesture)
// ---------------------------------------------------------------------------
// * Pure data – NO side-effects except   console.log()   in entry actions.
// * Still “logging only” – real behaviour lives in main.js for now.
// ---------------------------------------------------------------------------

import { createMachine, assign } from 'xstate';

export const gestureMachine = createMachine(
{
  id: 'canvas',
  preserveActionOrder: true,

  /* --------------------------------------------------------------------- */
  context: {
    pointers: {},   // { [pointerId]:{x,y} }
    draft:   {}     // scratch store (start positions, etc.)
  },

  /* --------------------------------------------------------------------- */
  type: 'parallel',
  states: {

    /* --------------------- HIGH-LEVEL MODE (navigate|direct) ------------ */
    mode: {
      initial: 'navigate',
      states: {
        navigate: { entry: 'logState', on: { TOGGLE_MODE: 'direct'  } },
        direct:   { entry: 'logState', on: { TOGGLE_MODE: 'navigate'} }
      }
    },

    /* ----------------------------- GESTURE ------------------------------ */
    gesture: {
      initial: 'idle',
      states: {

        /* idle – waiting for first contact -------------------------------- */
        idle: {
          entry: 'logState',
          on: {
            POINTER_DOWN: [

              /* handles (direct-mode only) */
              { cond:'resizeHandleDirect',  target:'resizeElement',  actions:'captureResizeStart' },
              { cond:'scaleHandleDirect',   target:'scaleElement',   actions:'captureScaleStart'  },
              { cond:'rotateHandleDirect',  target:'rotateElement',  actions:'captureRotateStart' },
              { cond:'reorderHandleDirect', target:'reorderElement', actions:'captureReorderStart'},
              { cond:'edgeHandleDirect',    target:'createEdge',     actions:'captureEdgeStart'   },
              { cond:'createHandleDirect',  target:'createNode',     actions:'captureNodeStart'   },

              /* main canvas gestures */
              { cond:'twoPointersNavigate',        target:'pinchCanvas',  actions:'capturePinchStart' },
              { cond:'onePointerBlankNavigate',    target:'panCanvas',    actions:'capturePanStart'   },
              { cond:'onePointerBlankDirect',      target:'lasso',        actions:'captureLassoStart' },
              { cond:'onePointerElementDirect',    target:'moveElement',  actions:'captureMoveStart'  },
            ],

            WHEEL: { target:'wheelZoom' }
          }
        },

        /* -------------- canvas navigation states ------------------------ */
        panCanvas:   { entry:'logState',
          on:{
            POINTER_DOWN:{ cond:'twoPointersNavigate', target:'pinchCanvas', actions:'capturePinchStart' },
            POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{}
          }
        },
        pinchCanvas:{ entry:'logState',
          on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} }
        },
        wheelZoom:{  entry:'logState', after:{ 0:'idle' } },

        /* -------------- direct-mode selection --------------------------- */
        lasso:{ entry:'logState',
          on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} }
        },

        /* -------------- element / group manipulation -------------------- */
        moveElement:{  entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        moveGroup:{    entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        pinchElement:{ entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        pinchGroup:{   entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        resizeElement:{entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        scaleElement:{ entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        rotateElement:{entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        reorderElement:{entry:'logState',on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },

        /* -------------- edge / node creation ---------------------------- */
        createEdge:{  entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },
        createNode:{  entry:'logState', on:{ POINTER_UP:'idle', POINTER_CANCEL:'idle', POINTER_MOVE:{} } },

        /* fallback ------------------------------------------------------- */
        '*': {}
      }
    }
  }
},
{
  /* ------------------------------ GUARDS -------------------------------- */
  guards:{
    /* navigation */
    twoPointersNavigate:      (ctx,ev,{state}) => Object.keys(ev.active).length === 2 && state.matches('mode.navigate'),
    onePointerBlankNavigate:  (ctx,ev,{state}) => Object.keys(ev.active).length === 1 && !ev.hitElement && state.matches('mode.navigate'),
    onePointerBlankDirect:    (ctx,ev,{state}) => Object.keys(ev.active).length === 1 && !ev.hitElement && state.matches('mode.direct'),
    onePointerElementDirect:  (ctx,ev,{state}) => Object.keys(ev.active).length === 1 &&  ev.hitElement && !ev.handle && state.matches('mode.direct'),

    /* handles (direct-mode) */
    resizeHandleDirect:  (c,e,{state}) => e.handle==='resize'   && state.matches('mode.direct'),
    scaleHandleDirect:   (c,e,{state}) => e.handle==='scale'    && state.matches('mode.direct'),
    rotateHandleDirect:  (c,e,{state}) => e.handle==='rotate'   && state.matches('mode.direct'),
    reorderHandleDirect: (c,e,{state}) => e.handle==='reorder'  && state.matches('mode.direct'),
    edgeHandleDirect:    (c,e,{state}) => e.handle==='createEdge' && state.matches('mode.direct'),
    createHandleDirect:  (c,e,{state}) => e.handle==='createNode' && state.matches('mode.direct'),
  },

  /* ------------------------------ ACTIONS ------------------------------ */
  actions:{
    logState:            (ctx,ev,meta) => console.log('[FSM]', meta.state.value),

    /* simple scratch-captures – kept for future use */
    capturePanStart:     assign({ draft:(c,e)=>({ start:{...e.xy}, view:e.view       }) }),
    capturePinchStart:   assign({ draft:(c,e)=>({ points:Object.values(e.active)     }) }),
    captureLassoStart:   assign({ draft:(c,e)=>({ start:{...e.xy}                    }) }),
    captureMoveStart:    assign({ draft:(c,e)=>({ start:{...e.xy}, elementId:e.elementId }) }),
    captureResizeStart:  assign({ draft:(c,e)=>({ start:{...e.xy}, elementId:e.elementId }) }),
    captureScaleStart:   assign({ draft:(c,e)=>({ start:{...e.xy}, elementId:e.elementId }) }),
    captureRotateStart:  assign({ draft:(c,e)=>({ start:{...e.xy}, elementId:e.elementId }) }),
    captureReorderStart: assign({ draft:(c,e)=>({ start:{...e.xy}, elementId:e.elementId }) }),
    captureEdgeStart:    assign({ draft:(c,e)=>({ elementId:e.elementId }) }),
    captureNodeStart:    assign({ draft:(c,e)=>({ elementId:e.elementId }) })
  }
});
