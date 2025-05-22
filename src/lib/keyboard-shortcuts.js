/* keyboard-shortcuts.js - register global keyboard shortcuts */

import { buildRootItems } from './menu-items.js';

/**
 * Maps keyboard shortcuts to their corresponding actions
 * @param {Object} controller - The canvas controller
 * @returns {Map} A map of shortcut strings to action functions
 */
function buildShortcutMap(controller) {
  const shortcutMap = new Map();
  
  function walkItems(items) {
    items.forEach(item => {
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
 * @param {KeyboardEvent} e - The keyboard event
 * @returns {string} A normalized shortcut string
 */
function normalizeKeyboardEvent(e) {
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
 * @param {Object} controller - The canvas controller
 */
export function installKeyboardShortcuts(controller) {
  const shortcutMap = buildShortcutMap(controller);
  
  window.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts when typing in input fields
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
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