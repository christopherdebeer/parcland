/* keyboard-shortcuts.ts - register global keyboard shortcuts */

import { buildRootItems } from './menu-items.ts';

interface MenuItem {
  shortcut?: string;
  action?: (controller: any, input?: any) => void | Promise<void> | any;
  children?: MenuItem[];
}

/**
 * Maps keyboard shortcuts to their corresponding actions
 * @param controller - The canvas controller
 * @returns A map of shortcut strings to action functions
 */
function buildShortcutMap(controller: any): Map<string, (controller: any, input?: any) => void | Promise<void> | any> {
  const shortcutMap = new Map<string, (controller: any, input?: any) => void | Promise<void> | any>();

  function walkItems(items: MenuItem[]): void {
    items.forEach((item: MenuItem) => {
      if (item.shortcut && item.action) {
        shortcutMap.set(item.shortcut, item.action);
      }
      
      if (item.children) {
        walkItems(item.children);
      }
    });
  }
  
  walkItems(buildRootItems(controller));
  return shortcutMap;
}

/**
 * Normalizes a keyboard event to a shortcut string
 * @param e - The keyboard event
 * @returns A normalized shortcut string
 */
function normalizeKeyboardEvent(e: KeyboardEvent): string {
  const modifiers = [];
  if (e.metaKey) modifiers.push('⌘');
  if (e.ctrlKey) modifiers.push('Ctrl');
  if (e.altKey) modifiers.push('⌥');
  if (e.shiftKey) modifiers.push('⇧');
  
  // Handle special keys
  let key = e.key;
  if (key === ' ') key = 'Space';
  if (key === 'ArrowUp') key = '↑';
  if (key === 'ArrowDown') key = '↓';
  if (key === 'ArrowLeft') key = '←';
  if (key === 'ArrowRight') key = '→';
  if (key === 'Escape') key = 'Esc';
  if (key === 'Delete') key = 'Del';
  if (key === 'Backspace') key = '⌫';
  
  // For single character keys, uppercase them
  if (key.length === 1) key = key.toUpperCase();
  
  return [...modifiers, key].join('');
}

/**
 * Installs keyboard shortcuts for the application
 * @param controller - The canvas controller
 */
export function installKeyboardShortcuts(controller: any): void {
  const shortcutMap = buildShortcutMap(controller);
  
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in input fields
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      return;
    }
    
    const shortcut = normalizeKeyboardEvent(e);
    const action = shortcutMap.get(shortcut);
    
    if (action) {
      e.preventDefault();
      action(controller);
    }
  });
  
  // Log available shortcuts for debugging
  console.log('Registered keyboard shortcuts:', [...shortcutMap.keys()]);
}
