/* ────────────────────────────────────────────────────────────────────────────
 *  Radial Menu for parc.land  — v3 (2025-04-30)
 *  • context-sensitive launcher that replaces the old #mode toggle button
 *  • major revamp: a11y, keyboard nav, persistence, configurability, etc.
 *  • full 360° distribution with edge and overlap avoidance
 * ---------------------------------------------------------------------------
 *  author: parc.land core team
 * ---------------------------------------------------------------------------
 */

import { saveCanvas } from './storage.js';
import { 
 addEl,
 duplicateEl,
 deleteSelection,
 copySelection,
 pasteClipboard,
 clipboardHasContent,
 generateNew,
 inlineEdit,
 reorder,
 groupSelection,
 ungroupSelection,
 canUngroup,
 zoom,
 zoomToFit,
 openHistory,
 exportJSON } from './radial-helpers.js';

/* keep at most one DOM instance alive across controllers */
let activeRoot = null;
/* localStorage key for persisted menu position */
const LS_POS_KEY = 'parc.radialMenu.pos';

/*********************************************************************
 * Radial-menu structure for parc.land (2025-04-30)
 * Each item can carry `visible()`  and / or  `enabled()` getters.
 *********************************************************************/
const rootItems  = [
  /* ───── Mode toggle ───── */
  {
    label : c => c.mode === 'direct' ? 'Navigate' : 'Direct',
    icon  : c => c.mode === 'direct' ? 'fa-arrows-alt' : 'fa-hand',
    action: c => c.switchMode(c.mode === 'direct' ? 'navigate' : 'direct')
  },

  /* ───── Add ───── */
  {
    label:'Add',      icon:'fa-plus-circle', children:[
      {label:'Text',      icon:'fa-font',               action:c=>addEl(c,'text')},
      {label:'Markdown',  icon:'fa-brands fa-markdown', action:c=>addEl(c,'markdown')},
      {label:'Image',     icon:'fa-image',              action:c=>addEl(c,'img')},
      {label:'Canvas',    icon:'fa-object-group',       action:c=>addEl(c,'canvas-container')},
      {label:'AI-Generate',icon:'fa-wand-magic-sparkles',action:c=>addEl(c,'markdown','generating…')}
    ]
  },

  /* ───── Edit / Clipboard (only if ≥1 element selected) ───── */
  {
    label:'Edit', icon:'fa-pen-to-square',
    visible : c=>c.selectedElementIds.size>0,
    children:[
      {label:'Duplicate', icon:'fa-copy',
        action:c=> c.selectedElementIds.forEach(id=>duplicateEl(c,id))},

      {label:'Delete',    icon:'fa-trash',
        action:c=> deleteSelection(c) },

      {label:'Copy',      icon:'fa-clone',
        action:c=> copySelection(c) },

      {label:'Paste',     icon:'fa-paste',
        enabled : ()=>clipboardHasContent(),
        action:c=> pasteClipboard(c) },

      {label:'Generate New', icon:'fa-arrow-rotate-right',
        enabled : c=>c.selectedElementIds.size===1 &&
                     c.findElementById([...c.selectedElementIds][0]).type!=='img',
        action  : c=>generateNew(c) },

      {label:'Inline Edit', icon:'fa-i-cursor',
        action:c=> inlineEdit(c) },
    ]
  },

  /* ───── Arrange (multi-selection aware) ───── */
  {
    label:'Arrange', icon:'fa-layer-group',
    visible : c=>c.selectedElementIds.size>0,
    children:[
      {label:'Bring Front', icon:'fa-arrow-up',
        action:c=>reorder(c,'front')},
      {label:'Send Back',   icon:'fa-arrow-down',
        action:c=>reorder(c,'back')},
      {label:'Group',       icon:'fa-object-group',
        enabled:c=>c.selectedElementIds.size>1,
        action:c=>groupSelection(c)},
      {label:'Ungroup',     icon:'fa-object-ungroup',
        enabled:c=>canUngroup(c),
        action:c=>ungroupSelection(c)}
    ]
  },

  /* ───── View / Zoom ───── */
  {
    label:'View', icon:'fa-search',
    children:[
      {label:'Zoom In',     icon:'fa-search-plus',  action:c=>zoom(c,1.25)},
      {label:'Zoom Out',    icon:'fa-search-minus', action:c=>zoom(c,0.8)},
      {label:'Reset Zoom',  icon:'fa-compress',     action:c=>zoom(c,1/c.viewState.scale)},
      {label:'Zoom to Fit', icon:'fa-expand',
        action:c=>zoomToFit(c)}
    ]
  },

  /* ───── Canvas ───── */
  {
    label:'Canvas', icon:'fa-database',
    children:[
      {label:'Save',        icon:'fa-save',   action:c=>saveCanvas(c.canvasState)},
      {label:'History',     icon:'fa-clock',  action:c=>openHistory(c)},
      {label:'Export JSON', icon:'fa-file-export', action:c=>exportJSON(c)}
    ]
  }
];

/**
 * Install (or re-attach) the radial menu to a controller.
 * Pass an optional `options` object to tweak behaviour / styling.
 *
 * @param {CanvasController} controller – current canvas controller
 * @param {Object} [options]
 * @param {number} [options.menuSize=68]       — root trigger Ø (px)
 * @param {number} [options.itemSize=56]       — item Ø (px)  ≥ 44 for WCAG
 * @param {number} [options.orbitRadius=110]   — distance root↔item centres
 * @param {number} [options.transitionTime=.35]— seconds
 * @param {boolean} [options.fullCircle=true]  — use full 360° distribution
 */
export function installRadialMenu(controller, options = {}) {
  /* ───── 0.  (re-)use existing shell if already present ─────────────────── */
  if (activeRoot) {
    /* controller was switched (drill-in/out) – simply update the reference   */
    activeRoot.__controller__ = controller;
    return;
  }

  /* ───── 1.  configuration & CSS custom-props (injected once) ───────────── */
  const cfg = {
    menuSize:        options.menuSize      ?? 68,
    itemSize:        options.itemSize      ?? 56,
    orbitRadius:     options.orbitRadius   ?? 110,
    transitionTime:  options.transitionTime?? .35,   // seconds
    fullCircle:      options.fullCircle    ?? true   // new option
  };

  if (!document.getElementById('radial-menu-style')) {
    const style = document.createElement('style');
    style.id = 'radial-menu-style';
    style.textContent = `
      :root{
        --menu-size:${cfg.menuSize}px;
        --item-size:${cfg.itemSize}px;
        --orbit-radius:${cfg.orbitRadius}px;
        --transition-time:${cfg.transitionTime}s;
        --primary-color:#2196F3;
        --ease:cubic-bezier(.22,.61,.36,1);
      }
      /* trigger ("+" button) */
      .radial-menu{position:fixed;width:var(--menu-size);height:var(--menu-size);
        z-index:999}
      .menu-trigger{width:100%;height:100%;border:none;border-radius:50%;
        background:var(--primary-color);color:#fff;font-size:1.4rem;cursor:pointer;
        position:relative;transition:transform var(--transition-time) var(--ease);
        outline:none;touch-action:none}
      .menu-trigger.active{transform:rotate(45deg)}
      /* fan container */
      .menu-items{position:absolute;top:50%;left:50%;visibility:hidden;
        pointer-events:none;outline:none}
      .menu-items.active{visibility:visible;pointer-events:auto}
      .menu-items.animating{pointer-events:none}
      /* individual item */
      .menu-item{position:absolute;width:var(--item-size);height:var(--item-size);
        transform:translate(-50%,-50%) scale(0);border-radius:50%;background:#fff;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 5px rgba(0,0,0,.25);opacity:0;
        transition:transform var(--transition-time) var(--ease),
                   opacity   var(--transition-time) var(--ease);
        cursor:pointer;border:none;font-size:1.2rem;outline:none}
      .menu-item:focus{box-shadow:0 0 0 3px rgba(33,150,243,.5)}
      /* icon */
      .menu-item i{pointer-events:none}
      /* label (hint) */
      .item-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);
        font-size:.75rem;color:#fff;background:rgba(0,0,0,.7);padding:2px 6px;
        border-radius:3px;white-space:nowrap;opacity:0;
        transition:opacity .2s var(--ease)}
      .menu-item:hover .item-label,
      .menu-item:focus .item-label{opacity:1}
    `;
    document.head.appendChild(style);
  }

  /* ───── 2.  build DOM shell ────────────────────────────────────────────── */
  const root = document.createElement('div');
  root.className = 'radial-menu';
  root.innerHTML = `
    <button class="menu-trigger" aria-label="Open menu"
            aria-expanded="false" aria-haspopup="menu">
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>
    <div class="menu-items" role="menu"></div>`;
  root.__controller__ = controller;
  document.body.appendChild(root);
  activeRoot = root;

  /* restore previous position (or bottom-right default) */
  const pos = JSON.parse(localStorage.getItem(LS_POS_KEY) || 'null');
  if (pos) {
    root.style.left = pos.x + 'px';
    root.style.top  = pos.y + 'px';
  } else { /* default bottom-right with 20 px margin */
    root.style.left = `calc(100% - ${cfg.menuSize + 20}px)`;
    root.style.top  = `calc(100% - ${cfg.menuSize + 20}px)`;
  }

  /* ───── 3.  helpers & shared state ─────────────────────────────────────── */
  const trigger  = root.querySelector('.menu-trigger');
  const itemsBox = root.querySelector('.menu-items');

  const clamp = (v,min,max)=>Math.min(max,Math.max(min,v));
  const ORBIT = cfg.orbitRadius;

  /* drag state */
  const drag = {active:false,sx:0,sy:0,sl:0,st:0};

  /* rotate state */
  const rot  = {active:false,startA:0,startR:0};
  let rotation = 0;

  /* nav stack – root plus nested sub-menus */
  let stack = [];

  /* currently focused menu-item index (keyboard navigation) */
  let focusIdx = 0;

  /* ───── 4.  helper functions for item positioning ───────────────────────── */
  // Calculate available space in each direction
  const calculateAvailableSpace = (centerX, centerY, screenBounds) => {
    return {
      left: centerX - screenBounds.left,
      right: screenBounds.right - centerX,
      top: centerY - screenBounds.top,
      bottom: screenBounds.bottom - centerY
    };
  };

  // Calculate optimal distribution to prevent overlaps
  const redistributeItems = (items, centerX, centerY, radius, screenBounds) => {
    // Start with even angular distribution
    const fullCircle = Math.PI * 2;
    const step = items.length > 0 ? fullCircle / items.length : 0;
    
    // Initial positions
    let positions = items.map((_, i) => {
      const angle = i * step + rotation;
      return {
        index: i,
        angle: angle,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        screenX: centerX + Math.cos(angle) * radius,
        screenY: centerY + Math.sin(angle) * radius
      };
    });
    
    // Calculate available space
    const availableSpace = calculateAvailableSpace(centerX, centerY, screenBounds);
    
    // Adjust for screen edges - shrink the orbit in directions with limited space
    positions = positions.map(pos => {
      // Calculate direction vectors
      const dirX = Math.sign(pos.x);
      const dirY = Math.sign(pos.y);
      
      // Calculate available space in this direction
      const availableDirX = dirX > 0 ? availableSpace.right : availableSpace.left;
      const availableDirY = dirY > 0 ? availableSpace.bottom : availableSpace.top;
      
      // If we're out of bounds, calculate scaling factor
      let scale = 1;
      
      // X constraint
      if (Math.abs(pos.x) > 0 && Math.abs(pos.x) > availableDirX) {
        const scaleX = availableDirX / Math.abs(pos.x);
        scale = Math.min(scale, scaleX);
      }
      
      // Y constraint
      if (Math.abs(pos.y) > 0 && Math.abs(pos.y) > availableDirY) {
        const scaleY = availableDirY / Math.abs(pos.y);
        scale = Math.min(scale, scaleY);
      }
      
      // Apply scaling but keep original angle for reference
      const scaledPos = { 
        ...pos,
        x: pos.x * scale,
        y: pos.y * scale, 
        screenX: centerX + pos.x * scale,
        screenY: centerY + pos.y * scale,
        originalAngle: pos.angle
      };
      
      return scaledPos;
    });
    
    // Detect and resolve overlaps
    const effectiveItemSize = cfg.itemSize * 1.2; // 20% padding
    let hasOverlap = true;
    let iterations = 0;
    const maxIterations = 5; // Prevent infinite loops
    
    while (hasOverlap && iterations < maxIterations) {
      hasOverlap = false;
      iterations++;
      
      // Check each pair of items for overlap
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const itemA = positions[i];
          const itemB = positions[j];
          
          // Calculate distance between items
          const dx = itemA.x - itemB.x;
          const dy = itemA.y - itemB.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // If items are too close
          if (distance < effectiveItemSize) {
            hasOverlap = true;
            
            // Calculate angle between items
            const angleBetween = Math.atan2(dy, dx);
            
            // Push items apart slightly along their angular difference
            const pushDistance = (effectiveItemSize - distance) / 2;
            const pushX = Math.cos(angleBetween) * pushDistance;
            const pushY = Math.sin(angleBetween) * pushDistance;
            
            // Push items in opposite directions
            positions[i].x += pushX;
            positions[i].y += pushY;
            positions[j].x -= pushX;
            positions[j].y -= pushY;
          }
        }
      }
    }
    
    // Final pass: check screen boundaries again after overlap resolution
    positions = positions.map(pos => {
      const screenX = centerX + pos.x;
      const screenY = centerY + pos.y;
      
      let finalX = pos.x;
      let finalY = pos.y;
      
      // Adjust if we went offscreen
      if (screenX < screenBounds.left) finalX += screenBounds.left - screenX;
      if (screenX > screenBounds.right) finalX -= screenX - screenBounds.right;
      if (screenY < screenBounds.top) finalY += screenBounds.top - screenY;
      if (screenY > screenBounds.bottom) finalY -= screenY - screenBounds.bottom;
      
      return { x: finalX, y: finalY };
    });
    
    return positions;
  };

    
    
  /* ───── 5.  dynamic root-level structure (depends on controller) ───────── */
  const makeRootItems = () => {
    return rootItems;
  };

  const rebuildRoot = () => { stack = [{title:'root',items:makeRootItems()}]; };

  /* ───── 6.  fan animation helpers ──────────────────────────────────────── */
  const fly = (btn,x,y,show=true,delay=0)=>{
    btn.style.transitionDelay = delay+'ms';
    requestAnimationFrame(()=>{     // ensures initial compute then animate
      btn.style.transform =
        `translate(-50%,-50%) translate(${x}px,${y}px) scale(${show?1:0})`;
      btn.style.opacity = show ? 1 : 0;
    });
  };

  /* lay out items around current root position */
  const layoutItems = (instant=false)=>{
    const r = root.getBoundingClientRect();
    const rootCenterX = r.left + r.width/2;
    const rootCenterY = r.top + r.height/2;
    const its = [...itemsBox.children];

    if (cfg.fullCircle) {
      // Full circle distribution with screen edge and overlap avoidance
      const screenBounds = {
        left: 6,
        right: innerWidth - 6,
        top: 6,
        bottom: innerHeight - 6
      };
      
      const positions = redistributeItems(its, rootCenterX, rootCenterY, ORBIT, screenBounds);
      
      its.forEach((btn, i) => {
        const { x, y } = positions[i];
        
        if (instant) {
          btn.style.transition = 'none';
          btn.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
          btn.style.opacity = 1;
          void btn.offsetWidth;
          btn.style.transition = '';
        } else {
          fly(btn, x, y, true, i * 40);
        }
      });
    } else {
      // Original 90° quadrant-based layout
      const [sL, sR, sT, sB] = [r.left, innerWidth-r.right, r.top, innerHeight-r.bottom];
      const hDir = (sL < sR) ? 1 : -1;      // open toward wider space
      const vDir = (sT < sB) ? 1 : -1;
      const base = Math.atan2(vDir, hDir);  // bisector
      const sweep = Math.PI/2;              // 90° fan
      const step = its.length > 1 ? sweep/(its.length-1) : 0;

      its.forEach((btn, i) => {
        const a = base - sweep/2 + i*step + rotation;
        let x = Math.cos(a) * ORBIT,
            y = Math.sin(a) * ORBIT;

        // Edge-protection: shrink orbit if any item would overflow 6 px
        const checkX = rootCenterX + x,
              checkY = rootCenterY + y;
        if (checkX < 6) x += 6 - checkX;
        if (checkX > innerWidth-6) x -= checkX - (innerWidth-6);
        if (checkY < 6) y += 6 - checkY;
        if (checkY > innerHeight-6) y -= checkY - (innerHeight-6);

        if (instant) {
          btn.style.transition = 'none';
          btn.style.transform = `translate(-50%,-50%) translate(${x}px,${y}px) scale(1)`;
          btn.style.opacity = 1;
          void btn.offsetWidth;
          btn.style.transition = '';
        } else {
          fly(btn, x, y, true, i * 40);
        }
      });
    }
  };

  /* ───── 7.  render current menu level ──────────────────────────────────── */
  const render = (instant=false)=>{
    let {items} = stack[stack.length-1];
    items = items //.filter(it => (it.visible?.(root.__controller__) ?? true));
    itemsBox.innerHTML = '';
    focusIdx = 0;

    items.forEach((it,idx)=>{
      const btn = document.createElement('button');
      btn.className = 'menu-item';
      btn.type      = 'button';
      btn.setAttribute('role','menuitem');
      btn.setAttribute('tabindex','-1');
      
      // Handle dynamic icon if function
      const iconClass = typeof it.icon === 'function' ? 
                     it.icon(root.__controller__) : it.icon;
                     
      // Handle dynamic label if function
      const labelText = typeof it.label === 'function' ? 
                     it.label(root.__controller__) : it.label;
                     
      btn.innerHTML = `<i class="fas ${iconClass}"></i>
                       <span class="item-label">${labelText}</span>`;
                       
      const isEnabled = true // it.enabled?.(root.__controller__) ?? true;
      if (!isEnabled) {
          btn.setAttribute('aria-disabled', 'true');
          btn.style.opacity = .4;
          btn.style.pointerEvents = 'none';
      }
      /* rotation-gesture anchor */
      
      btn.addEventListener('click',()=> {
        console.log("[RM] click", it.label, btn)
        navigator.vibrate?.(10)
        handleItem(it,btn)
      });
      itemsBox.appendChild(btn);
      btn.addEventListener('pointerdown',startRotateGesture);
      /* first item receives programmatic focus when opened */
      if(idx===0 && itemsBox.classList.contains('active')){
        requestAnimationFrame(()=>btn.focus());
      }
    });

    layoutItems(instant);
  };

  /* ───── 8.  opening / closing / drag / rotate interactions ────────────── */
  /* drag whole menu ─────────────────────────────────────────────────────── */
  trigger.addEventListener('pointerdown',e=>{
    console.log("[RM] start drag", drag.active)
    drag.active=1;
    drag.sx=e.clientX; drag.sy=e.clientY;
    const r=root.getBoundingClientRect();
    drag.sl=r.left; drag.st=r.top;
    trigger.setPointerCapture(e.pointerId);
  });
  
  trigger.addEventListener('pointermove',e=>{
    console.log("[RM] drag", drag.active)
    if(!drag.active == 1) return;
    drag.active = 2;
    const dx=e.clientX-drag.sx,
          dy=e.clientY-drag.sy;
    const size=parseFloat(getComputedStyle(root).width);
    const nx=clamp(drag.sl+dx,0,innerWidth-size),
          ny=clamp(drag.st+dy,0,innerHeight-size);
    root.style.left=nx+'px';
    root.style.top =ny+'px';
    
    // Recalculate menu positions when dragging while menu is open
    if (itemsBox.classList.contains('active')) {
      layoutItems(true);
    }
  });
  
  const endDrag = ()=>{
    console.log("[RM] end drag", drag.active)
    if(drag.active){
      /* persist position */
      localStorage.setItem(LS_POS_KEY,JSON.stringify({
        x:parseFloat(root.style.left),
        y:parseFloat(root.style.top)
      }));
    }
    drag.active=0;
  };
  trigger.addEventListener('pointerup',endDrag);
  trigger.addEventListener('pointercancel',endDrag);

  /* open / close / back ─────────────────────────────────────────────────── */
  trigger.addEventListener('click',e=>{
    console.log("[RM] trigger click", drag.active)
    if(drag.active === 2){ drag.active=0; return; } // ignore click finishing drag

    if(stack.length===1){
      /* root level */
      if(!itemsBox.classList.contains('active')){
        /* opening */
        rebuildRoot();
        rotation=0;
        itemsBox.classList.add('active');
        trigger.classList.add('active');
        trigger.setAttribute('aria-expanded','true');
        render();
      }else{
        /* closing */
        closeRoot();
      }
    }else{
      /* back one submenu level */
      stack.pop();
      animateBackAndRender();
    }
  });

  /* rotate fan (pointer rotate-drag) ────────────────────────────────────── */
  function startRotateGesture(e){
    console.log("[RM] startRotateGesture", e, itemsBox)
    if(!itemsBox.classList.contains('active')||
       itemsBox.classList.contains('animating')) return;
    // e.stopPropagation();
    rot.active=true;
    const cen=root.getBoundingClientRect(),
          cx=cen.left+cen.width/2,
          cy=cen.top +cen.height/2;
    rot.startA=Math.atan2(e.clientY-cy,e.clientX-cx);
    rot.startR=rotation;
    itemsBox.setPointerCapture(e.pointerId);
  }
  itemsBox.addEventListener('pointermove',e=>{
    if(!rot.active) return;
    const cen=root.getBoundingClientRect(),
          cx=cen.left+cen.width/2,
          cy=cen.top +cen.height/2;
    const ang=Math.atan2(e.clientY-cy,e.clientX-cx);
    rotation=rot.startR+(ang-rot.startA);
    layoutItems(true);
  });
  itemsBox.addEventListener('pointerup',  ()=>rot.active=false);
  itemsBox.addEventListener('pointercancel',()=>rot.active=false);

  /* handle item click / submenu dive / action exec ─────────────────────── */
  function handleItem(it,btn){
    console.log("[RM] handle item (click)", it, btn)
    if(it.children){
      /* dive into submenu */
      const others=[...itemsBox.children].filter(b=>b!==btn);
      others.forEach(b=>fly(b,0,0,false));
      fly(btn,0,0,true);
      itemsBox.classList.add('animating');
      btn.addEventListener('transitionend',function go(ev){
        if(ev.propertyName!=='transform') return;
        btn.removeEventListener('transitionend',go);
        itemsBox.classList.remove('animating');
        stack.push({title:it.label,items:it.children});
        trigger.querySelector('i').className='fas fa-arrow-left';
        rotation=0;
        render();
      });
    }else if(typeof it.action==='function'){
      it.action(root.__controller__);
    }
  }

  /* close root helper ───────────────────────────────────────────────────── */
  function closeRoot(){
    if(!itemsBox.classList.contains('active')) return;
    const childs=[...itemsBox.children];
    childs.forEach((b,i)=>fly(b,0,0,false,i*30));
    trigger.classList.remove('active');
    trigger.setAttribute('aria-expanded','false');
    setTimeout(()=>itemsBox.classList.remove('active'),
      cfg.transitionTime*1000+childs.length*30);
    trigger.querySelector('i').className='fas fa-plus';
    stack=[stack[0]]; // reset to root only
  }

  /* animate back one level then render current */
  function animateBackAndRender(){
    const current=[...itemsBox.children];
    current.forEach((b,i)=>fly(b,0,0,false,i*30));
    itemsBox.classList.add('animating');
    const t=cfg.transitionTime*1000+current.length*30;
    setTimeout(()=>{
      itemsBox.classList.remove('animating');
      trigger.querySelector('i').className=
        stack.length===1?'fas fa-plus':'fas fa-arrow-left';
      render();
    },t);
  }

  /* ───── 9.  keyboard accessibility & focus trapping ───────────────────── */
  document.addEventListener('keydown',function keyNav(e){
    if(!itemsBox.classList.contains('active')) return;

    const items=[...itemsBox.querySelectorAll('.menu-item')];
    const maxIdx=items.length-1;

    const focusItem = idx=>{
      focusIdx=(idx+items.length)%items.length;
      items[focusIdx].focus();
    };

    switch(e.key){
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();focusItem(focusIdx+1);break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();focusItem(focusIdx-1);break;
      case 'Enter':
      case ' ':
        e.preventDefault();items[focusIdx].click();break;
      case 'Escape':
        e.preventDefault();
        if(stack.length>1){
          /* back one submenu */
          stack.pop();
          animateBackAndRender();
        }else{
          closeRoot();
        }
        break;
      case 'Tab':
        e.preventDefault();
        focusItem(focusIdx+(e.shiftKey?-1:1));
        break;
    }
  });
  
  /* ───── 10. Window resize handler for adjusting positions ───────────────── */
  const handleResize = () => {
    if (itemsBox.classList.contains('active')) {
      layoutItems(true);
    }
  };
  
  window.addEventListener('resize', handleResize);

  /* ensure root exists fully hidden (so first open animates cleanly) */
  rebuildRoot();
  render(true);
}
