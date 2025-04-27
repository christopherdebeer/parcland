// ---------------------------------------------------------------------------
//  XState finite-state machine describing      (  mode   ╳   gesture  )
// ---------------------------------------------------------------------------
//  • **Pure data** – the only side-effect is   console.log()   in state *entry*
//  • Designed to mirror every pointer / wheel / double-tap branch
//    that currently exists in CanvasController.
//
//  NOTE:  No duplicate logs – we *only* log on state entry.
// ---------------------------------------------------------------------------

import { createMachine, assign } from 'xstate';

export const gestureMachine = createMachine({

  id: 'canvas',
  preserveActionOrder: true,

  /* --------------------------------------------------------------------- */
  context: {
    pointers : {},  // { [pointerId]:{x,y} }
    draft    : {}   // scratch data captured in entry-actions
  },

  /* --------------------------------------------------------------------- */
  type  : 'parallel',
  states: {

    /* ------------------------- 1. HIGH-LEVEL MODE ---------------------- */
    mode: {
      initial: 'navigate',
      states : {
        navigate: { on:{ TOGGLE_MODE:'direct'  }},
        direct  : { on:{ TOGGLE_MODE:'navigate'}}
      }
    },

    /* ----------------------------- 2. GESTURE -------------------------- */
    gesture: {
      initial: 'idle',
      states : {

        /*  idle – waiting for first contact  -------------------------------- */
        idle: {
          entry:'log',

          on:{
            /* ————————————————— POINTER DOWN ————————————————————————— */
            POINTER_DOWN:[
              /* canvas navigation ------------------------------------------------ */
              { cond:'twoPointersNavigate'     , target:'pinchCanvas' , actions:'capPinch' },
              { cond:'onePointerBlankNavigate' , target:'panCanvas'   , actions:'capPan'   },

              /* direct-mode blank press / group / element moves ----------------- */
              { cond:'onePointerBlankDirect'   , target:'lassoSelect' , actions:'capLasso' },
              { cond:'onePointerGroupDirect'   , target:'moveGroup'   , actions:'capGroupMove' },
              { cond:'onePointerElementDirect' , target:'moveElement' , actions:'capMove'   },

              /* element handles -------------------------------------------------- */
              { cond:'handleResize'            , target:'resizeElement', actions:'capResize' },
              { cond:'handleScale'             , target:'scaleElement' , actions:'capScale'  },
              { cond:'handleRotate'            , target:'rotateElement', actions:'capRotate' },
              { cond:'handleReorder'           , target:'reorderElement',actions:'capReorder'},

              /* edge / node creation -------------------------------------------- */
              { cond:'edgeHandleDrag'          , target:'createEdge'   , actions:'capEdge'   },
              { cond:'createNodeHandleDrag'    , target:'createNode'   , actions:'capNode'   },
            ],

            /* wheel zoom (desktop track-pad / mouse) --------------------------- */
            WHEEL : { target:'wheelZoom' },

            /* ————————————————— DOUBLE TAP ———————————————————————————— */
            DOUBLE_TAP:[
              { cond:'doubleTapCanvasBlank', target:'doubleTapCanvas'  },
              { cond:'doubleTapElement'   , target:'doubleTapElement'  },
              { cond:'doubleTapEdgeLabel' , target:'doubleTapEdgeLabel'}
            ]
          }
        },

        /* ------------  NAVIGATION gestures ------------- */
        panCanvas   :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        pinchCanvas :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        wheelZoom   :{ entry:'log', after:{0:'idle'} },

        /* ------------  SELECTION / GROUP --------------- */
        lassoSelect :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        moveGroup   :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        pinchGroup  :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},

        /* ------------  SINGLE ELEMENT ------------------ */
        moveElement   :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        resizeElement :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        scaleElement  :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        rotateElement :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        reorderElement:{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        pinchElement  :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},

        /* ------------  EDGES & NODES ------------------- */
        createEdge :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},
        createNode :{ entry:'log', on:{ POINTER_UP:'idle', POINTER_MOVE:{} }},

        /* ------------  DOUBLE-TAPS  -------------------- */
        doubleTapCanvas   :{ entry:'log', after:{0:'idle'} },
        doubleTapElement  :{ entry:'log', after:{0:'idle'} },
        doubleTapEdgeLabel:{ entry:'log', after:{0:'idle'} },

        /* fallback (keep XState happy) */
        '*':{}
      }
    }
  }
},
/* ----------------------------------------------------------------------- */
/*  OPTIONS – guards + actions                                             */
/* ----------------------------------------------------------------------- */
{
  guards:{
    /* ----- basic helpers ----- */
    isNavigate : (_c,_e,{state}) => state.matches('mode.navigate'),
    isDirect   : (_c,_e,{state}) => state.matches('mode.direct'),

    /* ----- navigation mode ----- */
    twoPointersNavigate    : (_c,e,p) => Object.keys(e.active||{}).length===2 && !e.hitElement && p.state.matches('mode.navigate'),
    onePointerBlankNavigate: (_c,e,p) => Object.keys(e.active||{}).length===1 && !e.hitElement && p.state.matches('mode.navigate'),

    /* ----- direct-mode (blank / group / element) ----- */
    onePointerBlankDirect  : (_c,e,p) => Object.keys(e.active||{}).length===1 && !e.hitElement && p.state.matches('mode.direct'),
    onePointerElementDirect: (_c,e,p) => Object.keys(e.active||{}).length===1 &&  e.hitElement && !e.groupSelected && p.state.matches('mode.direct'),
    onePointerGroupDirect  : (_c,e,p) => Object.keys(e.active||{}).length===1 &&  e.groupSelected && p.state.matches('mode.direct'),

    /* ----- handles (pointerAdapter marks `handle` key) ----- */
    handleResize : (_c,e)=> e.handle==='resize',
    handleScale  : (_c,e)=> e.handle==='scale',
    handleRotate : (_c,e)=> e.handle==='rotate',
    handleReorder: (_c,e)=> e.handle==='reorder',

    edgeHandleDrag      : (_c,e)=> e.handle==='edge',
    createNodeHandleDrag: (_c,e)=> e.handle==='createNode',

    /* ----- double-tap surface ----- */
    doubleTapCanvasBlank: (_c,e)=> !e.hitElement && !e.edgeLabel,
    doubleTapElement    : (_c,e)=>  e.hitElement && !e.edgeLabel,
    doubleTapEdgeLabel  : (_c,e)=>  e.edgeLabel
  },

  actions:{
    /* single-liner console log */
    log: (_c,_e,meta) => console.log('[FSM]', meta.state.value),

    /* scratch capture helpers (future use) */
    capPan     : assign({ draft:(_c,e)=>({ start:e.xy , view:e.view          }) }),
    capPinch   : assign({ draft:(_c,e)=>({ points:Object.values(e.active||{})}) }),
    capLasso   : assign({ draft:(_c,e)=>({ start:e.xy                        }) }),
    capMove    : assign({ draft:(_c,e)=>({ start:e.xy , id:e.elementId       }) }),
    capGroupMove:assign({ draft:(_c,e)=>({ start:e.xy                        }) }),
    capResize  : assign({ draft:(_c,e)=>({ start:e.xy , id:e.elementId       }) }),
    capScale   : assign({ draft:(_c,e)=>({ start:e.xy , id:e.elementId       }) }),
    capRotate  : assign({ draft:(_c,e)=>({ start:e.xy , id:e.elementId       }) }),
    capReorder : assign({ draft:(_c,e)=>({ start:e.xy , id:e.elementId       }) }),
    capEdge    : assign({ draft:(_c,e)=>({ start:e.xy , sourceId:e.elementId }) }),
    capNode    : assign({ draft:(_c,e)=>({ start:e.xy , sourceId:e.elementId }) })
  }
});
