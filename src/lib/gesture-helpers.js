/**
 * Gesture → model mutation helpers
 * --------------------------------
 * Pure helpers that *mutate controller-owned model objects* but never touch
 * the DOM directly.  They are injected into `gestureMachine` as XState
 * actions in Phase 0; later phases simply call them from state/actions.
 *
 * Every helper is written as a closure over the host `CanvasController`
 * instance – so they can access viewState, canvasState, etc. without polluting
 * the FSM context.
 */
import { saveCanvas } from './storage.js';

export function createGestureHelpers(controller) {
  /* ------------------------------------------------------------ */
  /* util                                                         */
  /* ------------------------------------------------------------ */
  const dpi = () => controller.viewState.scale || 1;   // “device-pixels” ↔ canvas

  /* ------------------------------------------------------------ */
  /* 1. canvas pan                                                */
  /* ------------------------------------------------------------ */
  function applyCanvasPan(ctx, ev) {
    const { draft } = ctx;
    if (!draft.start || !draft.view) return;           // safety-net
    const dx = ev.xy.x - draft.start.x;
    const dy = ev.xy.y - draft.start.y;

    controller.viewState.translateX = draft.view.translateX + dx;
    controller.viewState.translateY = draft.view.translateY + dy;

    controller.updateCanvasTransform();
  }

  /* ------------------------------------------------------------ */
  /* 2. canvas pinch/zoom                                         */
  /* ------------------------------------------------------------ */
  function applyCanvasPinch(ctx, ev) {
    const pts = Object.values(ev.active || {});
    if (pts.length !== 2 || !ctx.draft.startDist) return;

    const [p1, p2]  = pts;
    const newDist   = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const factor    = newDist / ctx.draft.startDist;

    const newScale  = Math.min(
      Math.max(ctx.draft.initialScale * factor, controller.MIN_SCALE),
      controller.MAX_SCALE
    );

    const delta     = newScale - controller.viewState.scale;
    controller.viewState.scale = newScale;
    controller.viewState.translateX -= ctx.draft.center.x * delta;
    controller.viewState.translateY -= ctx.draft.center.y * delta;

    controller.updateCanvasTransform();
  }

  /* ------------------------------------------------------------ */
  /* 3. element move                                              */
  /* ------------------------------------------------------------ */
  function captureMoveElement(ctx, ev) {
    ctx.draft.origin   = { x: ev.xy.x, y: ev.xy.y };
    const el           = controller.findElementById(ev.elementId);
    ctx.draft.startPos = { x: el.x, y: el.y };
  }

  function applyMoveElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    if (!el || el.static) return;

    const dx = (ev.xy.x - ctx.draft.origin.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin.y) / dpi();

    el.x = ctx.draft.startPos.x + dx;
    el.y = ctx.draft.startPos.y + dy;

    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id)
    );
  }

  /* ------------------------------------------------------------ */
  /* 4. element resize                                            */
  /* ------------------------------------------------------------ */
  function captureResizeElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    ctx.draft.resize = {
      startX : ev.xy.x,
      startY : ev.xy.y,
      startW : el.width,
      startH : el.height
    };
  }

  function applyResizeElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    if (!el || el.static) return;

    const dx = (ev.xy.x - ctx.draft.resize.startX) / dpi();
    const dy = (ev.xy.y - ctx.draft.resize.startY) / dpi();

    el.width  = Math.max(20, ctx.draft.resize.startW + dx);
    el.height = Math.max(20, ctx.draft.resize.startH + dy);

    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id)
    );
  }

  /* ------------------------------------------------------------ */
  /* 5. element rotate                                            */
  /* ------------------------------------------------------------ */
  function captureRotateElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    ctx.draft.rotate = {
      center        : { x: el.x + el.width / 2, y: el.y + el.height / 2 },
      startScreen   : { x: ev.xy.x, y: ev.xy.y },
      startRotation : el.rotation || 0
    };
  }

  function applyRotateElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    if (!el) return;

    const { center, startScreen, startRotation } = ctx.draft.rotate;
    const p0 = controller.screenToCanvas(startScreen.x, startScreen.y);
    const p1 = controller.screenToCanvas(ev.xy.x,       ev.xy.y);

    const a0  = Math.atan2(p0.y - center.y, p0.x - center.x);
    const a1  = Math.atan2(p1.y - center.y, p1.x - center.x);
    const deg = ((a1 - a0) * 180) / Math.PI;

    el.rotation = startRotation + deg;

    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id)
    );
  }

  /* ------------------------------------------------------------ */
  /* 6. generic “commit” actions                                  */
  /* ------------------------------------------------------------ */
  function commitElementMutation() {
    controller.renderElements();              // redraw once
    saveCanvas(controller.canvasState);       // debounce handled in storage.js
  }

  function persistViewState() {
    controller.saveLocalViewState();
  }

  /* ------------------------------------------------------------ */
  /* export bindings                                              */
  /* ------------------------------------------------------------ */
  return {
    /* canvas */
    applyCanvasPan,
    applyCanvasPinch,
    persistViewState,

    /* move */
    captureMoveElement,
    applyMoveElement,
    commitElementMutation,

    /* resize */
    captureResizeElement,
    applyResizeElement,

    /* rotate */
    captureRotateElement,
    applyRotateElement
  };
}
