// ----------------------------------------------------------------------------
// Thin DOM ⇆ FSM bridge.
// Converts native pointer / wheel events into *pure* FSM events.
// ----------------------------------------------------------------------------
export function installPointerAdapter(
  rootEl: HTMLElement,
  service: any,
  getViewState: () => any,
  selected: () => Set<string> = () => new Set()
): () => void {

  const active = new Map<number, { x: number; y: number }>(); // pointerId → {x,y}
  const capturedTargets = new Map<number, Element>(); // pointerId → element that we called setPointerCapture on

  let lastTap: { t: number; x: number; y: number } = { t: 0, x: 0, y: 0 };
  const TAP_MS = 300;
  const TAP_DIST = 10;

  const classifyHandle = (node: Element | null): string | null => {
    if (!node) return null;
    if (node.id === 'group-box') return null;         // click on the bbox itself
    if (node.closest('#group-box')) {
      if (node.classList.contains('resize-handle')) return 'resize';
      if (node.classList.contains('rotate-handle')) return 'rotate';
      if (node.classList.contains('scale-handle')) return 'scale';
    }
    if (node.classList.contains('resize-handle')) return 'resize';
    if (node.classList.contains('scale-handle')) return 'scale';
    if (node.classList.contains('rotate-handle')) return 'rotate';
    if (node.classList.contains('reorder-handle')) return 'reorder';
    if (node.classList.contains('edge-handle')) return 'edge';
    if (node.classList.contains('create-handle')) return 'createNode';
    if (node.classList.contains('type-handle')) return 'type';

    return null;
  };

  const send = (type: string, ev: PointerEvent | WheelEvent | KeyboardEvent, extra: Record<string, any> = {}): void => {
    const xy = { x: (ev as any).clientX || 0, y: (ev as any).clientY || 0 };
    const elementNode = (ev.target as Element)?.closest('.canvas-element');
    const handleNode = (ev.target as Element)?.closest('.element-handle');
    const edgeLabelNode = (ev.target as Element)?.closest('text[data-id]');

    const payload = {
      type,
      xy,
      active: Object.fromEntries(active),
      hitElement: !!elementNode,
      elementId: elementNode ? (elementNode as HTMLElement).dataset.elId : null,
      handle: classifyHandle(handleNode),
      edgeLabel: !!edgeLabelNode,
      edgeId: edgeLabelNode ? (edgeLabelNode as HTMLElement).dataset.id : null,
      selected: selected(),
      view: getViewState(),
      ev, // raw DOM event
      ...extra
    };
    if (payload.type !== 'POINTER_MOVE') console.log("[FSM] Pointer adapter event send:", active.size, ev.pointerId, payload)
    service.send(payload);
  };

  const onPointerDown = (ev: PointerEvent): void => {
    ev.preventDefault();
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const handleNode = (ev.target as Element)?.closest('.element-handle');
    const edgeLabelNode = (ev.target as Element)?.closest('text[data-id]');
    const elementNode = (ev.target as Element)?.closest('.canvas-element');
    const captureNode = (handleNode
      || edgeLabelNode
      || elementNode
      || rootEl) as Element;

    // 3) capture on that node and store it
    captureNode.setPointerCapture(ev.pointerId);
    capturedTargets.set(ev.pointerId, captureNode);

    (ev.target as Element).setPointerCapture(ev.pointerId);
    send('POINTER_DOWN', ev);
    startLongPress(ev);

  };

  /* — LONG-PRESS helper — */
  let lpTimer: ReturnType<typeof setTimeout> | null = null;
  const LP_DELAY = 600;                     // ms
  function startLongPress(ev: PointerEvent): void {
    lpTimer = setTimeout(() => {
      send('LONG_PRESS', ev);                // new pure FSM event
      lpTimer = null;
    }, LP_DELAY);
  }
  function cancelLongPress(): void { if (lpTimer) clearTimeout(lpTimer); lpTimer = null; }

  const onPointerMove = (ev: PointerEvent): void => {
    if (!active.has(ev.pointerId)) return;
    active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    cancelLongPress();
    send('POINTER_MOVE', ev);
  };
  const finishPointer = (ev: PointerEvent): void => {
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
  const onWheel = (ev: WheelEvent): void => send('WHEEL', ev, { deltaY: ev.deltaY });
  const onKeyup = (ev: KeyboardEvent): void => {
    console.log("[PointerAdapter] keyup", ev)
    send('KEYUP', ev, { key: ev.key });
  }
  const onKeydown = (ev: KeyboardEvent): void => {
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
