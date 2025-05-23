/* command-palette.js  – enhanced command palette with categories, shortcuts, and recent commands */

import { buildRootItems } from './menu-items.js';
import { editElementWithPrompt } from './generation.js';
import { installKeyboardShortcuts } from './keyboard-shortcuts.js';

// Import CSS
import './command-palette.css';

export function installCommandPalette(controller, opts = {}) {
  const cfg = { maxResults: 10, fuzziness: true, recentCommandsCount: 5, ...opts };

  /* ── flatten commands ── */
  function flattenCommands() {
    const out = [];
    function walk(items, path, category = null) {
      items.forEach(it => {
        try {
          if (it.visible && !it.visible(controller)) return;
          if (it.enabled && !it.enabled(controller)) return;
        } catch { return; }
        const lbl = typeof it.label === 'function' ? it.label(controller, cfg) : it.label;
        const nextPath = [...path, lbl];
        const currentCategory = it.category || category;
        
        if (it.children) walk(it.children, nextPath, currentCategory);
        else out.push({
          kind: 'command',
          path: nextPath,
          action: it.action,
          needsInput: it.needsInput,
          shortcut: it.shortcut || null,
          category: currentCategory,
          icon: it.icon || null,
          searchText: nextPath.join(' ').toLowerCase() + ' ' + (currentCategory || '').toLowerCase()
        });
      });
    }
    walk(buildRootItems(controller), []);
    return out;
  }
  const commandPool = () => flattenCommands();
  
  // Store recent commands
  const recentCommands = [];
  const addToRecent = (cmd) => {
    // Remove if already exists
    const index = recentCommands.findIndex(c => 
      c.path.join(' ') === cmd.path.join(' '));
    if (index > -1) recentCommands.splice(index, 1);
    
    // Add to beginning
    recentCommands.unshift(cmd);
    
    // Keep only the specified number of recent commands
    if (recentCommands.length > cfg.recentCommandsCount) {
      recentCommands.pop();
    }
  };

  /* ── element suggestions ── */
  const iconForType = t =>
    t === 'img' ? 'fa-image' : t === 'markdown' ? 'fa-brands fa-markdown' :
      t === 'html' ? 'fa-code' : 'fa-font';

  const buildElementPool = () => controller.canvasState.elements.map(el => {
    const raw = (el.content ?? '').replace(/\s+/g, ' ').trim();
    const txt = raw.length > 40 ? raw.slice(0, 40) + '…' : raw || '(empty)';
    return { 
      kind: 'element', 
      id: el.id, 
      label: txt, 
      icon: iconForType(el.type), 
      type: el.type,
      searchText: txt.toLowerCase() + ' ' + el.type.toLowerCase()
    };
  });
  
  /* ── fuzzy search ── */
  function fuzzyMatch(text, query) {
    if (!cfg.fuzziness) return text.includes(query);
    
    // Simple fuzzy matching algorithm
    let textIndex = 0;
    let queryIndex = 0;
    let score = 0;
    
    while (textIndex < text.length && queryIndex < query.length) {
      if (text[textIndex] === query[queryIndex]) {
        score += 2; // Consecutive matches get higher score
        queryIndex++;
      } else {
        score -= 0.5; // Penalty for skipping
      }
      textIndex++;
    }
    
    // Return true if we matched all query characters with a positive score
    return queryIndex === query.length && score > 0;
  }

  /* ── DOM skeleton ── */
  const root = document.createElement('div');
  root.id = 'cmd-palette';
  root.classList.add('empty');
  root.innerHTML = `
    <div class="cmd-header">
      <div class="recent-commands-label">Recent Commands</div>
    </div>
    <ul class="suggestions"></ul>
    <div class="cmd-wrapper">
      <span class="cmd-icon">
        <i class="fa-solid fa-search"></i>
        <i class="fa-solid fa-spinner"></i>
        <i class="fa-solid fa-terminal"></i>
      </span>
      <input type="text" autocomplete="off" spellcheck="false" placeholder="› Type a command…" />
      <button id="cmd-clear">&times;</button>
    </div>
    <div class="cmd-footer">
      <div class="desktop">
        <span class="cmd-tip"><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
        <span class="cmd-tip"><kbd>Enter</kbd> to select</span>
        <span class="cmd-tip"><kbd>Esc</kbd> to dismiss</span>
      </div>
      <div class="mobile">
        <span class="cmd-tip"><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
        <span class="cmd-tip"><kbd>Enter</kbd> to select</span>
        <span class="cmd-tip"><kbd>Esc</kbd> to dismiss</span>
      </div>
    </div>
    `;
  document.body.appendChild(root);

  const $input = root.querySelector('input');
  const $list = root.querySelector('.suggestions');
  const $clear = root.querySelector('#cmd-clear');
  const $recentLabel = root.querySelector('.recent-commands-label');

  /* ── state ── */
  let filtered = [], sel = -1;
  let mode = 'browse';           // 'browse' | 'awaiting' | 'pending'
  let pending = null;            // command awaiting free-text
  let showingRecent = false;     // whether we're showing recent commands

  /* ── render ── */
  const render = () => {
    $list.innerHTML = '';
    $recentLabel.style.display = showingRecent ? 'block' : 'none';
    
    (mode === 'browse' ? filtered: []).forEach((it, i) => {
      const li = document.createElement('li');
      li.className = 'suggestion' + (i === sel ? ' active' : '');
      
      if (it.kind === 'command') {
        let iconHtml = '';
        if (it.icon) {
          iconHtml = `<span class="s-icon"><i class="fa-solid ${it.icon}"></i></span>`;
        }
        
        let categoryHtml = '';
        if (it.category) {
          categoryHtml = `<span class="cmd-category">${it.category}</span>`;
        }

        let inputHtml = '';
        if (it.needsInput) {
          inputHtml = `<span class="cmd-input"><kbd>${it.needsInput}</kbd></span>`;
        }
        
        let shortcutHtml = '';
        if (it.shortcut) {
          shortcutHtml = `<span class="cmd-shortcut"><kbd>${it.shortcut}</kbd></span>`;
        }
        
        const pathHtml = it.path.map((p, idx) => {
          const isLast = idx === it.path.length - 1;
          return `<span class="crumb${isLast ? ' last-crumb' : ''}">${p}</span>`;
        }).join('');
        
        li.innerHTML = `
          ${iconHtml}
          <div class="cmd-content">
            ${pathHtml}
            ${inputHtml}
          </div>
          ${categoryHtml}
          ${shortcutHtml}
        `;
      } else {
        li.innerHTML = `
          <span class="s-icon"><i class="fa-solid ${it.icon}"></i></span>
          <div class="cmd-content">
            <span class="crumb last-crumb">${it.label}</span>
            <span class="cmd-category">${it.type}</span>
          </div>
        `;
      }
      
      li.onclick = () => run(it);
      $list.appendChild(li);
    });
  };

  const computeFiltered = q => {
    if (!q) {
      // Show recent commands when no query
      showingRecent = recentCommands.length > 0;
      return showingRecent ? recentCommands : [];
    }
    
    showingRecent = false;
    const term = q.toLowerCase();
    
    // Combine command pool and element pool
    const allItems = [...commandPool(), ...buildElementPool()];
    
    // Filter based on fuzzy search or regular includes
    const matchedItems = cfg.fuzziness
      ? allItems.filter(i => fuzzyMatch(i.searchText, term))
      : allItems.filter(i => i.searchText.includes(term));
    
    // Sort by relevance - exact matches first, then by path length (shorter paths first)
    return matchedItems
      .sort((a, b) => {
        // Exact matches first
        const aExact = a.searchText.includes(' ' + term + ' ');
        const bExact = b.searchText.includes(' ' + term + ' ');
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by path length (shorter paths first)
        if (a.kind === 'command' && b.kind === 'command') {
          return a.path.length - b.path.length;
        }
        
        return 0;
      })
      .slice(0, cfg.maxResults);
  };

  /* ── helpers ── */
  const startInput = cmd => {
    mode = 'awaiting';
    pending = cmd;
    $input.value = '';
    $input.placeholder = cmd.path.at(-1) + '…';
    $input.focus();
    root.classList.add('awaiting');
    filtered = []; sel = -1; render();
  };
  const quitInput = () => {
    mode = 'browse'; pending = null;
    root.classList.remove('awaiting');
    root.classList.remove('pending');
    $input.placeholder = '› Type a command…';
    reset();
  };

  const enterPending = (p) => {
    mode = 'pending'; pending = p;
    $input.value = '';
    root.classList.add('pending');
    root.classList.remove('awaiting');
    p?.then(quitInput);
  }

  /* ── run ── */
  function run(item) {
    if (!item) return;
    if (item.kind === 'command') {
      // Add to recent commands
      addToRecent(item);
      
      if (item.needsInput) { 
        startInput(item); 
        return; 
      }
      item.action?.(controller);
    } else {
      controller.selectElement(item.id);
      zoomToElement(controller, item.id);
      controller.switchMode?.('navigate');
    }
    reset();
  }

  const reset = () => {
    $input.value = ''; 
    sel = -1; 
    filtered = showingRecent ? recentCommands : [];
    root.classList.add('empty'); 
    render();
  };

  /* ── zoom helper ── */
  const zoomToElement = (ctrl, id) => {
    const el = ctrl.findElementById(id); if (!el) return;
    const box = ctrl.canvas.getBoundingClientRect(), m = 60;
    const w = el.width * (el.scale || 1) + m, h = el.height * (el.scale || 1) + m;
    ctrl.viewState.scale = Math.min(box.width / w, box.height / h, ctrl.MAX_SCALE);
    ctrl.recenterOnElement(id); ctrl.updateCanvasTransform(); ctrl.saveLocalViewState?.();
  };

  /* ── events ── */
  $input.addEventListener('focus', () => {
    root.classList.add('focused'); 
    window.scrollTo(0, 0);
    
    // Show recent commands when focused with empty input
    if (!$input.value.trim()) {
      filtered = recentCommands.length > 0 ? recentCommands : [];
      showingRecent = recentCommands.length > 0;
      render();
    }
  });
  
  $input.addEventListener('input', e => {
    const q = e.target.value.trim();
    root.classList.toggle('empty', q === '');
    filtered = computeFiltered(q); 
    sel = -1; 
    render();
  });

  $input.addEventListener('blur', e => {
    root.classList.remove('focused');
  });

  $input.addEventListener('keydown', async (e) => {
    // Tab completion - select first item
    if (e.key === 'Tab' && filtered.length && sel === -1) {
      sel = 0; 
      render(); 
      e.preventDefault();
      return;
    }
    
    // Navigation
    if (e.key === 'ArrowDown' && filtered.length) { 
      sel = (sel + 1) % filtered.length; 
      render(); 
      e.preventDefault(); 
    }
    else if (e.key === 'ArrowUp' && filtered.length) { 
      sel = (sel - 1 + filtered.length) % filtered.length; 
      render(); 
      e.preventDefault(); 
    }
    else if (e.key === 'Enter') {
      const val = $input.value.trim();
      if (mode === 'awaiting') { 
        enterPending();
        const res = await pending?.action?.(controller, val); 
        quitInput(); 
        return; 
      }
      
      if (sel >= 0) {
        run(filtered[sel]);
      }
      else if (val) {
        const selId = controller.selectedElementId;
        if (selId) {
          editElementWithPrompt(val, controller.findElementById(selId), controller).catch(console.error);
          reset();
        } else {
          const r = controller.canvas.getBoundingClientRect();
          const pt = controller.screenToCanvas(r.width / 2, r.height / 2);
          controller.createNewElement(pt.x, pt.y, 'markdown', val); 
          reset();
        }
      }
    } else if (e.key === 'Escape') {
      mode === 'awaiting' ? quitInput() : reset();
      root.classList.remove('focused');
    }
  });

  $clear.onclick = quitInput;

  // Global keyboard shortcut to open command palette
  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { 
      e.preventDefault(); 
      $input.focus(); 
      $input.select(); 
      
      // Show recent commands when opened
      if (recentCommands.length > 0) {
        filtered = recentCommands;
        showingRecent = true;
        render();
      }
    }
  });

  // Initialize with recent commands if available
  filtered = recentCommands.length > 0 ? recentCommands : [];
  showingRecent = recentCommands.length > 0;
  render();
  
  // Install keyboard shortcuts
  installKeyboardShortcuts(controller);
}
