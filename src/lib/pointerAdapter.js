// ----------------------------------------------------------------------------
// Thin DOM ⇆ FSM bridge.
// Converts native pointer / wheel events into *pure* FSM events.
// ----------------------------------------------------------------------------
export function installPointerAdapter(
  rootEl,
  service,
  getViewState,
  isGroupSelected = () => false
) {
  /* ---------------------------------------------------------- */
  /* internals                                                  */
  /* ---------------------------------------------------------- */
  const active = new Map();                 // pointerId → {x,y}
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
    return null;
  };

  const send = (type, ev, extra = {}) => {
    const xy = { x: ev.clientX, y: ev.clientY };
    const elementNode = ev.target.closest('.canvas-element');
    const handleNode = ev.target.closest('.element-handle');
    const edgeLabelNode = ev.target.closest('text[data-id]');

    service.send({
      type,
      xy,
      active: Object.fromEntries(active),
      hitElement: !!elementNode,
      elementId: elementNode ? elementNode.dataset.elId : null,
      handle: classifyHandle(handleNode),
      edgeLabel: !!edgeLabelNode,
      edgeId: edgeLabelNode ? edgeLabelNode.dataset.id : null,
      groupSelected: isGroupSelected(),
      view: getViewState(),
      ev, // raw DOM event
      ...extra
    });
  };

  /* ---------------------------------------------------------- */
  /* pointer stream                                             */
  /* ---------------------------------------------------------- */
  const onPointerDown = (ev) => {
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    send('POINTER_DOWN', ev);
  };
  const onPointerMove = (ev) => {
    if (!active.has(ev.pointerId)) return;
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    send('POINTER_MOVE', ev);
  };
  const finishPointer = (ev) => {
    active.delete(ev.pointerId);
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

  /* listeners */
  rootEl.addEventListener('pointerdown', onPointerDown, { passive: true });
  rootEl.addEventListener('pointermove', onPointerMove, { passive: true });
  rootEl.addEventListener('pointerup', finishPointer, { passive: true });
  rootEl.addEventListener('pointercancel', finishPointer, { passive: true });
  rootEl.addEventListener('wheel', onWheel, { passive: true });

  /* teardown helper */
  return () => {
    rootEl.removeEventListener('pointerdown', onPointerDown);
    rootEl.removeEventListener('pointermove', onPointerMove);
    rootEl.removeEventListener('pointerup', finishPointer);
    rootEl.removeEventListener('pointercancel', finishPointer);
    rootEl.removeEventListener('wheel', onWheel);
  };
}
