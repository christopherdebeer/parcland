/* ---------------------------------------------------------------------------
 *  command-palette.js                drop-in replacement for radial menu
 * ------------------------------------------------------------------------- */
import { buildRootItems } from './radial-menu-items.js';

export function installCommandPalette(controller, opts = {}) {
  const cfg = { maxResults: 7, ...opts };
  const flat = flatten(controller, cfg);

  // ---------- 1. DOM -------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'cmd-palette';
  root.innerHTML = /*html*/`
    <input type="text" autocomplete="off" />
    <ul class="suggestions"></ul>`;
  document.body.appendChild(root);

  const $input = root.querySelector('input');
  const $list  = root.querySelector('.suggestions');

  // ---------- 2. render helpers -------------------------------------------
  let filtered = flat, sel = -1;
  function render() {
    $list.innerHTML = '';
    filtered.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'suggestion' + (i === sel ? ' active' : '');
      li.innerHTML = it.path.map(p => `<span class="crumb">${p}</span>`).join('');
      li.onclick = () => run(it);
      $list.appendChild(li);
    });
  }
  function run(item) { item.action(controller); reset(); }
  function reset() { $input.value=''; sel=-1; filtered=flat; render(); }

  // ---------- 3. events ----------------------------------------------------
  $input.addEventListener('input', e => {
    sel = -1;
    filtered = filter(flat, e.target.value);
    render();
  });
  $input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { sel = (sel+1)%filtered.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = (sel-1+filtered.length)%filtered.length; render(); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (sel >= 0) run(filtered[sel]);
      else {
        // default: new node
        const { width:hW, height:hH } = controller.canvas.getBoundingClientRect();
        const pt = controller.screenToCanvas(hW/2, hH/2);
        controller.createNewElement(pt.x, pt.y, 'markdown', $input.value);
        reset();
      }
    } else if (e.key === 'Escape') reset();
  });

  // optional: focus palette with Cmd+K
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); $input.focus(); $input.select();
    }
  });

  render();    // initial
}

/* --- helpers ------------------------------------------------------------ */
function flatten(controller, cfg) {
  const flat=[]; const root=buildRootItems(cfg);
  (function walk(items,path){
    items.forEach(it=>{
      if(it.visible && !it.visible(controller)) return;
      const p=[...path,typeof it.label==='function'?it.label(controller,cfg):it.label];
      if(it.children) walk(it.children,p);
      else flat.push({path:p,action:it.action});
    });
  })(root,[]);
  return flat;
}
function filter(list,q){ if(!q)return list.slice(0,7);
  const t=q.toLowerCase();
  return list.filter(i=>i.path.join(' ').toLowerCase().includes(t)).slice(0,7);
}
