/* ---------------------------------------------------------------------------
 *  command-palette.js              (2025-05-06)
 *  Bottom-centre command bar + fuzzy suggestions.
 *  – Shows command tree items (from radial-menu-items.js)
 *  – Also lists existing canvas elements (icon + truncated content)
 *  – ENTER on no match  → new markdown node at viewport centre
 *  – ENTER on element   → zoom-to-fit + select the element
 *  – ENTER on command   → run the original .action(controller)
 * ------------------------------------------------------------------------- */

import { buildRootItems } from './menu-items.js';
import { editElementWithPrompt } from './generation.js';

/* public entry point -- mirrors installRadialMenu() signature */
export function installCommandPalette(controller, opts = {}) {
  const cfg = { maxResults: 7, fuzziness: false, ...opts };

  /* ----------------------------------------------------------------------- */
  /*  Flatten the command tree once                                          */
  /* ----------------------------------------------------------------------- */
  function flattenCommands() {
    const out = [];
    function walk(items, path) {
      items.forEach(it => {
        try {
          if (it.visible && !it.visible(controller)) return;
          if (it.enabled && !it.enabled(controller)) return;
        } catch (err) {
          console.error('Error checking command visibility:', err);
          return;
        }
        const lbl = typeof it.label === 'function' ? it.label(controller, cfg) : it.label;
        const nextPath = [...path, lbl];
        if (it.children) walk(it.children, nextPath);
        else out.push({
          kind: 'command',
          path: nextPath,
          action: it.action,
          searchText: nextPath.join(' ').toLowerCase()
        });
      });
    }
    walk(buildRootItems(cfg), []);
    return out;
  }
  let commandPool = () => flattenCommands();

  /* ----------------------------------------------------------------------- */
  /*  Helpers for element suggestions                                        */
  /* ----------------------------------------------------------------------- */
  function iconForType(t) {
    return t === 'img' ? 'fa-image'
      : t === 'markdown' ? 'fa-brands fa-markdown'
        : t === 'html' ? 'fa-code'
          : 'fa-font';
  }
  function buildElementPool() {
    return controller.canvasState.elements.map(el => {
      const raw = (el.content ?? '').replace(/\s+/g, ' ').trim();
      const txt = raw.length > 40 ? raw.slice(0, 40) + '…' : raw || '(empty)';
      return {
        kind: 'element',
        id: el.id,
        label: txt,
        icon: iconForType(el.type),
        searchText: txt.toLowerCase()
      };
    });
  }

  /* ----------------------------------------------------------------------- */
  /*  DOM skeleton                                                           */
  /* ----------------------------------------------------------------------- */
  const root = document.createElement('div');
  root.id = 'cmd-palette';
  root.classList.add('empty');  // initial state
  root.innerHTML = `
    <input type="text" autocomplete="off" spellcheck="false"
           placeholder="› Type a command…" />
    <ul class="suggestions"></ul>`;
  document.body.appendChild(root);

  const $input = root.querySelector('input');
  const $list = root.querySelector('.suggestions');

  /* ----------------------------------------------------------------------- */
  /*  Render loop                                                            */
  /* ----------------------------------------------------------------------- */
  let filtered = [], sel = -1;      // currently displayed subset + selection index

  function render() {
    $list.innerHTML = '';
    filtered.forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'suggestion' + (i === sel ? ' active' : '');
      if (it.kind === 'command') {
        // breadcrumbs
        li.innerHTML = it.path.map(p => `<span class="crumb">${p}</span>`).join('');
      } else {
        // element row
        li.innerHTML =
          `<span class="s-icon"><i class="fa-solid ${it.icon}"></i></span>` +
          `<span class="crumb">${it.label}</span>`;
      }
      li.onclick = () => run(it);
      $list.appendChild(li);
    });
  }

  /* ----------------------------------------------------------------------- */
  /*  Filter function                                                        */
  /* ----------------------------------------------------------------------- */
  function computeFiltered(q) {
    if (!q) return [];
    const term = q.toLowerCase();
    const pool = [...commandPool(), ...buildElementPool()];
    return pool
      .filter(i => i.searchText.includes(term))
      .slice(0, cfg.maxResults);
  }

  /* ----------------------------------------------------------------------- */
  /*  Action handlers                                                        */
  /* ----------------------------------------------------------------------- */
  function run(item) {
    console.log("[CMD] run item", item)
    if (!item) return;
    if (item.kind === 'command') {
      console.log("[CMD] run command", item)
      item.action?.(controller);
    } else {                    // element
      console.log("[CMD] run element", item)
      controller.selectElement(item.id);
      zoomToElement(controller, item.id);
      controller.switchMode?.('navigate');
    }
    reset();
  }

  function reset() {
    $input.value = '';
    sel = -1;
    filtered = [];
    root.classList.add('empty');
    render();
  }

  /* ----------------------------------------------------------------------- */
  /*  Zoom-to-fit a single element                                           */
  /* ----------------------------------------------------------------------- */
  function zoomToElement(ctrl, elId) {
    const el = ctrl.findElementById(elId);
    if (!el) return;
    const canvasBox = ctrl.canvas.getBoundingClientRect();
    const margin = 60;                               // px around the element
    const w = el.width * (el.scale || 1) + margin;
    const h = el.height * (el.scale || 1) + margin;
    const scaleX = canvasBox.width / w;
    const scaleY = canvasBox.height / h;
    ctrl.viewState.scale = Math.min(scaleX, scaleY, ctrl.MAX_SCALE);
    ctrl.recenterOnElement(elId);
    ctrl.updateCanvasTransform();
    ctrl.saveLocalViewState?.();
  }

  /* ----------------------------------------------------------------------- */
  /*  Event wiring                                                           */
  /* ----------------------------------------------------------------------- */
  $input.addEventListener('focus', () => {
    root.classList.add('focused');
    window.scrollTo(0, 0);
    document.body.scrollTop = 0;
  });
  $input.addEventListener('blur', () => {
    //root.classList.remove('focused');
    /* keep suggestions open if value exists & element clicked */
    // setTimeout(() => !document.activeElement.closest('#cmd-palette') && reset(), 10);
  });

  $input.addEventListener('input', e => {
    const q = e.target.value.trim();
    root.classList.toggle('empty', q === '');
    filtered = computeFiltered(q);
    sel = -1;
    render();
  });

  $input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && filtered.length) {
      sel = (sel + 1) % filtered.length;
      render();
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && filtered.length) {
      sel = (sel - 1 + filtered.length) % filtered.length;
      render();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      const value = $input.value.trim();
      if (sel >= 0) {
        // run the selected suggestion
        run(filtered[sel]);
      } else if (value) {
        const promptText = value;
        const selId = controller.selectedElementId;
        if (selId) {
          // If an element is selected, edit it with our new helper
          const el = controller.findElementById(selId);
          editElementWithPrompt(promptText, el, controller)
            .catch(err => console.error('Edit helper failed', err));
          reset();
        } else {
          // No selection → create a new markdown node
          const rect = controller.canvas.getBoundingClientRect();
          const pt = controller.screenToCanvas(rect.width / 2, rect.height / 2);
          controller.createNewElement(pt.x, pt.y, 'markdown', promptText);
          reset();
        }
      }
    } else if (e.key === 'Escape') {
      reset();
    }
  });

  /* quick shortcut – Cmd/Ctrl + K */
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      $input.focus(); $input.select();
    }
  });

  /* first paint */
  render();
}

/* ---------------------------------------------------------------------------
 *  End of module
 * ------------------------------------------------------------------------- */
