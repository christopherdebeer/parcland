// Thin DOM ⇄ FSM bridge.
// Turns raw DOM pointer / wheel events into clean XState events with the data
// that the gestureMachine’s guards expect.
//
// installPointerAdapter(rootEl, fsmService, {
//      getViewState,                    // () → {scale, translateX, …}
//      screenToCanvas,                  // (clientX,clientY) → {x,y}
//      isGroupSelected = () => false    // () → Boolean      (optional)
// });

export function installPointerAdapter(
  rootEl,
  service,
  { getViewState, screenToCanvas, isGroupSelected = () => false }
) {

  /* live map of active pointers ➜ {pointerId:{x,y}} */
  const active = new Map();

  /* identify which kind of handle (if any) was pressed */
  const classifyHandle = target => {
    if (!target) return null;
    if (target.closest('.resize-handle'))  return 'resize';
    if (target.closest('.scale-handle'))   return 'scale';
    if (target.closest('.rotate-handle'))  return 'rotate';
    if (target.closest('.reorder-handle')) return 'reorder';
    if (target.closest('.edge-handle'))    return 'edge';
    if (target.closest('.create-handle'))  return 'create';
    return null;
  };

  const send = (type, ev) => {
    const xy  = { x: ev.clientX, y: ev.clientY };
    const hit = ev.target.closest('.canvas-element');

    service.send({
      type,
      xy,
      active       : Object.fromEntries(active),
      hitElement   : !!hit,
      elementId    : hit ? hit.dataset.elId : null,
      handle       : classifyHandle(ev.target),      //  ← new
      groupSelected: isGroupSelected(),              //  ← new
      view         : getViewState(),
      ev                                               // raw DOM event (never
    });
  };

  /* ------------------------------------------------------------------ */
  /*  Pointer events                                                    */
  /* ------------------------------------------------------------------ */
  rootEl.addEventListener('pointerdown', ev => {
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    send('POINTER_DOWN', ev);
  });

  rootEl.addEventListener('pointermove', ev => {
    if (active.has(ev.pointerId)) {
      active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      send('POINTER_MOVE', ev);
    }
  });

  const finish = ev => {
    active.delete(ev.pointerId);
    send('POINTER_UP', ev);
  };
  rootEl.addEventListener('pointerup',     finish);
  rootEl.addEventListener('pointercancel', finish);

  /* ------------------------------------------------------------------ */
  /*  Wheel / track-pad zoom                                            */
  /* ------------------------------------------------------------------ */
  rootEl.addEventListener(
    'wheel',
    ev => {
      // Prevent native page-scroll unless user is inside scrollable content
      if (!ev.ctrlKey) ev.preventDefault();
      send('WHEEL', ev);
    },
    { passive: false }
  );

  return () => {
    /* uninstall callback returned to the caller */
    rootEl.replaceWith(rootEl.cloneNode(true));
  };
}
