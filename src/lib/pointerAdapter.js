// ----------------------------------------------------------------------------
// Thin DOM ⇆ FSM bridge.
// Converts native pointer / wheel events into *pure* FSM events.
// ----------------------------------------------------------------------------
export function installPointerAdapter(
  rootEl,
  service,
  getViewState,
  selected = () => new Set()
) {

  const active = new Map(); // pointerId → {x,y}
  const capturedTargets = new Map(); // pointerId → element that we called setPointerCapture on

  let lastTap = { t: 0, x: 0, y: 0 };
  const TAP_MS = 300;
  const TAP_DIST = 10;

  const classifyHandle = (node) => {
    if (!node) return null;
    if (node.classList.contains('resize-handle')) return 'resize';
    if (node.classList.contains('scale-handle')) return 'scale';
    if (node.classList.contains('rotate-handle')) return 'rotate';
    if (node.classList.contains('reorder-handle')) return 'reorder';
    if (node.classList.contains('edge-handle')) return 'edge';
    if (node.classList.contains('create-handle')) return 'createNode';
    if (node.classList.contains('type-handle')) return 'type';
    return null;
  };

  const send = (type, ev, extra = {}) => {
    const xy = { x: ev.clientX, y: ev.clientY };
    const elementNode = ev.target.closest('.canvas-element');
    const handleNode = ev.target.closest('.element-handle');
    const edgeLabelNode = ev.target.closest('text[data-id]');

    const payload = {
      type,
      xy,
      active: Object.fromEntries(active),
      hitElement: !!elementNode,
      elementId: elementNode ? elementNode.dataset.elId : null,
      handle: classifyHandle(handleNode),
      edgeLabel: !!edgeLabelNode,
      edgeId: edgeLabelNode ? edgeLabelNode.dataset.id : null,
      selected: selected(),
      view: getViewState(),
      ev, // raw DOM event
      ...extra
    }
    if (payload.type !== 'POINTER_MOVE') console.log("[FSM] Pointer adapter event send:", payload)
    service.send(payload);
  };

  const onPointerDown = (ev) => {
    ev.preventDefault();
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const handleNode = ev.target.closest('.element-handle');
    const edgeLabelNode = ev.target.closest('text[data-id]');
    const elementNode = ev.target.closest('.canvas-element');
    const captureNode = handleNode
      || edgeLabelNode
      || elementNode
      || rootEl;

    // 3) capture on that node and store it
    captureNode.setPointerCapture(ev.pointerId);
    capturedTargets.set(ev.pointerId, captureNode);

    ev.target.setPointerCapture(ev.pointerId);
    send('POINTER_DOWN', ev);
    startLongPress(ev);

  };

  /* — LONG-PRESS helper — */
  let lpTimer = null;
  const LP_DELAY = 600;                     // ms
  function startLongPress(ev) {
    lpTimer = setTimeout(() => {
      send('LONG_PRESS', ev);                // new pure FSM event
      lpTimer = null;
    }, LP_DELAY);
  }
  function cancelLongPress() { clearTimeout(lpTimer); lpTimer = null; }

  const onPointerMove = (ev) => {
    if (!active.has(ev.pointerId)) return;
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    cancelLongPress();
    send('POINTER_MOVE', ev);
  };
  const finishPointer = (ev) => {
    ev.preventDefault();
    cancelLongPress();
    active.delete(ev.pointerId);
    // release capture on whichever node we grabbed
    const capNode = capturedTargets.get(ev.pointerId) || rootEl;
    capNode.releasePointerCapture(ev.pointerId);
    capturedTargets.delete(ev.pointerId);

    send('POINTER_UP', ev);

    /*  tap / double-tap detection  */
    if (ev.button === 0) {
      const dt = ev.timeStamp - lastTap.t;
      const dist = Math.hypot(ev.clientX - lastTap.x, ev.clientY - lastTap.y);
      if (dt < TAP_MS && dist < TAP_DIST) {
        send('DOUBLE_TAP', ev);
        lastTap.t = 0; // reset
      } else {
        lastTap = { t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
      }
    }
  };
  const onWheel = (ev) => send('WHEEL', ev, { deltaY: ev.deltaY });
  const onKeyup = (ev) => {
    console.log("[PointerAdapter] keyup", ev)
    send('KEYUP', ev, { key: ev.key });
  }
  const onKeydown = (ev) => {
    console.log("[PointerAdapter] keydown", ev)
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) service.state.context.controller.redo();
      else service.state.context.controller.undo();
      return;           // don’t forward to FSM
    }

    send('KEYDOWN', ev, { key: ev.key });
  }


  /* listeners */
  rootEl.addEventListener('pointerdown', onPointerDown, { passive: false });
  rootEl.addEventListener('pointermove', onPointerMove, { passive: true });
  rootEl.addEventListener('pointerup', finishPointer, { passive: false });
  rootEl.addEventListener('pointercancel', finishPointer, { passive: true });
  rootEl.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('keydown', onKeydown, { passive: true });
  window.addEventListener('keyup', onKeyup, { passive: true });

  /* teardown helper */
  return () => {
    rootEl.removeEventListener('pointerdown', onPointerDown);
    rootEl.removeEventListener('pointermove', onPointerMove);
    rootEl.removeEventListener('pointerup', finishPointer);
    rootEl.removeEventListener('pointercancel', finishPointer);
    rootEl.removeEventListener('wheel', onWheel);
    window.removeEventListener('keydown', onKeydown);
    window.removeEventListener('keyup', onKeyup);
  };
}
