/* command-palette.js  – two-step commands + clear button */

import { buildRootItems } from './menu-items.js';
import { editElementWithPrompt } from './generation.js';

export function installCommandPalette(controller, opts = {}) {
  const cfg = { maxResults: 7, fuzziness: false, ...opts };

  /* ── flatten commands ── */
  function flattenCommands() {
    const out = [];
    function walk(items, path) {
      items.forEach(it => {
        try {
          if (it.visible && !it.visible(controller)) return;
          if (it.enabled && !it.enabled(controller)) return;
        } catch { return; }
        const lbl = typeof it.label === 'function' ? it.label(controller, cfg) : it.label;
        const nextPath = [...path, lbl];
        if (it.children) walk(it.children, nextPath);
        else out.push({
          kind: 'command',
          path: nextPath,
          action: it.action,
          needsInput: !!it.needsInput,
          searchText: nextPath.join(' ').toLowerCase()
        });
      });
    }
    walk(buildRootItems(controller), []);
    return out;
  }
  const commandPool = () => flattenCommands();

  /* ── element suggestions ── */
  const iconForType = t =>
    t === 'img' ? 'fa-image' : t === 'markdown' ? 'fa-brands fa-markdown' :
    t === 'html' ? 'fa-code' : 'fa-font';

  const buildElementPool = () => controller.canvasState.elements.map(el => {
    const raw = (el.content ?? '').replace(/\s+/g, ' ').trim();
    const txt = raw.length > 40 ? raw.slice(0, 40) + '…' : raw || '(empty)';
    return { kind:'element', id:el.id, label:txt, icon:iconForType(el.type), searchText:txt.toLowerCase() };
  });

  /* ── DOM skeleton ── */
  const root = document.createElement('div');
  root.id = 'cmd-palette';
  root.classList.add('empty');
  root.innerHTML = `
    <input type="text" autocomplete="off" spellcheck="false" placeholder="› Type a command…" />
    <button id="cmd-clear">&times;</button>
    <ul class="suggestions"></ul>`;
  document.body.appendChild(root);

  const $input  = root.querySelector('input');
  const $list   = root.querySelector('.suggestions');
  const $clear  = root.querySelector('#cmd-clear');

  /* ── state ── */
  let filtered=[], sel=-1;
  let mode='browse';           // 'browse' | 'awaiting'
  let pending=null;            // command awaiting free-text

  /* ── render ── */
  const render = () => {
    $list.innerHTML='';
    filtered.forEach((it,i)=>{
      const li=document.createElement('li');
      li.className='suggestion'+(i===sel?' active':'');
      li.innerHTML = it.kind==='command'
        ? it.path.map(p=>`<span class="crumb">${p}</span>`).join('')
        : `<span class="s-icon"><i class="fa-solid ${it.icon}"></i></span><span class="crumb">${it.label}</span>`;
      li.onclick=()=>run(it);
      $list.appendChild(li);
    });
  };

  const computeFiltered = q=>{
    if(!q) return [];
    const term=q.toLowerCase();
    return [...commandPool(),...buildElementPool()]
      .filter(i=>i.searchText.includes(term))
      .slice(0,cfg.maxResults);
  };

  /* ── helpers ── */
  const startInput = cmd=>{
    mode='awaiting';
    pending=cmd;
    $input.value='';
    $input.placeholder=cmd.path.at(-1)+'…';
    $input.focus();
    root.classList.add('awaiting');
    filtered=[]; sel=-1; render();
  };
  const quitInput=()=>{
    mode='browse'; pending=null;
    $input.placeholder='› Type a command…';
    
    reset();
  };

  /* ── run ── */
  function run(item){
    if(!item) return;
    if(item.kind==='command'){
      if(item.needsInput){ startInput(item); return; }
      item.action?.(controller);
    }else{
      controller.selectElement(item.id);
      zoomToElement(controller,item.id);
      controller.switchMode?.('navigate');
    }
    reset();
  }

  const reset=()=>{
    $input.value=''; sel=-1; filtered=[]; root.classList.add('empty'); render();
  };

  /* ── zoom helper ── */
  const zoomToElement=(ctrl,id)=>{
    const el=ctrl.findElementById(id); if(!el) return;
    const box=ctrl.canvas.getBoundingClientRect(), m=60;
    const w=el.width*(el.scale||1)+m, h=el.height*(el.scale||1)+m;
    ctrl.viewState.scale=Math.min(box.width/w,box.height/h,ctrl.MAX_SCALE);
    ctrl.recenterOnElement(id); ctrl.updateCanvasTransform(); ctrl.saveLocalViewState?.();
  };

  /* ── events ── */
  $input.addEventListener('focus',()=>{
    root.classList.add('focused'); window.scrollTo(0,0);
  });
  $input.addEventListener('input',e=>{
    const q=e.target.value.trim();
    root.classList.toggle('empty',q==='');
    filtered=computeFiltered(q); sel=-1; render();
  });

  $input.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'&&filtered.length){ sel=(sel+1)%filtered.length; render(); e.preventDefault(); }
    else if(e.key==='ArrowUp'&&filtered.length){ sel=(sel-1+filtered.length)%filtered.length; render(); e.preventDefault(); }
    else if(e.key==='Enter'){
      const val=$input.value.trim();
      if(mode==='awaiting'){ pending?.action?.(controller,val); quitInput(); return; }
      if(sel>=0) run(filtered[sel]);
      else if(val){
        const selId=controller.selectedElementId;
        if(selId){
          editElementWithPrompt(val,controller.findElementById(selId),controller).catch(console.error);
          reset();
        }else{
          const r=controller.canvas.getBoundingClientRect();
          const pt=controller.screenToCanvas(r.width/2,r.height/2);
          controller.createNewElement(pt.x,pt.y,'markdown',val); reset();
        }
      }
    }else if(e.key==='Escape'){
      mode==='awaiting'?quitInput():reset();
    }
  });

  $clear.onclick=quitInput;

  window.addEventListener('keydown',e=>{
    if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); $input.focus(); $input.select(); }
  });

  render();
}
