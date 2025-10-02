/* command-palette.js  – enhanced command palette with categories, shortcuts, and recent commands */

import { buildRootItems } from './menu-items.ts';
import { editElementWithPrompt } from '../network/generation.ts';
import { installKeyboardShortcuts } from './keyboard-shortcuts.ts';
import type { CanvasController, CommandItem, ElementSuggestion, SuggestionItem, MenuItem } from '../../types.ts';

// Import CSS
import './command-palette.css';

interface CommandPaletteConfig {
  maxResults: number;
  fuzziness: boolean;
  recentCommandsCount: number;
}

type PaletteMode = 'browse' | 'awaiting' | 'pending';

export function installCommandPalette(controller: CanvasController, opts: Partial<CommandPaletteConfig> = {}): (() => void) | undefined {
  const cfg: CommandPaletteConfig = { maxResults: 10, fuzziness: true, recentCommandsCount: 5, ...opts };

  

  /* ── flatten commands ── */
  function flattenCommands(): CommandItem[] {
    const out: CommandItem[] = [];
    function walk(items: MenuItem[], path: string[], category: string | null = null): void {
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
  const commandPool = (): CommandItem[] => flattenCommands();
  
  // Store recent commands
  const recentCommands: CommandItem[] = [];
  const addToRecent = (cmd: CommandItem): void => {
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
  const iconForType = (t: string): string =>
    t === 'img' ? 'fa-image' : t === 'markdown' ? 'fa-brands fa-markdown' :
      t === 'html' ? 'fa-code' : 'fa-font';

  const buildElementPool = (): ElementSuggestion[] => controller.canvasState.elements.map(el => {
    const raw = (el.content ?? '').replace(/\s+/g, ' ').trim();
    const txt = raw.length > 40 ? raw.slice(0, 40) + '…' : raw || '(empty)';
    return {
      kind: 'element' as const,
      id: el.id,
      label: txt,
      icon: iconForType(el.type),
      type: el.type,
      searchText: txt.toLowerCase() + ' ' + el.type.toLowerCase()
    };
  });
  
  /* ── fuzzy search ── */
  function fuzzyMatch(text: string, query: string): boolean {
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
      <span class="presence"></span>
      <div class="desktop">
        <span class="cmd-tip"><kbd>↑</kbd><kbd>↓</kbd> to navigate</span>
        <span class="cmd-tip"><kbd>Enter</kbd> to select</span>
        <span class="cmd-tip"><kbd>Esc</kbd> to dismiss</span>
      </div>
      <div class="mobile">
        
      </div>
    </div>
    `;
  document.body.appendChild(root);

  const $input = root.querySelector('input') as HTMLInputElement;
  const $list = root.querySelector('.suggestions') as HTMLUListElement;
  const $clear = root.querySelector('#cmd-clear') as HTMLButtonElement;
  const $recentLabel = root.querySelector('.recent-commands-label') as HTMLDivElement;
  const $presence = root.querySelector('.cmd-footer .presence') as HTMLSpanElement;

  /* ── state ── */
  let filtered: SuggestionItem[] = [];
  let sel = -1;
  let mode: PaletteMode = 'browse';           // 'browse' | 'awaiting' | 'pending'
  let pending: CommandItem | null = null;            // command awaiting free-text
  let showingRecent = false;     // whether we're showing recent commands


  controller.crdt.onPresenceChange((awareness: any[]) => {
    controller.requestRender();
    $presence.innerHTML = `${awareness.map(p => `<span class="client">${p.client.clientId}</span>`).join('')}<span class="total">${awareness.length} peers</span>`;
  });

  /* ── render ── */
  const render = (): void => {
    $list.innerHTML = '';
    $recentLabel.style.display = showingRecent ? 'block' : 'none';

    (mode === 'browse' ? filtered : []).forEach((it, i) => {
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

  const computeFiltered = (q: string): SuggestionItem[] => {
    if (!q) {
      // Show recent commands when no query
      showingRecent = recentCommands.length > 0;
      return showingRecent ? recentCommands : [];
    }

    showingRecent = false;
    const term = q.toLowerCase();

    // Combine command pool and element pool
    const allItems: SuggestionItem[] = [...commandPool(), ...buildElementPool()];

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
  const startInput = (cmd: CommandItem): void => {
    mode = 'awaiting';
    pending = cmd;
    $input.value = '';
    $input.placeholder = (cmd.path[cmd.path.length - 1] || '') + '…';
    $input.focus();
    root.classList.add('awaiting');
    filtered = []; sel = -1; render();
  };
  const quitInput = (): void => {
    mode = 'browse'; pending = null;
    root.classList.remove('awaiting');
    root.classList.remove('pending');
    $input.placeholder = '› Type a command…';
    reset();
  };

  const enterPending = (): void => {
    mode = 'pending';
    $input.value = '';
    root.classList.add('pending');
    root.classList.remove('awaiting');
  };

  /* ── run ── */
  function run(item: SuggestionItem | undefined): void {
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

  const reset = (): void => {
    $input.value = '';
    sel = -1;
    filtered = showingRecent ? recentCommands : [];
    root.classList.add('empty');
    render();
  };

  /* ── zoom helper ── */
  const zoomToElement = (ctrl: CanvasController, id: string): void => {
    const el = ctrl.findElementById(id); if (!el) return;
    const box = ctrl.canvas.getBoundingClientRect();
    const m = 60;
    const w = el.width * (el.scale || 1) + m;
    const h = el.height * (el.scale || 1) + m;
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
  
  $input.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    const q = target.value.trim();
    root.classList.toggle('empty', q === '');
    filtered = computeFiltered(q);
    sel = -1;
    render();
  });

  $input.addEventListener('blur', () => {
    root.classList.remove('focused');
  });

  $input.addEventListener('keydown', async (e: KeyboardEvent) => {
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
        await pending?.action?.(controller, val);
        quitInput();
        return;
      }

      if (sel >= 0) {
        run(filtered[sel]);
      }
      else if (val) {
        const selId = controller.selectedElementId;
        if (selId) {
          const el = controller.findElementById(selId);
          if (el) {
            editElementWithPrompt(val, el, controller).catch(console.error);
          }
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
  const globalKeydownHandler = (e: KeyboardEvent): void => {
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
  };

  window.addEventListener('keydown', globalKeydownHandler);

  // Initialize with recent commands if available
  filtered = recentCommands.length > 0 ? recentCommands : [];
  showingRecent = recentCommands.length > 0;
  render();

  // Install keyboard shortcuts
  installKeyboardShortcuts(controller);

  // Return cleanup function
  return () => {
    window.removeEventListener('keydown', globalKeydownHandler);
    root.remove();
  };
}
