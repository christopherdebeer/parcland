// ---------------------------------------------------------------------------
// X-State finite-state machine describing        ( mode   ╳   gesture )
// ---------------------------------------------------------------------------
//  ➟  Pure data : NO side-effects except   console.log()   in entry actions.
//  ➟  Guards are **best-effort** mirrors of the ad-hoc checks found in
//     CanvasController.  If an event property (eg. ev.handle) is missing
//     the guard simply returns false and the transition is skipped.
//  ➟  Use ctx.draft only for scratch values captured in entry actions.
// ---------------------------------------------------------------------------

import { createMachine, assign } from 'xstate';

export const gestureMachine = createMachine(
{
  id: 'canvas',
  preserveActionOrder: true,

  context: {
    pointers : {},     // { [pointerId]: {x,y} }
    draft    : {}      // transient per-gesture scratch data
  },

  type: 'parallel',
  states: {

    /* ─────────────────────────  HIGH-LEVEL MODE  ──────────────────────── */
    mode: {
      initial: 'navigate',
      states : {
        navigate: { on: { TOGGLE_MODE: 'direct'  } },
        direct  : { on: { TOGGLE_MODE: 'navigate'} }
      }
    },

    /* ────────────────────────────  GESTURE  ───────────────────────────── */
    gesture: {
      initial: 'idle',
      states : {

        /* ---------------  IDLE  --------------- */
        idle: {
          entry: 'logState',
          on: {

            /* --- initial press on blank canvas ------------------------- */
            POINTER_DOWN: [

              /* 2-finger touch immediately → pinch-zoom canvas */
              { cond: 'twoPointersNavigate',
                target: 'pinchCanvas',
                actions: ['capturePinchStart','logState'] },

              { cond: 'onePointerBlankNavigate',
                target: 'panCanvas',
                actions: ['capturePanStart','logState'] },

              { cond: 'onePointerBlankDirect',
                target: 'lasso',
                actions: ['captureLassoStart','logState'] },

              /* --- element presses (direct-mode) ----------------------- */
              { cond: 'onePointerElementDirectGroup',
                target: 'moveGroup',
                actions:['captureMoveStart','logState'] },

              { cond: 'onePointerElementDirect',
                target: 'moveElement',
                actions:['captureMoveStart','logState'] },

              /* --- handle presses – emitted as synthetic events -------- */
              { cond: 'isResizeHandle',
                target: 'resizeElement',
                actions:['captureResizeStart','logState'] },

              { cond: 'isScaleHandle',
                target: 'scaleElement',
                actions:['captureScaleStart','logState'] },

              { cond: 'isRotateHandle',
                target: 'rotateElement',
                actions:['captureRotateStart','logState'] },

              { cond: 'isReorderHandle',
                target: 'reorderElement',
                actions:['captureReorderStart','logState'] },

              { cond: 'isEdgeHandle',
                target: 'createEdge',
                actions:['captureEdgeStart','logState'] },

              { cond: 'isCreateHandle',
                target: 'createNode',
                actions:['captureEdgeStart','logState'] }
            ],

            /* --- wheel / track-pad zoom -------------------------------- */
            WHEEL: { target:'wheelZoom', actions:'logState' }
          }
        },

        /* ---------------  PAN  /  PINCH  /  WHEEL  --------------------- */
        panCanvas:  {
          entry:'logState',
          on: {
            POINTER_DOWN: {            // finger #2 lands while panning
              cond:'twoPointersNavigate',
              target:'pinchCanvas',
              actions:['capturePinchStart','logState']
            },
            POINTER_MOVE:{ actions:'logState' },
            POINTER_UP  : 'idle'
          }
        },

        pinchCanvas:{
          entry:'logState',
          on:{
            POINTER_MOVE:{ actions:'logState' },
            POINTER_UP  :'idle'
          }
        },

        wheelZoom:{
          entry:'logState',
          after:{ 0:'idle' }          // immediate return once logged
        },

        /* ---------------  SELECTION & LASSO  -------------------------- */
        lasso:{
          entry:'logState',
          on:{
            POINTER_MOVE:{ actions:'logState' },
            POINTER_UP  :'idle'
          }
        },

        /* ---------------  ELEMENT TRANSFORMS  ------------------------- */
        moveElement:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },
        moveGroup:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },

        resizeElement:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },
        scaleElement:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },
        rotateElement:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },
        reorderElement:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },

        /* --- 2-finger transforms on selection ------------------------ */
        pinchElement:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },
        pinchGroup:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },

        /* ---------------  EDGE / NODE CREATION  ----------------------- */
        createEdge:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },
        createNode:{
          entry:'logState',
          on:{ POINTER_MOVE:{actions:'logState'}, POINTER_UP:'idle' }
        },

        /* fallback */
        '*':{}
      }
    }
  }
},

/* ────────────────────  GUARDS & ACTIONS  ──────────────────────────── */
{
  guards:{
    /* pointer-count helpers */
    twoPointersNavigate      : (ctx,ev,{state}) => Object.keys(ev.active).length===2 && state.matches('mode.navigate'),
    onePointerBlankNavigate  : (ctx,ev,{state}) => Object.keys(ev.active).length===1 && !ev.hitElement            && state.matches('mode.navigate'),
    onePointerBlankDirect    : (ctx,ev,{state}) => Object.keys(ev.active).length===1 && !ev.hitElement            && state.matches('mode.direct'),
    onePointerElementDirect  : (ctx,ev,{state}) => Object.keys(ev.active).length===1 &&  ev.hitElement            && state.matches('mode.direct'),
    /* multi-select branch (relies on external event flag) */
    onePointerElementDirectGroup:
                                (ctx,ev,{state}) => Object.keys(ev.active).length===1 && ev.hitElement && ev.groupSelected && state.matches('mode.direct'),

    /* handle-specific presses (pointerAdapter may add ev.handle) */
    isResizeHandle           : (_ctx,ev) => ev.handle==='resize',
    isScaleHandle            : (_ctx,ev) => ev.handle==='scale',
    isRotateHandle           : (_ctx,ev) => ev.handle==='rotate',
    isReorderHandle          : (_ctx,ev) => ev.handle==='reorder',
    isEdgeHandle             : (_ctx,ev) => ev.handle==='edge',
    isCreateHandle           : (_ctx,ev) => ev.handle==='create'
  },

  actions:{
    logState        : (_ctx,_ev,meta) => console.log('[FSM]',meta.state.value),
    capturePanStart : assign({ draft:(_ctx,ev)=>({start:{...ev.xy},view:ev.view}) }),
    capturePinchStart:assign({ draft:(_ctx,ev)=>({points:Object.values(ev.active)}) }),
    captureLassoStart:assign({ draft:(_ctx,ev)=>({start:{...ev.xy}}) }),
    captureMoveStart : assign({ draft:(_ctx,ev)=>({start:{...ev.xy},elementId:ev.elementId}) }),
    captureResizeStart:assign({ draft:(_ctx,ev)=>({start:{...ev.xy}}) }),
    captureScaleStart :assign({ draft:(_ctx,ev)=>({start:{...ev.xy}}) }),
    captureRotateStart:assign({ draft:(_ctx,ev)=>({start:{...ev.xy}}) }),
    captureReorderStart:assign({ draft:(_ctx,ev)=>({start:{...ev.xy}}) }),
    captureEdgeStart  :assign({ draft:(_ctx,ev)=>({start:{...ev.xy}}) })
  }
});
