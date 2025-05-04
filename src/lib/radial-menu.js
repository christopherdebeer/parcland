/* ────────────────────────────────────────────────────────────────────────────
 *  radial-menu.js                         (2025-05-04)
 *  Core engine: trigger button, fan layout, animation, keyboard & drag.
 *
 *  EXTERNAL DEPENDENCY:
 *    import { buildRootItems } from './radial-menu-items.js'
 *  All application-specific actions live in that file – this one stays generic.
 *
 *  The only globals it touches are `window`, `document`, `localStorage`
 *  and `innerWidth/innerHeight`.
 *  ───────────────────────────────────────────────────────────────────────── */

import { buildRootItems } from './radial-menu-items.js';

/* ─── persistent config helpers ─────────────────────────────────────────── */
const LS_POS_KEY = 'parc.radialMenu.pos';
const LS_CFG_KEY = 'parc.radialMenu.cfg';
const loadCfg  = () => JSON.parse(localStorage.getItem(LS_CFG_KEY) || '{}');
const saveCfg  = cfg => localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg));

/* ─── default cfg  (overridden by persisted + caller options) ───────────── */
function createCfg(opts = {}) {
  return {
    menuSize      : 68,
    itemSize      : 56,
    orbitRadius   : 110,   // *minimum* radius we tolerate
    transitionTime: .35,   // s
    ease          : 'cubic-bezier(.22,.61,.36,1)',
    fullCircle    : false, // start in arc mode
    ...loadCfg(),
    ...opts
  };
}

/* MARGIN = half item + 6 px breathing room around the viewport  */
const MARGIN = cfg=> cfg.itemSize/2 + 6;
const DEG  = Math.PI/180;
const TAU  = Math.PI*2;

/* ─── CSS custom-props injected once  ───────────────────────────────────── */
function applyCssVars(cfg){
  let s = document.getElementById('radial-menu-style');
  if(!s){ s=document.createElement('style'); s.id='radial-menu-style';
          document.head.appendChild(s);}
  s.textContent = `
    :root{
      --menu-size:${cfg.menuSize}px;
      --item-size:${cfg.itemSize}px;
      --orbit-radius:${cfg.orbitRadius}px;
      --transition-time:${cfg.transitionTime}s;
      --ease:${cfg.ease};
      --primary-color:#2196F3;
    }
    .radial-menu{position:fixed;width:var(--menu-size);height:var(--menu-size);z-index:999}
    .menu-trigger{width:100%;height:100%;border:none;border-radius:50%;
      background:var(--primary-color);color:#fff;font-size:1.4rem;cursor:pointer;
      position:relative;transition:transform var(--transition-time) var(--ease);outline:none}
    .menu-trigger.active{transform:rotate(45deg)}
    .menu-items{position:absolute;top:50%;left:50%;visibility:hidden;pointer-events:none}
    .menu-items.active{visibility:visible;pointer-events:auto}
    .menu-items.animating{pointer-events:none}
    .menu-item{position:absolute;width:var(--item-size);height:var(--item-size);
      transform:translate(-50%,-50%) scale(0);border-radius:50%;display:flex;
      align-items:center;justify-content:center;box-shadow:0 2px 5px rgba(0,0,0,.25);
      opacity:0;cursor:pointer;border:none;font-size:1.2rem;outline:none;
      transition:transform var(--transition-time) var(--ease),
                 opacity   var(--transition-time) var(--ease)}
    .menu-item.leaf   {background:#fff;}
    .menu-item.parent {background:#f5f5f5;border:2px solid var(--primary-color);}
    .menu-item.parent i::after{content:'›';position:absolute;right:4px;bottom:4px;
      font-size:.6em;opacity:.6}
    .menu-item:focus{box-shadow:0 0 0 3px rgba(33,150,243,.5)}
    .menu-item i{pointer-events:none}
    .item-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);
      font-size:.75rem;color:#fff;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:3px;
      white-space:nowrap;opacity:0;transition:opacity .2s var(--ease)}
    .menu-item .item-label{opacity:1}`;
}

/* keep single instance across drill-ins ---------------------------------- */
let activeRoot = null;

/* ──────────────────────────────────────────────────────────────────────────
 *  Core exported function
 * ───────────────────────────────────────────────────────────────────────── */
export function installRadialMenu(controller, opts={}) {

  /* reuse shell if it already exists (drill-in/out) */
  if(activeRoot){
    activeRoot.__controller__ = controller;
    controller.__rm_relayout  = () => layoutItems(true);
    return;
  }

  /* cfg & CSS ------------------------------------------------------------- */
  const cfg = createCfg(opts);
  applyCssVars(cfg);

  /* ── DOM shell ---------------------------------------------------------- */
  const root = document.createElement('div');
  root.className='radial-menu';
  root.innerHTML=`
    <button class="menu-trigger" aria-expanded="false" aria-haspopup="menu">
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
    <div class="menu-items" role="menu"></div>`;
  document.body.appendChild(root);
  activeRoot = root;

  /* restore position */
  const pos = JSON.parse(localStorage.getItem(LS_POS_KEY)||'null');
  if(pos){ root.style.left=pos.x+'px'; root.style.top=pos.y+'px';}
  else{
    root.style.left=`calc(100% - ${cfg.menuSize+20}px)`;
    root.style.top =`calc(100% - ${cfg.menuSize+20}px)`;
  }

  /* wire globals into controller ----------------------------------------- */
  root.__controller__        = controller;
  controller.__rm_relayout   = ()=>layoutItems(true);

  /* local shorthands ------------------------------------------------------ */
  const trigger  = root.querySelector('.menu-trigger');
  const itemsBox = root.querySelector('.menu-items');
  const gapLin   = cfg.itemSize * 1.2;            // minimum centre-to-centre px

  // ↓←─ here we initialize drag.active as 0 (not `false`)
  const drag     = { active: 0, sx: 0, sy: 0, sl: 0, st: 0 };

  /* ───────────────────────────────────────────────────────────────────────
   *  Geometry helpers
   * ───────────────────────────────────────────────────────────────────── */

  /** returns true if the rectangle of an item centred at (x,y) is fully inside viewport */
  const fits = (x,y)=>
      x > MARGIN(cfg) && x < innerWidth - MARGIN(cfg) &&
      y > MARGIN(cfg) && y < innerHeight - MARGIN(cfg);

  /** produce visible angular intervals (start,end) for a particular radius */
  function visibleIntervals(cx,cy,r){
    /* 1 sample every degree -> boolean mask */
    const ok = new Uint8Array(360);
    for(let d=0; d<360; d++){
      const rad = d*DEG;
      ok[d] = fits(cx + Math.cos(rad)*r, cy + Math.sin(rad)*r) ? 1 : 0;
    }
    /* glue 359→0 wrap */
    if(ok[0] && ok[359]){ let i=0; while(ok[i]) ok[i++] = 0; }

    /* extract intervals */
    const out=[];
    let start=-1;
    for(let d=0; d<360; d++){
      if(ok[d] && start<0) start=d;
      if(!ok[d] && start>=0){ out.push([start,(d-1)]); start=-1; }
    }
    if(start>=0) out.push([start,359]);
    return out;            // degrees inclusive
  }

  /** choose the *earliest* radius (largest) where some interval fits n items */
  function chooseArc(n,cx,cy){
    const maxR = Math.max(cfg.orbitRadius,
      Math.min(cx - MARGIN(cfg), innerWidth - cx - MARGIN(cfg),
               cy - MARGIN(cfg), innerHeight - cy - MARGIN(cfg)));

    const angGap = d=>2*Math.asin(gapLin/(2*d));        // convert linear→rad

    for(let r=maxR; r>=cfg.orbitRadius; r-=2){
      const intervals = visibleIntervals(cx,cy,r);
      for(const [a0,a1] of intervals){
        const spanRad = (a1 - a0) * DEG;
        const needRad = (n - 1) * angGap(r);
        if(spanRad >= needRad){
          if(cfg.fullCircle && intervals.length===1 && a0===0 && a1===359)
            return {r, start:0, end:TAU};
          if(!cfg.fullCircle)
            return {r, start:a0*DEG, end:a1*DEG};
        }
      }
    }
    /* fallback: min radius, full ring */
    return {r:cfg.orbitRadius, start:0, end:TAU};
  }

  /** spread n points evenly on chosen arc */
  function computePositions(n,cx,cy){
    if(n===1) return [{x:0,y:0}];
    const {r,start,end} = chooseArc(n,cx,cy);
    const step = (end - start) / (n - 1);
    return Array.from({length:n},(_,i)=>{
      const θ = start + i*step;
      return {x:Math.cos(θ)*r, y:Math.sin(θ)*r};
    });
  }

  /* ───────────────────────────────────────────────────────────────────────
   *  Layout & render helpers
   * ───────────────────────────────────────────────────────────────────── */

  let stack=[];    // navigation stack
  let focusIdx=0;

  const rebuildRoot = ()=>{ stack=[{items:buildRootItems(cfg)}]; };
  const render = (instant=false)=>{
    const list = stack[stack.length-1].items;
    itemsBox.innerHTML = '';
    focusIdx = 0;

    list.forEach((it,i)=>{
      const btn = document.createElement('button');
      btn.className = 'menu-item ' + (it.children ? 'parent' : 'leaf');
      btn.type = 'button';
      btn.setAttribute('role','menuitem');
      btn.tabIndex = -1;

      const icon  = typeof it.icon  === 'function' ? it.icon(controller,cfg)  : it.icon;
      const label = typeof it.label === 'function' ? it.label(controller,cfg) : it.label;
      btn.innerHTML = `<i class="fas ${icon}"></i><span class="item-label">${label}</span>`;

      btn.addEventListener('click', ()=> handleClick(it, btn));
      itemsBox.appendChild(btn);
    });

    layoutItems(instant);
  };

  function layoutItems(instant=false){
    const r = root.getBoundingClientRect();
    const cx = r.left + r.width/2, cy = r.top + r.height/2;
    const children = [...itemsBox.children];
    const pos = computePositions(children.length, cx, cy);

    children.forEach((btn,i)=>{
      const {x,y} = pos[i];
      if(instant){
        btn.style.transition = 'none';
        btn.style.transform  = `translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
        btn.style.opacity    = 1;
        void btn.offsetWidth;
        btn.style.transition = '';
      } else {
        requestAnimationFrame(()=>{
          btn.style.transitionDelay = i*40 + 'ms';
          btn.style.transform       = `translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
          btn.style.opacity         = 1;
        });
      }
    });
  }

  /* ── click handler (submenu vs action) ───────────────────────────────── */
  function handleClick(it, btn){
    const ctrl = root.__controller__;
    if(it.children){
      stack.push({items:it.children});
      trigger.querySelector('i').className = 'fas fa-arrow-left';
      itemsBox.classList.add('animating');
      render(true);
      requestAnimationFrame(()=> itemsBox.classList.remove('animating'));
    } else if(it.action){
      it.action(ctrl);
      closeRoot();  // auto-close after leaf action
    }
  }

  /* ── open / close / drag trigger ─────────────────────────────────────── */
  trigger.addEventListener('pointerdown', e => {
    drag.active = 1;
    drag.sx = e.clientX;
    drag.sy = e.clientY;
    const r = root.getBoundingClientRect();
    drag.sl = r.left;
    drag.st = r.top;
    trigger.setPointerCapture(e.pointerId);
  });

  trigger.addEventListener('pointermove', e => {
    if (drag.active === 0) return;
    drag.active = 2;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    const size = parseFloat(getComputedStyle(root).width);
    root.style.left = Math.min(Math.max(drag.sl + dx, 0), innerWidth - size) + 'px';
    root.style.top  = Math.min(Math.max(drag.st + dy, 0), innerHeight - size) + 'px';
    if (itemsBox.classList.contains('active')) layoutItems(true);
  });

  trigger.addEventListener('pointerup',   saveDragPos);
  trigger.addEventListener('pointercancel',saveDragPos);

  function saveDragPos(){
    if (drag.active === 2) {
      localStorage.setItem(LS_POS_KEY, JSON.stringify({
        x: parseFloat(root.style.left),
        y: parseFloat(root.style.top)
      }));
    }
    drag.active = 0;
  }

  trigger.addEventListener('click', ()=>{
    console.log("[RM] trigger click", {drag, stack});
    if (drag.active === 2) return;  // ignore click finishing a drag

    if (stack.length === 0) rebuildRoot();

    if (!itemsBox.classList.contains('active')) {
      itemsBox.classList.add('active');
      trigger.classList.add('active');
      trigger.setAttribute('aria-expanded','true');
      render();
    } else if (stack.length === 1) {
      closeRoot();
    } else {
      stack.pop();
      trigger.querySelector('i').className =
        stack.length === 1 ? 'fas fa-plus' : 'fas fa-arrow-left';
      render(true);
    }
  });

  function closeRoot(){
    if (!itemsBox.classList.contains('active')) return;
    [...itemsBox.children].forEach((b,i)=>{
      b.style.transitionDelay = i*30 + 'ms';
      b.style.transform       = 'translate(-50%,-50%) scale(0)';
      b.style.opacity         = 0;
    });
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded','false');
    setTimeout(() => itemsBox.classList.remove('active'),
      cfg.transitionTime*1000 + itemsBox.children.length*30);
    trigger.querySelector('i').className = 'fas fa-plus';
    stack.length = 1;  // reset to root
  }

  /* ── keyboard nav ─────────────────────────────────────────────────────── */
  document.addEventListener('keydown', e=>{
    if (!itemsBox.classList.contains('active')) return;
    const items = [...itemsBox.children];
    const focus = i => {
      focusIdx = (i + items.length) % items.length;
      items[focusIdx].focus();
    };
    switch(e.key){
      case 'ArrowRight': case 'ArrowDown':
        e.preventDefault(); focus(focusIdx+1); break;
      case 'ArrowLeft':  case 'ArrowUp':
        e.preventDefault(); focus(focusIdx-1); break;
      case 'Enter': case ' ':
        e.preventDefault(); items[focusIdx].click(); break;
      case 'Escape':
        e.preventDefault();
        if(stack.length>1){ stack.pop(); render(true); }
        else closeRoot();
        break;
      case 'Tab':
        e.preventDefault(); focus(focusIdx + (e.shiftKey?-1:1)); break;
    }
  });

  /* adjust on resize ------------------------------------------------------ */
  window.addEventListener('resize',()=>{
    if (itemsBox.classList.contains('active')) layoutItems(true);
  });

  /* initial hidden state -------------------------------------------------- */
  rebuildRoot();
  render(true);
}
