/* ────────────────────────────────────────────────────────────────────────────
 *  Radial Menu for parc.land
 *  - context–sensitive launcher that replaces the old #mode toggle button
 * ---------------------------------------------------------------------------
 *  author: 2025-04-29
 * ---------------------------------------------------------------------------
 */
import { saveCanvas } from './storage.js';

/* keep just one instance alive */
let activeRoot = null;

/**
 * Install a radial menu that follows the lifetime of the supplied controller.
 * Calling it again with a different controller re-attaches the existing menu
 * (useful when drilling in/out of nested canvases).
 */
export function installRadialMenu(controller) {
  console.log("[RM] Install radial menu")
  /* ───── 1.  reuse or create shell ───────────────────────────────────────── */
  if (activeRoot) {
    /* controller was switched (drill-in/out) – just update reference */
    console.log("[RM] swap controller")
    activeRoot.__controller__ = controller;
    return;
  }

  /* inject style just once */
  if (!document.getElementById('radial-menu-style')) {
    const style = document.createElement('style');
    style.id = 'radial-menu-style';
    style.textContent = `:root{
  --menu-size:60px;--item-size:50px;--orbit-radius:100px;
  --primary-color:#2196F3;--transition-time:.35s;
  --ease:cubic-bezier(.22,.61,.36,1)}
.radial-menu{position:fixed;left:calc(100% - 80px);top:calc(100% - 80px);
  width:var(--menu-size);height:var(--menu-size);z-index:999}
.menu-trigger{width:100%;height:100%;border:none;border-radius:50%;
  background:var(--primary-color);color:#fff;font-size:1.4rem;cursor:pointer;
  position:relative;transition:transform var(--transition-time) var(--ease);
  touch-action:none}
.menu-trigger.active{transform:rotate(45deg)}
.menu-items{position:absolute;top:50%;left:50%;visibility:hidden;
  pointer-events:none}
.menu-items.active{visibility:visible;pointer-events:auto}
.menu-items.animating{pointer-events:none}
.menu-item{position:absolute;width:var(--item-size);height:var(--item-size);
  transform:translate(-50%,-50%) scale(0);border-radius:50%;background:#fff;
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 2px 5px rgba(0,0,0,.25);opacity:0;
  transition:transform var(--transition-time) var(--ease),
             opacity   var(--transition-time) var(--ease)}`;
    document.head.appendChild(style);
  }

  /* create DOM */
  const root = document.createElement('div');
  root.className = 'radial-menu';
  root.innerHTML = `
    <button class="menu-trigger" aria-label="open menu">
      <i class="fas fa-plus"></i>
    </button>
    <div class="menu-items"></div>`;
  root.__controller__ = controller;         // <-- keep reference here
  document.body.appendChild(root);
  console.log("[RM] create radial menu", root)
  activeRoot = root;

  /* ───── 2.  helpers & state ─────────────────────────────────────────────── */
  const trigger  = root.querySelector('.menu-trigger');
  const itemsBox = root.querySelector('.menu-items');

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const ORBIT = parseFloat(
    getComputedStyle(document.documentElement)
      .getPropertyValue('--orbit-radius')
  ) || 100;

  /* drag state (move the whole menu) */
  const drag = { active:false, sx:0, sy:0, sl:0, st:0 };

  /* rotate fan state */
  const rot  = { active:false, startA:0, startR:0 };
  let rotation = 0;

  /* navigation stack   stack[stack.length-1] === current level */
  let stack = [];

  /* ───── 3.  dynamic root-level menu – built from controller state ───────── */
  const makeRootItems = () => {
    const c = root.__controller__;
    /* helpers that need fresh controller reference */
    const addElement = (type) => {
      const x = window.innerWidth  / 2;
      const y = window.innerHeight / 2;
      const pt = c.screenToCanvas(x, y);
      c.createNewElement(pt.x, pt.y, type);
      closeRoot();
    };
    const zoom = (factor) => {
      c.viewState.scale = clamp(
        c.viewState.scale * factor,
        c.MIN_SCALE, c.MAX_SCALE
      );
      c.updateCanvasTransform();
      c.saveLocalViewState?.();
    };

    return [
      {
        label: c.mode === 'direct' ? 'Navigate' : 'Direct',
        icon : c.mode === 'direct' ? 'fa-arrows-alt' : 'fa-hand',
        action(){
          c.switchMode(c.mode === 'direct' ? 'navigate' : 'direct');
          /* rebuild menu so icon/label toggles */
          rebuildRoot();
        }
      },
      {
        label:'Add', icon:'fa-plus-circle', children:[
          { label:'Text',     icon:'fa-font',            action:()=>addElement('text') },
          { label:'Markdown', icon:'fa-brands fa-markdown',action:()=>addElement('markdown') },
          { label:'Image',    icon:'fa-image',           action:()=>addElement('img') },
          { label:'Canvas',   icon:'fa-object-group',    action:()=>addElement('canvas-container') }
        ]
      },
      {
        label:'Zoom', icon:'fa-search', children:[
          { label:'In',    icon:'fa-search-plus',  action:()=>zoom(1.25) },
          { label:'Out',   icon:'fa-search-minus', action:()=>zoom(0.8) },
          { label:'Reset', icon:'fa-compress',     action:()=>{zoom(1/ c.viewState.scale);} }
        ]
      },
      {
        label:'Save', icon:'fa-save',
        action(){ saveCanvas(c.canvasState); closeRoot(); }
      }
    ];
  };

  /* the root level is rebuilt on each open to reflect latest state */
  const rebuildRoot = () => { stack = [ { title:'root', items:makeRootItems() } ]; };

  /* ───── 4.  animation utilities ─────────────────────────────────────────── */
  const fly = (btn, x, y, show=true, delay=0) => {
    btn.style.transitionDelay = delay + 'ms';
    requestAnimationFrame(() => {
      btn.style.transform =
        `translate(-50%,-50%) translate(${x}px,${y}px) scale(${show?1:0})`;
      btn.style.opacity = show ? 1 : 0;
    });
  };

  /* ───── 5.  geometry layout of fan ─────────────────────────────────────── */
  const layoutItems = (instant=false) => {
    const r   = root.getBoundingClientRect();
    const sL  = r.left,
          sR  = innerWidth  - r.right,
          sT  = r.top,
          sB  = innerHeight - r.bottom;
    const hDir = (sL < sR) ? 1 : -1;        // open toward wider horizontal space
    const vDir = (sT < sB) ? 1 : -1;        // open toward wider vertical space
    const base   = Math.atan2(vDir, hDir);  // angle bisector
    const sweep  = Math.PI / 2;             // 90° fan
    const its    = [...itemsBox.children];
    const step   = its.length > 1 ? sweep / (its.length - 1) : 0;

    its.forEach((btn, i) => {
      const a = base - sweep/2 + i*step + rotation;
      const x = Math.cos(a) * ORBIT;
      const y = Math.sin(a) * ORBIT;

      if (instant) {
        btn.style.transition = 'none';
        btn.style.transform =
          `translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
        btn.style.opacity = 1;
        /* flush & restore transitions */
        void btn.offsetWidth;  btn.style.transition = '';
      } else {
        fly(btn, x, y, true, i*40);
      }
    });
  };

  /* ───── 6.  (re-)render a level ────────────────────────────────────────── */
  const render = (instant=false) => {
    const { items } = stack[stack.length - 1];
    itemsBox.innerHTML = '';

    items.forEach(it => {
      const btn = document.createElement('button');
      btn.className = 'menu-item';
      btn.ariaLabel = it.label;
      btn.innerHTML = `<i class="fas ${it.icon}"></i>`;
      /* rotation handle */
      btn.addEventListener('pointerdown', startRotateGesture);
      btn.addEventListener('click', () => handleItem(it, btn));
      itemsBox.appendChild(btn);
    });

    layoutItems(instant);
  };

  /*───── 7. open / close / back navigation & gestures ───────────────────── */
  /* drag whole menu ─────────────────────────────────────────────────────── */
  trigger.addEventListener('pointerdown', e => {
    if (trigger.classList.contains('active')) return;    // no drag while open
    drag.active = true;
    drag.sx = e.clientX; drag.sy = e.clientY;
    const r = root.getBoundingClientRect();
    drag.sl = r.left; drag.st = r.top;
    trigger.setPointerCapture(e.pointerId);
  });
  trigger.addEventListener('pointermove', e => {
    if (!drag.active) return;
    const dx = e.clientX - drag.sx,
          dy = e.clientY - drag.sy;
    const size = parseFloat(getComputedStyle(root).width);
    root.style.left = clamp(drag.sl + dx, 0, innerWidth  - size) + 'px';
    root.style.top  = clamp(drag.st + dy, 0, innerHeight - size) + 'px';
  });
  trigger.addEventListener('pointerup',   () => drag.active = false);
  trigger.addEventListener('pointercancel',() => drag.active = false);

  /* open / close / back ─────────────────────────────────────────────────── */
  trigger.addEventListener('click', e => {
    console.log("[RM] click", trigger, e)
    if (drag.active) { drag.active = false; return; } // ignore click finishing drag

    if (stack.length === 1) {
      /* root level */
      if (!itemsBox.classList.contains('active')) {
        /* opening */
        rebuildRoot();
        rotation = 0;
        itemsBox.classList.add('active');
        trigger.classList.add('active');
        render();
      } else {
        /* closing */
        closeRoot();
      }
    } else {
      /* back one level */
      stack.pop();
      const currentItems = [...itemsBox.children];
      currentItems.forEach((b, i) => fly(b, 0, 0, false, i * 30));

      itemsBox.classList.add('animating');
      const transitionTime = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--transition-time')
      ) * 1000 + currentItems.length * 30;

      setTimeout(() => {
        itemsBox.classList.remove('animating');
        trigger.querySelector('i').className = stack.length === 1 ? 'fas fa-plus' : 'fas fa-arrow-left';
        render();
      }, transitionTime);
    }
  });

  /* rotate fan (two fingers or click-drag on item) ───────────────────────── */
  function startRotateGesture(e) {
    if (!itemsBox.classList.contains('active') ||
        itemsBox.classList.contains('animating')) return;
    e.stopPropagation();
    rot.active = true;
    const cen = root.getBoundingClientRect();
    const cx  = cen.left + cen.width/2,
          cy  = cen.top  + cen.height/2;
    rot.startA = Math.atan2(e.clientY - cy, e.clientX - cx);
    rot.startR = rotation;
    itemsBox.setPointerCapture(e.pointerId);
  }
  itemsBox.addEventListener('pointermove', e => {
    if (!rot.active) return;
    const cen = root.getBoundingClientRect();
    const cx  = cen.left + cen.width/2,
          cy  = cen.top  + cen.height/2;
    const ang = Math.atan2(e.clientY - cy, e.clientX - cx);
    rotation  = rot.startR + (ang - rot.startA);
    layoutItems(true);            // immediate update
  });
  itemsBox.addEventListener('pointerup',   () => rot.active = false);
  itemsBox.addEventListener('pointercancel',() => rot.active = false);

  /* item click handler ──────────────────────────────────────────────────── */
  function handleItem(it, btn) {
    if (it.children) {
      /* dive into submenu */
      const others = [...itemsBox.children].filter(b => b !== btn);
      others.forEach(b => fly(b, 0, 0, false));
      fly(btn, 0, 0, true);
      itemsBox.classList.add('animating');
      btn.addEventListener('transitionend', function go(ev){
        if (ev.propertyName !== 'transform') return;
        btn.removeEventListener('transitionend', go);
        itemsBox.classList.remove('animating');
        stack.push({ title:it.label, items:it.children });
        trigger.querySelector('i').className = 'fas fa-arrow-left';
        rotation = 0;
        render();
      });
    } else if (typeof it.action === 'function') {
      console.log("[RM] action", it.label, it)
      it.action();
    }
  }

  /* close root helper ───────────────────────────────────────────────────── */
  function closeRoot() {
    if (!itemsBox.classList.contains('active')) return;
    const childs = [...itemsBox.children];
    childs.forEach((b, i) => fly(b, 0, 0, false, i*30));
    trigger.classList.remove('active');
    setTimeout(() => itemsBox.classList.remove('active'),
      parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--transition-time'))*1000 + childs.length*30);
  }

  /* ───── 8.  initial hidden build (so first open animates) ───────────────── */
  rebuildRoot();
  render(true);
}
