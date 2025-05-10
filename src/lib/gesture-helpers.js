/**
 * CanvasController-aware helpers that *mutate model objects* but never touch
 * the DOM outside controller methods.  They are injected into gestureMachine
 * as XState actions.
 */
import { saveCanvas } from './storage.js';
import { generateContent } from './generation.js';

export function createGestureHelpers(controller) {

  const dpi = () => controller.viewState.scale || 1;     // “device-pixels” ⇄ canvas

  function commitElementMutation() {
    controller.requestRender();
    saveCanvas(controller.canvasState);
    controller._pushHistorySnapshot('Element change');
  }
  function persistViewState() {
    controller.saveLocalViewState();
    // controller._pushHistorySnapshot('View change');
  }

  function applyCanvasPan(ctx, ev) {
    if (!ctx.draft.start || !ctx.draft.view) return;
    const dx = ev.xy.x - ctx.draft.start.x;
    const dy = ev.xy.y - ctx.draft.start.y;
    controller.viewState.translateX = ctx.draft.view.translateX + dx;
    controller.viewState.translateY = ctx.draft.view.translateY + dy;
    controller.updateCanvasTransform();
  }

  function applyCanvasPinch(ctx, ev) {
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

  function applyWheelZoom(_ctx, ev) {
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
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyResizeElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    if (!el || el.static) return;
    const dx = (ev.xy.x - ctx.draft.resize.startX) / dpi();
    const dy = (ev.xy.y - ctx.draft.resize.startY) / dpi();
    el.width = Math.max(20, ctx.draft.resize.startW + dx);
    el.height = Math.max(20, ctx.draft.resize.startH + dy);
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

  function applyRotateElement(ctx, ev) {
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

  function applyScaleElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    if (!el) return;
    const sensitivity = 0.01;
    const dx = (ev.xy.x - ctx.draft.origin.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin.y) / dpi();
    // Calculate a scale factor based on the distance moved
    const scaleFactor = 1 + (dx + dy) * sensitivity;
    // Apply the scale factor to the initial scale
    el.scale = Math.max(ctx.draft.startScale * scaleFactor, 0.2);
    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyReorderElement(ctx, ev) {
    const el = controller.findElementById(ev.elementId);
    if (!el) return;
    const dx = (ev.xy.x - ctx.draft.origin.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin.y) / dpi();
    const len = Math.hypot(dx, dy);
    el.zIndex = len * 0.1;
    controller.updateElementNode(
      controller.elementNodesMap[el.id],
      el,
      controller.isElementSelected(el.id),
      true
    );
  }

  function applyGroupMove(ctx, ev) {
    const dx = (ev.xy.x - ctx.draft.origin.x) / dpi();
    const dy = (ev.xy.y - ctx.draft.origin.y) / dpi();
    controller.selectedElementIds.forEach(id => {
      const el = controller.findElementById(id);
      const start = ctx.draft.startPositions.get(id);
      el.x = start.x + dx;
      el.y = start.y + dy;
    });
    controller.requestRender();
  }

  function applyGroupPinch(ctx, ev){
  const pts = Object.values(ev.active||{});
  if(pts.length!==2) return;
  const [p1,p2] = pts;
  const newDist  = Math.hypot(p2.x-p1.x, p2.y-p1.y);
  const distFac  = newDist / ctx.draft.startDist;

/* NEW – rotation */
  const a0 = ctx.draft.startAngle;
  const a1 = Math.atan2(p2.y-p1.y , p2.x-p1.x);
  const dθ = (a1 - a0) * 180/Math.PI;

  const bbox = ctx.draft.bboxCenter;
  controller.selectedElementIds.forEach(id=>{
    const el    = controller.findElementById(id);
    const start = ctx.draft.startPositions.get(id);
    el.scale    = start.scale * distFac;
    el.rotation = (start.rotation||0) + dθ;
    el.x        = bbox.cx + (start.x-bbox.cx)*distFac;
    el.y        = bbox.cy + (start.y-bbox.cy)*distFac;
  });
  controller.requestRender();
}

  function applyLassoUpdate(ctx, ev) {
    controller.updateSelectionBox(
      ctx.draft.start.x, ctx.draft.start.y,
      ev.xy.x, ev.xy.y
    );
  }
  function commitLassoSelection(ctx, ev) {
    const { start } = ctx.draft;
    const { x: sx, y: sy } = start;
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
      controller.switchMode('navigate');
    }
  }

  function selectElement(_ctx, ev){
  if(!ev.elementId) return;
  const already = controller.selectedElementIds.has(ev.elementId);
  const additiveTap = ev.ev.pointerType==='touch';   // treats 2nd tap as toggle

  if(already && additiveTap){
    controller.selectedElementIds.delete(ev.elementId);   // deselect
  }else if(additiveTap){
    controller.selectedElementIds.add(ev.elementId);      // add
  }else{
    controller.selectedElementIds.clear();
    controller.selectedElementIds.add(ev.elementId);      // normal single select
  }
  controller.requestRender();
}

  function clearSelection() {
    controller.clearSelection();
  }

  function spawnNewElementAtTap(ctx, evt) {
    const { x, y } = controller.screenToCanvas(evt.xy.x, evt.xy.y);
    controller.createNewElement(x, y, 'markdown');
  }

  function applyPinchElement(ctx, ev) {
    const pts = Object.values(ev.active || {});
    if (pts.length !== 2) return;
    const [p1, p2] = pts;
    const newDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const factor = newDist / ctx.draft.startDist;

    const el = controller.findElementById(ctx.draft.id);
    if (!el) return;

    /* scale & move */
    // Update scale instead of width/height
    el.scale = ctx.draft.startScale * factor;
    // Position still needs to be adjusted
    el.x = ctx.draft.center.x + (ctx.draft.startCx - ctx.draft.center.x) * factor;
    el.y = ctx.draft.center.y + (ctx.draft.startCy - ctx.draft.center.y) * factor;

    /* rotation */
    const a0 = ctx.draft.startAngle;
    const a1 = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    el.rotation = ctx.draft.startRotation + ((a1 - a0) * 180 / Math.PI);

    controller.updateElementNode(controller.elementNodesMap[el.id], el, true);
  }

  function startTempLine(ctx, ev) {

    const sourceEl = controller.findElementById(ev.elementId);
    if (!sourceEl) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('stroke', '#888');
    line.setAttribute('stroke-width', '4');
    line.setAttribute('stroke-dasharray', '5 5');
    line.setAttribute('x1', sourceEl.x);
    line.setAttribute('y1', sourceEl.y);
    line.setAttribute('x2', sourceEl.x);
    line.setAttribute('y2', sourceEl.y);
    controller.edgesLayer.appendChild(line);
    ctx.draft.tempLine = line;
    ctx.draft.sourceId = ev.elementId;
    ctx.draft.start = ev.xy;
  }

  function applyEdgeDrag(ctx, ev) {
    if (!ctx.draft.tempLine) return;
    const pt = controller.screenToCanvas(ev.xy.x, ev.xy.y);
    ctx.draft.tempLine.setAttribute('x2', pt.x);
    ctx.draft.tempLine.setAttribute('y2', pt.y);
  }

  function commitEdgeCreation(ctx, ev) {
    if (!ctx.draft.tempLine) return;
    ctx.draft.tempLine.remove();
    const target = document.elementFromPoint(ev.xy.x, ev.xy.y)?.closest('.canvas-element');
    const tgtId = target && target.dataset.elId;
    if (tgtId && tgtId !== ctx.draft.sourceId) {
      controller.createNewEdge(ctx.draft.sourceId, tgtId, '');
      controller.requestRender();
      saveCanvas(controller.canvasState);
      controller._pushHistorySnapshot('Add edge');
    }
  }

  async function commitNodeCreation(ctx, ev) {
    if (!ctx.draft.tempLine) return;
    ctx.draft.tempLine.remove();
    const pt = controller.screenToCanvas(ev.xy.x, ev.xy.y);
    const text = prompt('Enter label for the new element', '');
    if (!text) return;
    const elId = controller.createNewElement(pt.x, pt.y, 'markdown', 'generating…');
    controller.createNewEdge(ctx.draft.sourceId, elId, text);
    controller.requestRender();
    await generateContent?.(text, controller.findElementById(elId), controller);
  }

  function editEdgeLabel(ctx, ev) {
    const edgeId = ev.edgeId;
    const screenXY = ev.xy
    const edge = controller.findEdgeElementById(edgeId);
    if (!edge) return;
    const pt = controller.screenToCanvas(screenXY.x, screenXY.y);
    const editId = controller.createNewElement(
      pt.x, pt.y, 'edit-prompt',
      edge.label || '',
      false,
      { target: edge.id, property: 'label' }
    );
    controller.createNewEdge(editId, edge.id, 'Editing…', { meta: true });
    controller.requestRender();
  }

  function buildContextMenu(ctx, ev) {
    if (ev.hitElement) {
      controller.buildContextMenu(ev.elementId);
    } else {
      controller.buildContextMenu();
    }
  }

  function showContextMenu(c, e) {
    controller.showContextMenu(e.xy.x, e.xy.y)
  }
  function hideContextMenu(c, _e) {
    controller.hideContextMenu()
  }

  function openEditModal(c, e) {
    controller.openEditModal(controller.findElementById(e.elementId))
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
