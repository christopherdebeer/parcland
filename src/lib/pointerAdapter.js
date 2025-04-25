// Thin DOM ⇄ FSM bridge.
// Keeps an `active` map of live pointers, turns DOM events into
//   {type:'POINTER_*', active:{}, xy:{x,y}, hitElement:Boolean, elementId?, view:{}, ev }
import { screenToCanvas } from './screenUtils';  // helper you already have

export function installPointerAdapter(rootEl, service, getViewState) {

  const active = new Map();         // pointerId ➜ {x,y}

  /** helper to emit */
  const send = (type, ev) => {
    const xy = { x: ev.clientX, y: ev.clientY };
    const hit = ev.target.closest('.canvas-element');
    service.send({
      type,
      xy,
      active: Object.fromEntries(active),
      hitElement: !!hit,
      elementId: hit ? hit.dataset.elId : null,
      view: getViewState(),
      ev               // raw event (never used inside machine, just for future)
    });
  };

  rootEl.addEventListener('pointerdown', ev => {
    active.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    send('POINTER_DOWN', ev);
  });

  rootEl.addEventListener('pointermove', ev => {
    if (active.has(ev.pointerId)) {
      active.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
      send('POINTER_MOVE', ev);
    }
  });

  const finish = ev => {
    active.delete(ev.pointerId);
    send('POINTER_UP', ev);
  };
  rootEl.addEventListener('pointerup', finish);
  rootEl.addEventListener('pointercancel', finish);

  /* Wheel → service (for zoom-scroll) */
  rootEl.addEventListener('wheel', ev => {
    send('WHEEL', ev);
  }, { passive:true });
}
