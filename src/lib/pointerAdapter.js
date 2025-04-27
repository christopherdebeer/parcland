// Thin DOM ⇄ FSM bridge.
// Adds capture-phase listeners so `stopPropagation()` inside the app
// can’t block us, and annotates events with `handle` for element-handles.

export function installPointerAdapter(rootEl, service, getViewState /*, screenToCanvas */) {

  /* -------------------------------------------------------- helpers */
  const active = new Map();               // pointerId ➜ {x,y}

  const identifyHandle = (target) => {
    const h = target.closest('.element-handle');
    if (!h) return null;
    if (h.classList.contains('resize-handle'))   return 'resize';
    if (h.classList.contains('scale-handle'))    return 'scale';
    if (h.classList.contains('rotate-handle'))   return 'rotate';
    if (h.classList.contains('reorder-handle'))  return 'reorder';
    if (h.classList.contains('edge-handle'))     return 'createEdge';
    if (h.classList.contains('create-handle'))   return 'createNode';
    return null;
  };

  const send = (type, ev) => {
    const xy  = { x: ev.clientX, y: ev.clientY };
    const hit = ev.target.closest('.canvas-element');

    service.send({
      type,
      xy,
      active : Object.fromEntries(active),
      hitElement : !!hit,
      elementId  : hit ? hit.dataset.elId : null,
      handle     : identifyHandle(ev.target),
      view       : getViewState(),
      ev         : ev                // raw DOM event – ignored by the FSM
    });
  };

  /* -------------------------------------------------------- listeners */
  const onDown = ev => { active.set(ev.pointerId, {x:ev.clientX, y:ev.clientY}); send('POINTER_DOWN', ev); };
  const onMove = ev => {
    if (active.has(ev.pointerId)) {
      active.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
      send('POINTER_MOVE', ev);
    }
  };
  const onUpCancel = ev => { active.delete(ev.pointerId); send('POINTER_UP', ev); };

  rootEl.addEventListener('pointerdown',   onDown,    { capture:true, passive:false });
  rootEl.addEventListener('pointermove',   onMove,    { capture:true, passive:false });
  rootEl.addEventListener('pointerup',     onUpCancel,{ capture:true, passive:false });
  rootEl.addEventListener('pointercancel', onUpCancel,{ capture:true, passive:false });

  const onWheel = ev => send('WHEEL', ev);
  rootEl.addEventListener('wheel', onWheel, { capture:true, passive:true });

  /* ------------- return un-installer so CanvasController can clean up */
  return () => {
    rootEl.removeEventListener('pointerdown',   onDown,    true);
    rootEl.removeEventListener('pointermove',   onMove,    true);
    rootEl.removeEventListener('pointerup',     onUpCancel,true);
    rootEl.removeEventListener('pointercancel', onUpCancel,true);
    rootEl.removeEventListener('wheel',         onWheel,   true);
  };
}
