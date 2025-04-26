// ---------------------------------------------------------------------------
// XState finite-state machine describing   (mode  ╳  gesture)
// ---------------------------------------------------------------------------
// * Pure data – NO side-effects except   console.log()  in entry actions.
// * Only states & guards required to mirror today's behaviour.
// * Use "ctx" exclusively for live pointer cache and scratch data.
/// --------------------------------------------------------------------------

import { createMachine, assign } from 'xstate';

export const gestureMachine = createMachine({

  id: 'canvas',
  preserveActionOrder: true,

  /** ------------------------------------------------------------------ */
  context: {
    pointers: {},     // { [pointerId]: {x, y} }
    // scratch data captured in entry actions
    draft:   {}
  },

  /** ------------------------------------------------------------------ */
  type: 'parallel',
  states: {

    /* ----------------------- HIGH-LEVEL MODE ------------------------- */
    mode: {
      initial: 'navigate',
      states: {
        navigate: {
          on: { TOGGLE_MODE: 'direct' }
        },
        direct: {
          on: { TOGGLE_MODE: 'navigate' }
        }
      }
    },

    /* --------------------------- GESTURE ----------------------------- */
    gesture: {
      initial: 'idle',
      states: {

        /* idle – waiting for first contact --------------------------- */
        idle: {
          entry: 'logState',
          on: {
            POINTER_DOWN: [
              /* 2-finger pinch begins, NAVIGATE mode only */
              { cond: 'twoPointersNavigate',
                target: 'pinchCanvas',
                actions: ['capturePinchStart', 'logState'] },

              /* 1-finger blank press, NAVIGATE mode → pan  */
              { cond: 'onePointerBlankNavigate',
                target: 'panCanvas',
                actions: ['capturePanStart', 'logState'] },

              /* 1-finger blank press, DIRECT mode → lasso */
              { cond: 'onePointerBlankDirect',
                target: 'lasso',
                actions: ['captureLassoStart', 'logState'] },

              /* 1-finger press on element in DIRECT mode → move-element */
              { cond: 'onePointerElementDirect',
                target: 'moveElement',
                actions: ['captureMoveStart', 'logState'] }
            ],

            WHEEL: { target: 'wheelZoom', actions: 'logState' }
          }
        },

        /* … skeletal states – pure logging only …                       */
        panCanvas:   { on: { POINTER_UP: 'idle', POINTER_MOVE: { actions:'logState'} }, entry:'logState' },
        pinchCanvas:{ on: { POINTER_UP: 'idle', POINTER_MOVE: { actions:'logState'} }, entry:'logState' },
        wheelZoom:   { after: { 0: 'idle' },                                        entry:'logState' },

        lasso:       { on: { POINTER_UP: 'idle', POINTER_MOVE: { actions:'logState'} }, entry:'logState' },
        moveElement: { on: { POINTER_UP: 'idle', POINTER_MOVE: { actions:'logState'} }, entry:'logState' },

        /* fallback */
        '*': {}
      }
    }
  }
},
{
  /* ------------------------ GUARDS ------------------------------------ */
  guards: {
    twoPointersNavigate:           (ctx, ev) => Object.keys(ev.active).length === 2 && state.matches('mode.navigate'),
    onePointerBlankNavigate:       (ctx, ev) => Object.keys(ev.active).length === 1 && !ev.hitElement && state.matches('mode.navigate'),
    onePointerBlankDirect:         (ctx, ev) => Object.keys(ev.active).length === 1 && !ev.hitElement && state.matches('mode.direct'),
    onePointerElementDirect:       (ctx, ev) => Object.keys(ev.active).length === 1 &&  ev.hitElement && state.matches('mode.direct'),
  },

  /* ------------------------ ACTIONS ----------------------------------- */
  actions: {
    logState:    (ctx, ev, meta) => console.log('[FSM]', meta.state.value, ctx),
    capturePanStart:  assign({ draft: (ctx,ev)=>({ start:{...ev.xy}, view:ev.view }) }),
    capturePinchStart:assign({ draft: (ctx,ev)=>({ points:Object.values(ev.active) }) }),
    captureLassoStart:assign({ draft: (ctx,ev)=>({ start:{...ev.xy} }) }),
    captureMoveStart: assign({ draft: (ctx,ev)=>({ start:{...ev.xy}, elementId:ev.elementId }) })
  }
});
