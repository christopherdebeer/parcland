/* ──────────────────────────────────────────────────────────────────────────────
 *  Radial Menu for parc.land   —  v5.1  (2025-05-05)
 *  • trigger can still be dragged anywhere
 *  • the fan is laid out on *the exact arc* that remains inside the viewport
 *      at the chosen radius; spacing is always ≥ itemSize × 1.4
 *  • tries to honour “360 ° ring” when there *is* a full visible ring;
 *    otherwise it silently uses the longest visible arc
 *  • no more spin-to-rotate gesture
 * ─────────────────────────────────────────────────────────────────────────── */

import { saveCanvas } from './storage.js';
import {
  addEl, duplicateEl, deleteSelection,
  copySelection, pasteClipboard, clipboardHasContent,
  generateNew, inlineEdit, reorder,
  groupSelection, ungroupSelection, canUngroup,
  zoom, zoomToFit, openHistory, exportJSON
} from './radial-helpers.js';

/* ─── persistence ──────────────────────────────────────────────────────── */
const LS_POS_KEY = 'parc.radialMenu.pos';
const LS_CFG_KEY = 'parc.radialMenu.cfg';
const loadCfg = () => JSON.parse(localStorage.getItem(LS_CFG_KEY) || '{}');
const saveCfg = c  => localStorage.setItem(LS_CFG_KEY, JSON.stringify(c));

/* ─── run-time config ──────────────────────────────────────────────────── */
function makeCfg(opts = {}) {
  return {
    menuSize      : 68,
    itemSize      : 56,
    orbitRadius   : 110,      // a *minimum* radius hint
    transitionTime: .35,
    ease          : 'cubic-bezier(.22,.61,.36,1)',
    fullCircle    : false,
    ...loadCfg(),
    ...opts
  };
}

/* ─── CSS custom props  ────────────────────────────────────────────────── */
function applyCssVars(cfg) {
  let s = document.getElementById('radial-menu-style');
  if (!s) { s = document.createElement('style'); s.id = 'radial-menu-style'; document.head.appendChild(s); }
  s.textContent = `
    :root{
      --menu-size:${cfg.menuSize}px;
      --item-size:${cfg.itemSize}px;
      --transition-time:${cfg.transitionTime}s;
      --ease:${cfg.ease};
      --primary-color:#2196F3;
    }
    .radial-menu{position:fixed;width:var(--menu-size);height:var(--menu-size);z-index:999}
    .menu-trigger{width:100%;height:100%;border:none;border-radius:50%;
      background:var(--primary-color);color:#fff;font-size:1.4rem;cursor:pointer;
      transition:transform var(--transition-time) var(--ease);outline:none}
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

/* ─── global singleton  ───────────────────────────────────────────────── */
let activeRoot = null;

/* ─── Settings tunables (+/- buttons) ──────────────────────────────────── */
const PARAMS = {
  orbit : {key:'orbitRadius',   step:20,  min:40,  max:400},
  items : {key:'itemSize',      step: 8,  min:32,  max:96 },
  speed : {key:'transitionTime',step:.15,min:.15, max:1.05}
};
function bump(cfg, name, dir, ctrl){
  const p = PARAMS[name];
  cfg[p.key] = Math.min(p.max, Math.max(p.min, cfg[p.key] + p.step*dir));
  saveCfg(cfg); applyCssVars(cfg); ctrl.__rm_relayout?.();
}

/* ─── menu tree (same actions) ────────────────────────────────────────── */
function rootItems(cfg){
  return [
    { label:c=>c.mode==='direct'?'Navigate':'Direct',
      icon :c=>c.mode==='direct'?'fa-arrows-alt':'fa-hand',
      action:c=>c.switchMode(c.mode==='direct'?'navigate':'direct') },

    { label:'Add', icon:'fa-plus-circle', children:[
        {label:'Text',        icon:'fa-font',               action:c=>addEl(c,'text')},
        {label:'Markdown',    icon:'fa-brands fa-markdown', action:c=>addEl(c,'markdown')},
        {label:'Image',       icon:'fa-image',              action:c=>addEl(c,'img')},
        {label:'Canvas',      icon:'fa-object-group',       action:c=>addEl(c,'canvas-container')},
        {label:'AI-Generate', icon:'fa-wand-magic-sparkles',action:c=>addEl(c,'markdown','generating…')}
    ]},

    { label:'Edit', icon:'fa-pen-to-square',
      visible:c=>c?.selectedElementIds.size>0,
      children:[
        {label:'Duplicate', icon:'fa-copy',
          action:c=>c.selectedElementIds.forEach(id=>duplicateEl(c,id))},
        {label:'Delete',    icon:'fa-trash', action:c=>deleteSelection(c)},
        {label:'Copy',      icon:'fa-clone', action:c=>copySelection(c)},
        {label:'Paste',     icon:'fa-paste', enabled:()=>clipboardHasContent(),
          action:c=>pasteClipboard(c)},
        {label:'Generate New', icon:'fa-arrow-rotate-right',
          enabled:c=>c.selectedElementIds.size===1 &&
                     c.findElementById([...c.selectedElementIds][0]).type!=='img',
          action:c=>generateNew(c)},
        {label:'Inline Edit', icon:'fa-i-cursor', action:c=>inlineEdit(c)}
    ]},

    { label:'Arrange', icon:'fa-layer-group',
      visible:c=>c?.selectedElementIds.size>0,
      children:[
        {label:'Bring Front', icon:'fa-arrow-up',   action:c=>reorder(c,'front')},
        {label:'Send Back',   icon:'fa-arrow-down', action:c=>reorder(c,'back')},
        {label:'Group',     icon:'fa-object-group', enabled:c=>c.selectedElementIds.size>1,
          action:c=>groupSelection(c)},
        {label:'Ungroup',   icon:'fa-object-ungroup', enabled:c=>canUngroup(c),
          action:c=>ungroupSelection(c)}
    ]},

    { label:'View', icon:'fa-search', children:[
        {label:'Zoom In',     icon:'fa-search-plus',  action:c=>zoom(c,1.25)},
        {label:'Zoom Out',    icon:'fa-search-minus', action:c=>zoom(c,0.8)},
        {label:'Reset Zoom',  icon:'fa-compress',     action:c=>zoom(c,1/c.viewState.scale)},
        {label:'Zoom to Fit', icon:'fa-expand',       action:c=>zoomToFit(c)}
    ]},

    { label:'Canvas', icon:'fa-database', children:[
        {label:'Save',        icon:'fa-save',        action:c=>saveCanvas(c.canvasState)},
        {label:'History',     icon:'fa-clock',       action:c=>openHistory(c)},
        {label:'Export JSON', icon:'fa-file-export', action:c=>exportJSON(c)}
    ]},

    { label:'Settings', icon:'fa-gear', children:[
        {label:()=>`Orbit ${cfg.orbitRadius}px +`, icon:'fa-plus',
          action:c=>bump(cfg,'orbit',+1,c)},
        {label:()=>`Orbit ${cfg.orbitRadius}px –`, icon:'fa-minus',
          action:c=>bump(cfg,'orbit',-1,c)},
        {label:()=>`Items ${cfg.itemSize}px +`, icon:'fa-plus',
          action:c=>bump(cfg,'items',+1,c)},
        {label:()=>`Items ${cfg.itemSize}px –`, icon:'fa-minus',
          action:c=>bump(cfg,'items',-1,c)},
        {label:()=>`Speed ${cfg.transitionTime}s +`, icon:'fa-plus',
          action:c=>bump(cfg,'speed',+1,c)},
        {label:()=>`Speed ${cfg.transitionTime}s –`, icon:'fa-minus',
          action:c=>bump(cfg,'speed',-1,c)},
        {label:()=> cfg.fullCircle?'Use 90° fan':'Use 360° ring', icon:'fa-arrows-spin',
          action:c=>{ cfg.fullCircle=!cfg.fullCircle; saveCfg(cfg); c.__rm_relayout?.();}}
    ]}
  ];
}

/* ──────────────────────────────────────────────────────────────────────────
 *  installRadialMenu(controller[, options])
 * ───────────────────────────────────────────────────────────────────────── */
export function installRadialMenu(controller, options = {}) {

  /* hot-swap controller if shell already mounted */
  if (activeRoot) {
    activeRoot.__controller__  = controller;
    controller.__rm_relayout   = () => layoutItems(true);
    return;
  }

  const cfg = makeCfg(options);
  applyCssVars(cfg);

  /* shell markup  */
  const root = document.createElement('div');
  root.className = 'radial-menu';
  root.innerHTML = `
    <button class="menu-trigger" aria-expanded="false" aria-haspopup="menu">
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
    <div class="menu-items" role="menu"></div>`;
  document.body.appendChild(root);
  activeRoot = root;

  root.__controller__       = controller;
  controller.__rm_relayout  = () => layoutItems(true);

  /* restore / default position  */
  const pos = JSON.parse(localStorage.getItem(LS_POS_KEY) || 'null');
  if (pos){ root.style.left=pos.x+'px'; root.style.top=pos.y+'px'; }
  else    { root.style.left=`calc(100% - ${cfg.menuSize+20}px)`; root.style.top=`calc(100% - ${cfg.menuSize+20}px)`; }

  /* ─── helpers & local state ─────────────────────────────────────────── */
  const trigger  = root.querySelector('.menu-trigger');
  const itemsBox = root.querySelector('.menu-items');

  const drag = {active:false,sx:0,sy:0,sl:0,st:0};

  let stack    = [];
  let focusIdx = 0;

  const HALF_ITEM = ()=>cfg.itemSize/2;
  const MIN_GAP   = ()=>cfg.itemSize*1.4;
  const MARGIN    = ()=>6 + HALF_ITEM();                 // inner border safety

  /* ——— geometry helpers ———————————————————————————————————————————— */

  /** test if a point at angle θ and radius r from (cx,cy) is inside viewport */
  const fitsAngle = (cx,cy,r,θ)=>{
    const x = cx + Math.cos(θ)*r;
    const y = cy + Math.sin(θ)*r;
    return x>MARGIN() && x<innerWidth-MARGIN() &&
           y>MARGIN() && y<innerHeight-MARGIN();
  };

  /**
   * returns {radius, start, end} describing the *longest* visible arc,
   * big enough that n items fit with ≥ MIN_GAP() spacing.
   * if cfg.fullCircle is true, tries to shrink radius until a whole ring fits.
   */
  function chooseArc(n, cx, cy){
    /* max radius limited by nearest viewport edge */
    const maxR = Math.max(HALF_ITEM()+4,
      Math.min(cx-MARGIN(), innerWidth-cx-MARGIN(),
               cy-MARGIN(), innerHeight-cy-MARGIN()));

    const stepR = 4;                               // iterate downwards
    const samples = 360;                           // 1° resolution
    const dΘ = 2*Math.PI/samples;
    const wantsFull = cfg.fullCircle;

    for(let r=maxR; r>=cfg.orbitRadius; r-=stepR){
      /* build boolean mask of allowed angles */
      const ok = Array.from({length:samples},(_,i)=>fitsAngle(cx,cy,r,i*dΘ));

      /* stitch first & last segment so wrap-around works */
      if(ok[0] && ok[samples-1]){
        let i=0; while(i<samples && ok[i]) i++;
        for(let j=0;j<i;j++) ok[j]=false;          // cut initial so only one run remains
      }

      /* find longest contiguous true block */
      let best={len:0,start:0,end:0};
      let curStart=null;
      ok.forEach((val,i)=>{
        if(val && curStart===null) curStart=i;
        if(!val && curStart!==null){
          const len=i-curStart;
          if(len>best.len) best={len,start:curStart,end:i-1};
          curStart=null;
        }
      });
      if(curStart!==null){                         // ran to end
        const len=samples-curStart;
        if(len>best.len) best={len,start:curStart,end:samples-1};
      }
      if(best.len===0) continue;                   // no arc with this r

      const arc = best.len*dΘ;                     // rad
      const arcNeeded = (n>1) ? (n-1)*MIN_GAP()/r : 0;
      const fitsItems = arc >= arcNeeded;

      /* full ring request ? */
      const isFull = best.len===samples;
      if(wantsFull && isFull && fitsItems)
        return {radius:r,start:0,end:2*Math.PI};

      if(!wantsFull && fitsItems)
        return {
          radius:r,
          start:best.start*dΘ,
          end  :(best.end+0.0001)*dΘ              // tiny pad so last item inside
        };
      /* otherwise keep searching with smaller r */
    }

    /* fallback: smallest acceptable radius using whatever arc we found */
    const r = cfg.orbitRadius;
    const fullAllowed = 2*Math.PI;
    return {radius:r,start:0,end:fullAllowed};
  }

  /** compute (x,y) pairs for n items */
  function computePositions(n, cx, cy){
    if(n===1) return [{x:0,y:0}];

    const {radius, start, end} = chooseArc(n,cx,cy);
    const span = end-start;
    const step = n===1 ? 0 : span/(n-1);
    return Array.from({length:n},(_,i)=>{
      const θ = start + i*step;
      return {x:Math.cos(θ)*radius, y:Math.sin(θ)*radius};
    });
  }

  /* ——— render helpers ———————————————————————————————————————————— */
  const activeMenu = () => stack[stack.length-1].items;
  const rebuildRoot= () =>{ stack=[{title:'root',items:rootItems(cfg)}]; };

  function render(instant=false){
    const list = activeMenu();
    itemsBox.innerHTML=''; focusIdx=0;

    list.forEach((it,idx)=>{
      const btn=document.createElement('button');
      btn.className='menu-item '+(it.children?'parent':'leaf');
      btn.setAttribute('role','menuitem');
      btn.setAttribute('tabindex','-1');
      const icon = typeof it.icon==='function'?it.icon(root.__controller__):it.icon;
      const label= typeof it.label==='function'?it.label(root.__controller__):it.label;
      btn.innerHTML=`<i class="fas ${icon}"></i><span class="item-label">${label}</span>`;

      const enabled = (() => { try { return it.enabled?.(root.__controller__) ?? true; } catch(err) { console.warn(); return true; } })();
      if(!enabled){ btn.style.opacity=.4; btn.style.pointerEvents='none'; }

      btn.addEventListener('click',()=>handleItem(it,btn));
      itemsBox.appendChild(btn);
      if(idx===0 && itemsBox.classList.contains('active'))
        requestAnimationFrame(()=>btn.focus());
    });
    layoutItems(instant);
  }

  function layoutItems(instant=false){
    const r = root.getBoundingClientRect();
    const cx=r.left+r.width/2, cy=r.top+r.height/2;
    const btns=[...itemsBox.children];
    const pos = computePositions(btns.length,cx,cy);

    btns.forEach((b,i)=>{
      const {x,y}=pos[i];
      if(instant){
        b.style.transition='none';
        b.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
        b.style.opacity=1;
        void b.offsetWidth; b.style.transition='';
      }else{
        b.style.transitionDelay=i*40+'ms';
        requestAnimationFrame(()=>{
          b.style.transform=`translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
          b.style.opacity=1;
        });
      }
    });
  }

  controller.__rm_relayout = () => layoutItems(true);

  /* ——— submenu dive / execute ———————————————————————————————— */
  function handleItem(it, btn){
    const ctrl=root.__controller__;
    if(it.children){
      /* tiny ghost fly-in */
      const src=btn.getBoundingClientRect();
      const ghost=btn.cloneNode(true);
      Object.assign(ghost.style,{position:'fixed',left:src.left+'px',top:src.top+'px',
        margin:0,transform:'translate(0,0)',
        transition:`transform var(--transition-time) var(--ease),opacity var(--transition-time) var(--ease)`});
      document.body.appendChild(ghost);
      const tgt=root.getBoundingClientRect();
      const tx=tgt.left+tgt.width/2-(src.left+src.width/2);
      const ty=tgt.top +tgt.height/2-(src.top +src.height/2);
      requestAnimationFrame(()=>{ghost.style.transform=`translate(${tx}px,${ty}px) scale(.3)`;ghost.style.opacity=0;});
      ghost.addEventListener('transitionend',()=>ghost.remove(),{once:true});

      stack.push({title:it.label,items:it.children});
      trigger.querySelector('i').className='fas fa-arrow-left';
      itemsBox.classList.add('animating'); render(true);
      requestAnimationFrame(()=>itemsBox.classList.remove('animating'));
    }else if(typeof it.action==='function'){
      it.action(ctrl);
    }
  }

  /* ——— draggable trigger ———————————————————————————————— */
  trigger.addEventListener('pointerdown',e=>{
    drag.active=1; drag.sx=e.clientX; drag.sy=e.clientY;
    const r=root.getBoundingClientRect(); drag.sl=r.left; drag.st=r.top;
    trigger.setPointerCapture(e.pointerId);
  });
  trigger.addEventListener('pointermove',e=>{
    if(drag.active!==1&&drag.active!==2) return;
    drag.active=2;
    const dx=e.clientX-drag.sx, dy=e.clientY-drag.sy;
    const size=parseFloat(getComputedStyle(root).width);
    const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
    root.style.left=clamp(drag.sl+dx,0,innerWidth -size)+'px';
    root.style.top =clamp(drag.st+dy,0,innerHeight-size)+'px';
    if(itemsBox.classList.contains('active')) layoutItems(true);
  });
  const endDrag=()=>{
    if(drag.active){
      localStorage.setItem(LS_POS_KEY,JSON.stringify({
        x:parseFloat(root.style.left),y:parseFloat(root.style.top)
      }));
    }
    drag.active=0;
  };
  trigger.addEventListener('pointerup',endDrag);
  trigger.addEventListener('pointercancel',endDrag);

  /* ——— open / close / back nav ———————————————————————————————— */
  trigger.addEventListener('click',e=>{
    if(drag.active===2){drag.active=0;return;}

    if(stack.length===1){
      if(!itemsBox.classList.contains('active')){
        rebuildRoot();
        itemsBox.classList.add('active'); trigger.classList.add('active');
        trigger.setAttribute('aria-expanded','true'); render();
      }else closeRoot();
    }else{
      stack.pop();
      trigger.querySelector('i').className = stack.length===1?'fas fa-plus':'fas fa-arrow-left';
      render(true);
    }
  });
  function closeRoot(){
    if(!itemsBox.classList.contains('active')) return;
    [...itemsBox.children].forEach((b,i)=>{
      b.style.transitionDelay=i*30+'ms';
      b.style.transform='translate(-50%,-50%) scale(0)'; b.style.opacity=0;
    });
    trigger.classList.remove('active'); trigger.setAttribute('aria-expanded','false');
    setTimeout(()=>itemsBox.classList.remove('active'),
      cfg.transitionTime*1000 + itemsBox.children.length*30);
    trigger.querySelector('i').className='fas fa-plus';
    stack=[stack[0]];
  }

  /* ——— keyboard nav ———————————————————————————————— */
  document.addEventListener('keydown',e=>{
    if(!itemsBox.classList.contains('active')) return;
    const items=[...itemsBox.querySelectorAll('.menu-item')]; if(!items.length) return;
    const focus=i=>{focusIdx=(i+items.length)%items.length;items[focusIdx].focus();};
    switch(e.key){
      case'ArrowRight':case'ArrowDown':e.preventDefault();focus(focusIdx+1);break;
      case'ArrowLeft': case'ArrowUp' :e.preventDefault();focus(focusIdx-1);break;
      case'Enter':case' ':           e.preventDefault();items[focusIdx].click();break;
      case'Escape':
        e.preventDefault();
        if(stack.length>1){stack.pop();render(true);} else closeRoot();
        break;
      case'Tab':
        e.preventDefault();focus(focusIdx+(e.shiftKey?-1:1));break;
    }
  });

  /* ——— keep arc tidy on resize ———————————————————————————————— */
  window.addEventListener('resize',()=>{if(itemsBox.classList.contains('active')) layoutItems(true);});

  /* boot */
  rebuildRoot(); render(true);
}
