/**
 * CanvasController-aware helpers that *mutate model objects* but never touch
 * the DOM outside controller methods.  They are injected into gestureMachine
 * as XState actions.
 */
import { saveCanvas } from '../network/storage.ts';
import { generateContent } from '../network/generation.ts';
import type { CanvasController } from '../../types.ts';

// XState context and event types
interface GestureContext {
  controller: CanvasController;
  draft: {
    start?: { x: number; y: number };
    view?: { translateX: number; translateY: number; scale: number };
    startDist?: number;
    initialScale?: number;
    center?: { x: number; y: number };
    origin?: { x: number; y: number };
    startPos?: { x: number; y: number };
    resize?: {
      startX: number;
      startY: number;
      startW: number;
      startH: number;
      cx?: number;
      cy?: number;
    };
    rotate?: {
      center: { x: number; y: number };
      startScreen: { x: number; y: number };
      startRotation: number;
    };
    startScale?: number;
    startPositions?: Map<string, { x: number; y: number; offsetX?: number; offsetY?: number; rotation?: number; scale?: number }>;
    startAngle?: number;
    bboxCenter?: { cx: number; cy: number };
    tempLine?: SVGLineElement;
    sourceId?: string;
    id?: string;
    startCx?: number;
    startCy?: number;
  };
  pointers?: Record<string, { x: number; y: number }>;
}

interface GestureEvent {
  xy: { x: number; y: number };
  elementId?: string;
  edgeId?: string;
  ev?: any;
  deltaY?: number;
  active?: Record<string, { x: number; y: number }>;
}

export function createGestureHelpers(controller: CanvasController) {

  const dpi = () => controller.viewState.scale || 1;     // "device-pixels" ⇄ canvas

  function commitElementMutation() {
    controller.requestRender();
    saveCanvas(controller.canvasState);
    controller._pushHistorySnapshot('Element change');
  }
  function persistViewState() {
    controller.saveLocalViewState();
    // controller._pushHistorySnapshot('View change');
  }

  function applyCanvasPan(ctx: GestureContext, ev: GestureEvent) {
    if (!ctx.draft.start || !ctx.draft.view) return;
    const dx = ev.xy.x - ctx.draft.start.x;
    const dy = ev.xy.y - ctx.draft.start.y;
    controller.viewState.translateX = ctx.draft.view.translateX + dx;
    controller.viewState.translateY = ctx.draft.view.translateY + dy;
    controller.updateCanvasTransform();
  }

  function applyCanvasPinch(ctx: GestureContext, ev: GestureEvent) {
    const pts = Object.values(ev.active || {});
    if (pts.length !== 2 || !ctx.draft.startDist) return;
    const [p1, p2] = pts;
    const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const factor = newDist / ctx.draft.startDist;

    const newScale = Math.min(
      Math.max(ctx.draft.initialScale * factor, controller.MIN_SCALE),
      controller.MAX_SCALE
    );

    // Calculate the current center point in canvas coordinates
    const currentCenter = controller.screenToCanvas(
      ctx.draft.center.x,
      ctx.draft.center.y
    );

    // Apply the zoom transformation centered on this point
    const delta = newScale - controller.viewState.scale;
    controller.viewState.scale = newScale;

    // Adjust translation to keep the pinch center fixed in canvas space
    controller.viewState.translateX -= currentCenter.x * delta;
    controller.viewState.translateY -= currentCenter.y * delta;

    controller.updateCanvasTransform();
  }

  function applyWheelZoom(_ctx: GestureContext, ev: GestureEvent) {
    const { ev: wheelEv, deltaY } = ev;
    const delta = -(deltaY ?? wheelEv.deltaY);
    const zoomSpeed = 0.001;
    const prevScale = controller.viewState.scale;
    const scale = Math.min(
      Math.max(prevScale * (1 + delta * zoomSpeed), controller.MIN_SCALE),
      controller.MAX_SCALE
    );
    const scaleDelta = scale - prevScale;
    const zoomCenter = controller.screenToCanvas(wheelEv.clientX, wheelEv.clientY);

    controller.viewState.scale = scale;
    controller.viewState.translateX -= zoomCenter.x * scaleDelta;
    controller.viewState.translateY -= zoomCenter.y * scaleDelta;
    controller.updateCanvasTransform();
  }

  function applyMoveElement(ctx: GestureContext, ev: GestureEvent) {
    const el = controller.findElementById(ev.elementId);
    if (!el || el.static) return;
    const dx = (ev.xy.x - ctx.draft.origin.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin.y) / dpi();
    el.x = ctx.draft.startPos.x + dx;
    el.y = ctx.draft.startPos.y + dy;
    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyResizeElement(ctx: GestureContext, ev: GestureEvent) {
    const el = controller.findElementById(ev.elementId!);
    if (!el || el.static) return;
    const dx = (ev.xy.x - ctx.draft.resize!.startX) / dpi();
    const dy = (ev.xy.y - ctx.draft.resize!.startY) / dpi();
    el.width = Math.max(20, ctx.draft.resize!.startW + dx);
    el.height = Math.max(20, ctx.draft.resize!.startH + dy);
    const node = controller.elementNodesMap[el.id];
    controller.updateElementNode(
      node,
      el,
      controller.isElementSelected(el.id),
      true
    );
    // --- keep model dimensions in sync with flowed DOM height --------------
    requestAnimationFrame(() => {          // run after the browser paints
      const contentBox = node.querySelector('.content') || node;
      if (!contentBox) return;
      el.height = contentBox.clientHeight / (el.scale || 1);
    });
  }

  function applyRotateElement(ctx: GestureContext, ev: GestureEvent) {
    const el = controller.findElementById(ev.elementId);
    if (!el) return;
    const { center, startScreen, startRotation } = ctx.draft.rotate;
    const p0 = controller.screenToCanvas(startScreen.x, startScreen.y);
    const p1 = controller.screenToCanvas(ev.xy.x, ev.xy.y);

    const a0 = Math.atan2(p0.y - center.y, p0.x - center.x);
    const a1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const deg = ((a1 - a0) * 180) / Math.PI;

    el.rotation = startRotation + deg;
    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyScaleElement(ctx: GestureContext, ev: GestureEvent) {
    const el = controller.findElementById(ev.elementId!);
    if (!el) return;
    const sensitivity = 0.01;
    const dx = (ev.xy.x - ctx.draft.origin!.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin!.y) / dpi();
    // Calculate a scale factor based on the distance moved
    const scaleFactor = 1 + (dx + dy) * sensitivity;
    // Apply the scale factor to the initial scale
    el.scale = Math.max(ctx.draft.startScale! * scaleFactor, 0.2);
    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyReorderElement(ctx: GestureContext, ev: GestureEvent) {
    const el = controller.findElementById(ev.elementId!);
    if (!el) return;
    const dx = (ev.xy.x - ctx.draft.origin!.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin!.y) / dpi();
    const len = Math.hypot(dx, dy);
    el.zIndex = len * 0.1;
    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyGroupMove(ctx: GestureContext, ev: GestureEvent) {
    const dx = (ev.xy.x - ctx.draft.origin.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin.y) / dpi();
    controller.selectedElementIds.forEach(id => {
      const el = controller.findElementById(id);
      const start = ctx.draft.startPositions.get(id);
      el.x = start.x + dx;
      el.y = start.y + dy;
      // Update each element individually for better performance
      controller.updateElementNode(
        controller.elementNodesMap[el.id],
        el,
        controller.isElementSelected(el.id),
        true
      );
    });
    controller.updateGroupBox();
    controller.requestEdgeUpdate();
  }

    /* ---------------- group resize (single-handle drag) ---------------- */
  function applyGroupResize(ctx: GestureContext, ev: GestureEvent) {
    const { resize } = ctx.draft;               if (!resize) return;
    const dpi  = () => controller.viewState.scale || 1;
    const dx   = (ev.xy.x - resize.startX) / dpi();
    const dy   = (ev.xy.y - resize.startY) / dpi();

    /* proportional factors per axis */
    const sx = (resize.startW + dx) / resize.startW;
    const sy = (resize.startH + dy) / resize.startH;

    controller.selectedElementIds.forEach(id => {
      const el    = controller.findElementById(id);
      if (!el) return;
      const offX  = (el.x - resize.cx!) * sx;
      const offY  = (el.y - resize.cy!) * sy;
      el.x        = resize.cx! + offX;
      el.y        = resize.cy! + offY;
      el.scale    = (el.scale || 1) * Math.max(sx, sy);   // uniform
    });
    controller.requestRender();
  }

  /* --------------- group scale (diagonal ↕ handle) ------------------- */
  const applyGroupScale = applyGroupResize;   /* identical behaviour   */

  /* ---------------- group rotate (ring handle) ----------------------- */
  function applyGroupRotate(ctx: GestureContext, ev: GestureEvent) {
    const { rotate } = ctx.draft;              if (!rotate) return;
    const a1 = Math.atan2(ev.xy.y - rotate.center.y,
                          ev.xy.x - rotate.center.x);
    const startAng = (rotate as any).startAng || 0;
    const dA = a1 - startAng;           // radians

    controller.selectedElementIds.forEach(id => {
      const el = controller.findElementById(id);
      if (!el) return;
      const dx = el.x - rotate.center.x;
      const dy = el.y - rotate.center.y;
      const rx =  dx * Math.cos(dA) - dy * Math.sin(dA);
      const ry =  dx * Math.sin(dA) + dy * Math.cos(dA);
      el.x      = rotate.center.x + rx;
      el.y      = rotate.center.y + ry;
      el.rotation = (el.rotation || 0) + dA*180/Math.PI;
    });
    controller.requestRender();
  }

  function applyGroupPinch(ctx: GestureContext, ev: GestureEvent) {
    const pts = Object.values(ev.active || {});
    if (pts.length !== 2) return;

    /* scale & rotate factors relative to start */
    const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    const scale = newDist / ctx.draft.startDist;

    const a1 = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const dAng = a1 - ctx.draft.startAngle;          // radians

    const { cx, cy } = ctx.draft.bboxCenter;

    controller.selectedElementIds.forEach(id => {
      const el = controller.findElementById(id);
      const start = ctx.draft.startPositions.get(id);

      /* rotate + scale the centre point */
      const ox = start.offsetX * scale;
      const oy = start.offsetY * scale;
      const rotX = ox * Math.cos(dAng) - oy * Math.sin(dAng);
      const rotY = ox * Math.sin(dAng) + oy * Math.cos(dAng);

      el.x = cx + rotX;
      el.y = cy + rotY;
      el.scale = start.scale * scale;    // ➋  propagate group-wide factor
      /* keep *internal* scale intact, only update global rotation */
      el.rotation = start.rotation + dAng * 180 / Math.PI;
    });

    controller.requestRender();
  }

  function applyLassoUpdate(ctx: GestureContext, ev: GestureEvent) {
    controller.updateSelectionBox(
      ctx.draft.start!.x, ctx.draft.start!.y,
      ev.xy.x, ev.xy.y
    );
  }
  function commitLassoSelection(ctx: GestureContext, ev: GestureEvent) {
    const { start } = ctx.draft;
    const { x: sx, y: sy } = start!;
    const { x: ex, y: ey } = ev.xy;
    const tl = controller.screenToCanvas(Math.min(sx, ex), Math.min(sy, ey));
    const br = controller.screenToCanvas(Math.max(sx, ex), Math.max(sy, ey));

    controller.selectedElementIds.clear();
    controller.canvasState.elements.forEach(el => {
      const halfW = (el.width * (el.scale || 1)) / 2;
      const halfH = (el.height * (el.scale || 1)) / 2;
      const inX = (el.x + halfW) >= tl.x && (el.x - halfW) <= br.x;
      const inY = (el.y + halfH) >= tl.y && (el.y - halfH) <= br.y;
      if (inX && inY) controller.selectedElementIds.add(el.id);
    });

    controller.removeSelectionBox();
    controller.requestRender();

    if (controller.selectedElementIds.size === 0 &&
      controller.mode === 'direct') {
      controller.switchMode!('navigate');
    }
  }

  function selectElement(_ctx: GestureContext, ev: GestureEvent) {
    if (!ev.elementId) return;

    const isTouch = ev.ev.pointerType === 'touch';
    const inSet = controller.selectedElementIds.has(ev.elementId);
    const additive = true; // isTouch && controller.selectedElementIds.size > 0;
    console.log("[debug multiselect]", { isTouch, inSet, additive, el: ev.elementId, sel: controller.selectedElementIds });

    /* ── toggle or single-select ─────────────────── */
    if (additive) {
      if (inSet) controller.selectedElementIds.delete(ev.elementId);
      else controller.selectedElementIds.add(ev.elementId);
    } else {
      controller.selectedElementIds.clear();
      controller.selectedElementIds.add(ev.elementId);
    }

    (controller.crdt as any).updateSelection?.(controller.selectedElementIds)

    controller.requestRender();
  }

  function clearSelection() {
    controller.clearSelection();
  }

  function spawnNewElementAtTap(_ctx: GestureContext, evt: GestureEvent) {
    const { x, y } = controller.screenToCanvas(evt.xy.x, evt.xy.y);
    controller.createNewElement(x, y, 'markdown', '');
  }

  function applyPinchElement(ctx: GestureContext, ev: GestureEvent) {
    const pts = Object.values(ev.active || {});
    if (pts.length !== 2) return;
    const [p1, p2] = pts;
    const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const factor = newDist / ctx.draft.startDist!;

    const el = controller.findElementById(ctx.draft.id!);
    if (!el) return;

    /* scale & move */
    // Update scale instead of width/height
    el.scale = ctx.draft.startScale! * factor;
    // Position still needs to be adjusted
    el.x = ctx.draft.center!.x + (ctx.draft.startCx! - ctx.draft.center!.x) * factor;
    el.y = ctx.draft.center!.y + (ctx.draft.startCy! - ctx.draft.center!.y) * factor;

    /* rotation */
    const a0 = ctx.draft.startAngle!;
    const a1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const startRotation = ctx.draft.rotate?.startRotation ?? 0;
    el.rotation = startRotation + ((a1 - a0) * 180 / Math.PI);

    controller.updateElementNode(controller.elementNodesMap[el.id], el, true);
  }

  function startTempLine(ctx: GestureContext, ev: GestureEvent) {

    const sourceEl = controller.findElementById(ev.elementId!);
    if (!sourceEl) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', '#888');
    line.setAttribute('stroke-width', '4');
    line.setAttribute('stroke-dasharray', '5 5');
    line.setAttribute('x1', String(sourceEl.x));
    line.setAttribute('y1', String(sourceEl.y));
    line.setAttribute('x2', String(sourceEl.x));
    line.setAttribute('y2', String(sourceEl.y));
    controller.edgesLayer.appendChild(line);
    ctx.draft.tempLine = line;
    ctx.draft.sourceId = ev.elementId;
    ctx.draft.start = ev.xy;
  }

  function applyEdgeDrag(ctx: GestureContext, ev: GestureEvent) {
    if (!ctx.draft.tempLine) return;
    const pt = controller.screenToCanvas(ev.xy.x, ev.xy.y);
    ctx.draft.tempLine.setAttribute('x2', String(pt.x));
    ctx.draft.tempLine.setAttribute('y2', String(pt.y));
  }

  function commitEdgeCreation(ctx: GestureContext, ev: GestureEvent) {
    if (!ctx.draft.tempLine) return;
    ctx.draft.tempLine.remove();
    const target = document.elementFromPoint(ev.xy.x, ev.xy.y)?.closest('.canvas-element') as HTMLElement | null;
    const tgtId = target?.dataset?.elId;
    if (tgtId && tgtId !== ctx.draft.sourceId) {
      controller.createNewEdge(ctx.draft.sourceId, tgtId, '');
      controller.requestRender();
      saveCanvas(controller.canvasState);
      controller._pushHistorySnapshot('Add edge');
    }
  }

  async function commitNodeCreation(ctx: GestureContext, ev: GestureEvent) {
    if (!ctx.draft.tempLine) return;
    ctx.draft.tempLine.remove();
    const pt = controller.screenToCanvas(ev.xy.x, ev.xy.y);
    const text = prompt('Enter label for the new element', '');
    if (!text) return;
    const elId = controller.createNewElement(pt.x, pt.y, 'markdown', 'generating…');
    controller.createNewEdge!(ctx.draft.sourceId!, elId, text);
    controller.requestRender();
    await generateContent?.(text, controller.findElementById(elId)!, controller);
  }

  function editEdgeLabel(_ctx: GestureContext, ev: GestureEvent) {
    const edgeId = ev.edgeId!;
    const edge = controller.findEdgeElementById!(edgeId);
    if (!edge) return;

    // Calculate the midpoint of the edge for better positioning
    const sourceEl = controller.findElementById(edge.source);
    const targetEl = controller.findElementById(edge.target);

    let pt;
    if (sourceEl && targetEl) {
      // Position the edit-prompt at the midpoint between source and target
      const sourceCenterX = sourceEl.x + (sourceEl.width * (sourceEl.scale || 1)) / 2;
      const sourceCenterY = sourceEl.y + (sourceEl.height * (sourceEl.scale || 1)) / 2;
      const targetCenterX = targetEl.x + (targetEl.width * (targetEl.scale || 1)) / 2;
      const targetCenterY = targetEl.y + (targetEl.height * (targetEl.scale || 1)) / 2;

      pt = {
        x: (sourceCenterX + targetCenterX) / 2,
        y: (sourceCenterY + targetCenterY) / 2
      };
    } else {
      // Fallback to click position if elements not found
      pt = controller.screenToCanvas(ev.xy.x, ev.xy.y);
    }

    const editId = controller.createNewElement(
      pt.x, pt.y, 'edit-prompt',
      edge.label || '',
      false,
      { target: edge.id, property: 'label' }
    );
    controller.createNewEdge!(editId, edge.id, 'Editing…', { meta: true });
    controller.requestRender();
  }

  function buildContextMenu(_ctx: GestureContext, ev: any) {
    if (ev.hitElement) {
      controller.buildContextMenu!(ev.elementId);
    } else {
      controller.buildContextMenu!();
    }
  }

  function showContextMenu(_c: GestureContext, e: GestureEvent) {
    controller.showContextMenu!(e.xy.x, e.xy.y)
  }
  function hideContextMenu(_c: GestureContext, _e: GestureEvent) {
    controller.hideContextMenu()
  }

  function openEditModal(_c: GestureContext, e: GestureEvent) {
    controller.openEditModal(controller.findElementById(e.elementId!)!)
  }

  return {
    editEdgeLabel,
    spawnNewElementAtTap,
    buildContextMenu,
    showContextMenu,
    hideContextMenu,
    openEditModal,

    /* canvas */
    applyCanvasPan,
    applyCanvasPinch,
    applyWheelZoom,
    persistViewState,

    /* single element */
    applyMoveElement,
    applyResizeElement,
    applyRotateElement,
    applyScaleElement,
    applyReorderElement,

    /* pinch */
    applyPinchElement,

    /* edges */
    startTempLine,
    applyEdgeDrag,
    commitEdgeCreation,
    commitNodeCreation,

    /* groups */
    applyGroupMove,
    applyGroupPinch,
    applyGroupResize,
    applyGroupScale,
    applyGroupRotate,

    /* selection */
    selectElement,
    clearSelection,

    /* lasso */
    applyLassoUpdate,
    commitLassoSelection,

    /* generic */
    commitElementMutation
  };
}
