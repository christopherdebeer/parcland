/* ──────────────────────────────────────────────────────────────────────────────
 *  Radial Menu for parc.land  — v4.1 (2025-05-03)
 *  – identical public API to v4
 *  – Settings submenu now shows ↑ / ↓ controls for each parameter
 *  --------------------------------------------------------------------------- */

import { saveCanvas } from './storage.js';
import {
  addEl, duplicateEl, deleteSelection,
  copySelection, pasteClipboard, clipboardHasContent,
  generateNew, inlineEdit, reorder,
  groupSelection, ungroupSelection, canUngroup,
  zoom, zoomToFit, openHistory, exportJSON
} from './radial-helpers.js';

/* ─── local-storage helpers ─────────────────────────────────────────────── */
const LS_POS_KEY = 'parc.radialMenu.pos';
const LS_CFG_KEY = 'parc.radialMenu.cfg';
const loadCfg = () => JSON.parse(localStorage.getItem(LS_CFG_KEY) || '{}');
const saveCfg = cfg => localStorage.setItem(LS_CFG_KEY, JSON.stringify(cfg));

/* ─── default cfg  (overridden by persisted + caller options) ───────────── */
function makeCfg(userOpt = {}) {
  return {
    menuSize      : 68,
    itemSize      : 56,
    orbitRadius   : 110,
    transitionTime: .35,                 // seconds
    ease          : 'cubic-bezier(.22,.61,.36,1)',
    fullCircle    : true,
    ...loadCfg(),
    ...userOpt
  };
}

/* ─── inject / update CSS custom-props ─────────────────────────────────── */
function applyCssVars(cfg) {
  let style = document.getElementById('radial-menu-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'radial-menu-style';
    document.head.appendChild(style);
  }
  style.textContent = `
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
    .menu-item:focus{box-shadow:0 0 0 3px rgba(33,150,243,.5)}
    .menu-item i{pointer-events:none}

    .menu-item.leaf   {background:#fff;}
    .menu-item.parent {background:#f5f5f5;border:2px solid var(--primary-color);}
    .menu-item.parent i::after{content:'›';position:absolute;right:4px;bottom:4px;
      font-size:.55em;opacity:.6}

    .item-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);
      font-size:.75rem;color:#fff;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:3px;
      white-space:nowrap;opacity:0;transition:opacity .2s var(--ease)}
    .menu-item:hover .item-label,
    .menu-item:focus .item-label{opacity:1}
  `;
}

/* ─── single global DOM instance ───────────────────────────────────────── */
let activeRoot = null;

/* ─── constants for min / max when tweaking settings ───────────────────── */
const PARAMS = {
  orbit : {key:'orbitRadius',   step:20,  min:40,  max:400},
  items : {key:'itemSize',      step: 8,  min:32,  max:96 },
  speed : {key:'transitionTime',step:.15,min:.15, max:1.05}
};

/* ─── helper to change & persist a cfg field, then refresh CSS & layout ── */
function bump(cfg, param, dir /* +1 or -1 */, controller) {
  const p = PARAMS[param];
  cfg[p.key] = Math.min(p.max, Math.max(p.min, cfg[p.key] + p.step*dir));
  saveCfg(cfg); applyCssVars(cfg);
  controller.__rm_relayout?.();
}

/* ─── build root-level menu model (called every render) ────────────────── */
function rootItems(cfg) {
  return [
    {
      label : c=> c.mode==='direct' ? 'Navigate' : 'Direct',
      icon  : c=> c.mode==='direct' ? 'fa-arrows-alt' : 'fa-hand',
      action: c=>c.switchMode(c.mode==='direct'?'navigate':'direct')
    },

    /* Add … */
    { label:'Add', icon:'fa-plus-circle', children:[
        {label:'Text',      icon:'fa-font',               action:c=>addEl(c,'text')},
        {label:'Markdown',  icon:'fa-brands fa-markdown', action:c=>addEl(c,'markdown')},
        {label:'Image',     icon:'fa-image',              action:c=>addEl(c,'img')},
        {label:'Canvas',    icon:'fa-object-group',       action:c=>addEl(c,'canvas-container')},
        {label:'AI-Generate',icon:'fa-wand-magic-sparkles',action:c=>addEl(c,'markdown','generating…')}
    ]},

    /* Edit / Clipboard */
    { label:'Edit', icon:'fa-pen-to-square',
      visible:c=>c.selectedElementIds.size>0,
      children:[
        {label:'Duplicate', icon:'fa-copy',
          action:c=>c.selectedElementIds.forEach(id=>duplicateEl(c,id))},
        {label:'Delete',    icon:'fa-trash',   action:c=>deleteSelection(c)},
        {label:'Copy',      icon:'fa-clone',   action:c=>copySelection(c)},
        {label:'Paste',     icon:'fa-paste', enabled:()=>clipboardHasContent(),
          action:c=>pasteClipboard(c)},
        {label:'Generate New', icon:'fa-arrow-rotate-right',
          enabled:c=> c.selectedElementIds.size===1 &&
                      c.findElementById([...c.selectedElementIds][0]).type!=='img',
          action:c=>generateNew(c)},
        {label:'Inline Edit', icon:'fa-i-cursor', action:c=>inlineEdit(c)}
    ]},

    /* Arrange */
    { label:'Arrange', icon:'fa-layer-group',
      visible:c=>c.selectedElementIds.size>0,
      children:[
        {label:'Bring Front', icon:'fa-arrow-up',   action:c=>reorder(c,'front')},
        {label:'Send Back',   icon:'fa-arrow-down', action:c=>reorder(c,'back')},
        {label:'Group',   icon:'fa-object-group', enabled:c=>c.selectedElementIds.size>1,
          action:c=>groupSelection(c)},
        {label:'Ungroup', icon:'fa-object-ungroup', enabled:c=>canUngroup(c),
          action:c=>ungroupSelection(c)}
    ]},

    /* View */
    { label:'View', icon:'fa-search', children:[
        {label:'Zoom In',     icon:'fa-search-plus',  action:c=>zoom(c,1.25)},
        {label:'Zoom Out',    icon:'fa-search-minus', action:c=>zoom(c,0.8)},
        {label:'Reset Zoom',  icon:'fa-compress',     action:c=>zoom(c,1/c.viewState.scale)},
        {label:'Zoom to Fit', icon:'fa-expand',       action:c=>zoomToFit(c)}
    ]},

    /* Canvas */
    { label:'Canvas', icon:'fa-database', children:[
        {label:'Save',        icon:'fa-save',         action:c=>saveCanvas(c.canvasState)},
        {label:'History',     icon:'fa-clock',        action:c=>openHistory(c)},
        {label:'Export JSON', icon:'fa-file-export',  action:c=>exportJSON(c)}
    ]},

    /* ⚙ Settings – now +/- buttons */
    { label:'Settings', icon:'fa-gear', children:[
        /* ORBIT */
        {label:()=>`Orbit ${cfg.orbitRadius}px +`, icon:'fa-plus',
          action:c=>bump(cfg,'orbit',+1,c)},
        {label:()=>`Orbit ${cfg.orbitRadius}px –`, icon:'fa-minus',
          action:c=>bump(cfg,'orbit',-1,c)},

        /* ITEM SIZE */
        {label:()=>`Items ${cfg.itemSize}px +`, icon:'fa-plus',
          action:c=>bump(cfg,'items',+1,c)},
        {label:()=>`Items ${cfg.itemSize}px –`, icon:'fa-minus',
          action:c=>bump(cfg,'items',-1,c)},

        /* SPEED */
        {label:()=>`Speed ${cfg.transitionTime}s +`, icon:'fa-plus',
          action:c=>bump(cfg,'speed',+1,c)},
        {label:()=>`Speed ${cfg.transitionTime}s –`, icon:'fa-minus',
          action:c=>bump(cfg,'speed',-1,c)},

        /* fan shape */
        {label:()=> cfg.fullCircle?'Use 90° fan':'Use 360° fan', icon:'fa-arrows-spin',
          action:c=>{ cfg.fullCircle=!cfg.fullCircle; saveCfg(cfg); c.__rm_relayout?.();}}
    ]}
  ];
}

/* ────────────────────────────────────────────────────────────────────────────
 * installRadialMenu(controller[, options])
 * (everything below is identical to v4 except trivial refactorings)
 * ───────────────────────────────────────────────────────────────────────── */

export function installRadialMenu(controller, options = {}) {

  /* reuse shell if already there (canvas drill-in/out) */
  if (activeRoot) {
    activeRoot.__controller__ = controller;
    controller.__rm_relayout = () => layoutItems(true);
    return;
  }

  const cfg = makeCfg(options);
  applyCssVars(cfg);

  /* ── create shell ────────────────────────────────────────────────────── */
  const root = document.createElement('div');
  root.className = 'radial-menu';
  root.innerHTML = `
    <button class="menu-trigger" aria-expanded="false" aria-haspopup="menu">
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
    <div class="menu-items" role="menu"></div>`;
  document.body.appendChild(root);
  activeRoot = root;

  root.__controller__         = controller;
  controller.__rm_relayout    = () => layoutItems(true);

  /* restore persisted position */
  const pos = JSON.parse(localStorage.getItem(LS_POS_KEY) || 'null');
  if (pos) {
    root.style.left = pos.x + 'px';
    root.style.top  = pos.y + 'px';
  } else {
    root.style.left = `calc(100% - ${cfg.menuSize + 20}px)`;
    root.style.top  = `calc(100% - ${cfg.menuSize + 20}px)`;
  }

  /*  ………………………………………………………   everything below (gesture logic, render,
      layoutItems, animation, keyboard nav) is *identical* to v4 and omitted
      for brevity – only Settings submenu changed.   …………………………………………………… */

  /* helpers & state (same as v4) */
  const trigger  = root.querySelector('.menu-trigger');
  const itemsBox = root.querySelector('.menu-items');
  const ORBIT = () => cfg.orbitRadius;
  const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));
  const drag={active:false,sx:0,sy:0,sl:0,st:0};
  const rot ={active:false,startA:0,startR:0};
  let rotation=0, stack=[], focusIdx=0;

  /** redistributes n items to avoid edges + overlaps (uses full circle) */
  const redistribute = (n, cx, cy) => {
    const step = (Math.PI*2)/n;
    const screen = {left:6,right:innerWidth-6,top:6,bottom:innerHeight-6};
    const items = Array.from({length:n},(_,i)=>{
      const a = i*step + rotation;
      return {i,a,x:Math.cos(a)*ORBIT(),y:Math.sin(a)*ORBIT()};
    });

    /* simple edge-shrink  */
    items.forEach(p=>{
      const sx=cx+p.x, sy=cy+p.y;
      const dx = sx<screen.left ? screen.left-sx :
                sx>screen.right? screen.right-sx : 0;
      const dy = sy<screen.top  ? screen.top -sy :
                sy>screen.bottom? screen.bottom-sy : 0;
      if (dx||dy){
        const factor = 1 - Math.max(Math.abs(dx),Math.abs(dy))/ORBIT();
        p.x *= factor; p.y *= factor;
      }
    });
    /* no fancy overlap solver – itemSize padding usually enough */
    return items;
  };

  /* ── render helpers ─────────────────────────────────────────────────── */
  const currentModel = ()=>stack[stack.length-1].items;
  const rebuildRoot  = ()=>{stack=[{title:'root',items:rootItems(cfg)}];};

  const render = (instant=false) =>{
    const list = currentModel() //.filter(it=>it.visible?.(controller)??true);
    itemsBox.innerHTML='';
    focusIdx=0;
    list.forEach((it,idx)=>{
      const btn = document.createElement('button');
      btn.className='menu-item ' + (it.children?'parent':'leaf');
      btn.type='button';
      btn.setAttribute('role','menuitem');
      btn.setAttribute('tabindex','-1');
      const icon = typeof it.icon==='function'?it.icon(controller):it.icon;
      const label= typeof it.label==='function'?it.label(controller):it.label;
      btn.innerHTML=`
        <i class="fas ${icon}"></i>
        <span class="item-label">${label}</span>`;
      const enabled = true; // it.enabled?.(controller)??true;
      if(!enabled){
        btn.setAttribute('aria-disabled','true');
        btn.style.opacity=.4;
        btn.style.pointerEvents='none';
      }
      btn.addEventListener('click',()=>handleItem(it,btn));
      btn.addEventListener('pointerdown',startRotateGesture);
      itemsBox.appendChild(btn);
      if(idx===0 && itemsBox.classList.contains('active')){
        requestAnimationFrame(()=>btn.focus());
      }
    });
    layoutItems(instant);
  };

  const layoutItems = (instant=false)=>{
    const r = root.getBoundingClientRect();
    const cx = r.left+r.width/2, cy=r.top+r.height/2;
    const its=[...itemsBox.children];
    const pos = cfg.fullCircle
      ? redistribute(its.length,cx,cy)
      : null;  // original 90° still available if needed

    its.forEach((btn,i)=>{
      let {x,y} = cfg.fullCircle
        ? pos[i]
        : (()=>{            // original quadrant layout
            const [sL,sR,sT,sB]=[r.left,innerWidth-r.right,r.top,innerHeight-r.bottom];
            const hDir=(sL<sR)?1:-1, vDir=(sT<sB)?1:-1;
            const base=Math.atan2(vDir,hDir), sweep=Math.PI/2;
            const step=its.length>1?sweep/(its.length-1):0;
            const a=base-sweep/2+i*step+rotation;
            return {x:Math.cos(a)*ORBIT(),y:Math.sin(a)*ORBIT()};
          })();

      if(instant){
        btn.style.transition='none';
        btn.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
        btn.style.opacity=1;
        void btn.offsetWidth; btn.style.transition='';
      }else{
        const delay=i*40;
        btn.style.transitionDelay=delay+'ms';
        requestAnimationFrame(()=>{
          btn.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
          btn.style.opacity=1;
        });
      }
    });
  };

  /* ── overlapping dive-in animation ──────────────────────────────────── */
  function handleItem(it,btn){
    const ctrl = root.__controller__;
    if(it.children){
      // clone stays put, new children fan while parent travels
      const rect = btn.getBoundingClientRect();
      const clone = btn.cloneNode(true);
      clone.style.position='fixed';
      clone.style.left = rect.left+'px';
      clone.style.top  = rect.top +'px';
      clone.style.margin=0;
      clone.style.transform='translate(0,0)';
      clone.style.transition=`transform var(--transition-time) var(--ease),
                              opacity   var(--transition-time) var(--ease)`;
      document.body.appendChild(clone);

      // parent dives in
      const rootRect = root.getBoundingClientRect();
      const tx = rootRect.left + rootRect.width/2  - (rect.left+rect.width/2);
      const ty = rootRect.top  + rootRect.height/2 - (rect.top +rect.height/2);
      requestAnimationFrame(()=>{
        clone.style.transform=`translate(${tx}px,${ty}px) scale(.3)`;
        clone.style.opacity=0;
      });
      clone.addEventListener('transitionend',()=>clone.remove(),{once:true});

      // expand submenu immediately
      stack.push({title:it.label,items:it.children});
      trigger.querySelector('i').className='fas fa-arrow-left';
      rotation=0;
      itemsBox.classList.add('animating');
      render(true);
      requestAnimationFrame(()=>itemsBox.classList.remove('animating'));
    }else if(typeof it.action==='function'){
      it.action(ctrl);
    }
  }

  /* ── pointer rotate gesture on item fan ─────────────────────────────── */
  function startRotateGesture(e){
    if(!itemsBox.classList.contains('active')||
       itemsBox.classList.contains('animating')) return;
    rot.active=true;
    const cen=root.getBoundingClientRect();
    rot.startA=Math.atan2(e.clientY-(cen.top+cen.height/2),
                          e.clientX-(cen.left+cen.width/2));
    rot.startR=rotation;
    itemsBox.setPointerCapture(e.pointerId);
  }
  itemsBox.addEventListener('pointermove',e=>{
    if(!rot.active) return;
    const cen=root.getBoundingClientRect();
    const a=Math.atan2(e.clientY-(cen.top+cen.height/2),
                       e.clientX-(cen.left+cen.width/2));
    rotation=rot.startR+(a-rot.startA);
    layoutItems(true);
  });
  itemsBox.addEventListener('pointerup',  ()=>rot.active=false);
  itemsBox.addEventListener('pointercancel',()=>rot.active=false);

  /* ── trigger / drag / open / close ───────────────────────────────────── */
  trigger.addEventListener('pointerdown',e=>{
    drag.active=1;
    drag.sx=e.clientX; drag.sy=e.clientY;
    const r=root.getBoundingClientRect();
    drag.sl=r.left; drag.st=r.top;
    trigger.setPointerCapture(e.pointerId);
  });
  trigger.addEventListener('pointermove',e=>{
    if(drag.active!==1&&drag.active!==2) return;
    drag.active=2;
    const dx=e.clientX-drag.sx, dy=e.clientY-drag.sy;
    const size=parseFloat(getComputedStyle(root).width);
    root.style.left=clamp(drag.sl+dx,0,innerWidth-size)+'px';
    root.style.top =clamp(drag.st+dy,0,innerHeight-size)+'px';
    if(itemsBox.classList.contains('active')) layoutItems(true);
  });
  const endDrag=()=>{
    if(drag.active){
      localStorage.setItem(LS_POS_KEY,JSON.stringify({
        x:parseFloat(root.style.left),
        y:parseFloat(root.style.top)
      }));
    }
    drag.active=0;
  };
  trigger.addEventListener('pointerup',endDrag);
  trigger.addEventListener('pointercancel',endDrag);

  trigger.addEventListener('click',e=>{
    if(drag.active===2){drag.active=0;return;} // ignore click ending drag

    if(stack.length===1){        // root level
      if(!itemsBox.classList.contains('active')){
        rebuildRoot(); rotation=0;
        itemsBox.classList.add('active');
        trigger.classList.add('active');
        trigger.setAttribute('aria-expanded','true');
        render();
      }else{
        closeRoot();
      }
    }else{                       // back one level
      stack.pop();
      trigger.querySelector('i').className=
        stack.length===1?'fas fa-plus':'fas fa-arrow-left';
      rotation=0; render(true);
    }
  });

  function closeRoot(){
    if(!itemsBox.classList.contains('active')) return;
    const childs=[...itemsBox.children];
    childs.forEach((b,i)=>{
      b.style.transitionDelay=i*30+'ms';
      b.style.transform='translate(-50%,-50%) scale(0)';
      b.style.opacity=0;
    });
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded','false');
    setTimeout(()=>itemsBox.classList.remove('active'),
      cfg.transitionTime*1000+childs.length*30);
    trigger.querySelector('i').className='fas fa-plus';
    stack=[stack[0]];
  }

  /* ── keyboard nav (unchanged) ───────────────────────────────────────── */
  document.addEventListener('keydown',function keyNav(e){
    if(!itemsBox.classList.contains('active')) return;
    const items=[...itemsBox.querySelectorAll('.menu-item')];
    if(!items.length) return;
    const focus=(i)=>{focusIdx=(i+items.length)%items.length;items[focusIdx].focus();};
    switch(e.key){
      case'ArrowRight':case'ArrowDown':e.preventDefault();focus(focusIdx+1);break;
      case'ArrowLeft': case'ArrowUp'  :e.preventDefault();focus(focusIdx-1);break;
      case'Enter':case' ':e.preventDefault();items[focusIdx].click();break;
      case'Escape':
        e.preventDefault();
        if(stack.length>1){stack.pop();rotation=0;render(true);}
        else closeRoot();
        break;
      case'Tab':
        e.preventDefault();focus(focusIdx+(e.shiftKey?-1:1));break;
    }
  });

  /* ── relayout on resize ─────────────────────────────────────────────── */
  window.addEventListener('resize',()=>{if(itemsBox.classList.contains('active'))layoutItems(true);});

  /* ensure hidden root ready for first open */
  rebuildRoot();
  render(true);
}
