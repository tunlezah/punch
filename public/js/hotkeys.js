// hotkeys.js — single-key shortcuts that never fire while typing in a field,
// while a dialog is open, or when a modifier key is held (so browser
// shortcuts are untouched).

import { isEditableTarget } from './dom.js';

export const HOTKEYS = [
  ['I', 'In'],
  ['L', 'Out to lunch'],
  ['B', 'Back from lunch'],
  ['H', 'Home'],
  ['V', 'Start / end holiday'],
  ['T', 'TDY start / end'],
  ['S', 'Sick'],
  ['P', 'Public holiday'],
  ['Z', 'Undo last action'],
  ['E', 'Edit today’s times'],
  ['1 2 3 4', 'Today / Recent / History / Settings'],
  ['D', 'Cycle theme (dark → light → system)'],
  [',', 'Settings'],
  ['?', 'Help'],
  ['Esc', 'Close dialog / popup'],
];

/**
 * map: { key → handler(event) } where key is e.key for punctuation and the
 * upper-case letter for letters. Returns an uninstall function.
 */
export function installHotkeys(map, { enabled = () => true } = {}) {
  const onKey = (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Escape') {
      // Escape in a field hands focus back to the page so single-key shortcuts work again.
      if (isEditableTarget(e.target) && !document.querySelector('dialog[open]')) { e.target.blur(); return; }
      const fn = map.Escape;
      if (fn && fn(e) !== false) e.preventDefault();
      return;
    }
    if (isEditableTarget(e.target)) return;
    if (document.querySelector('dialog[open]')) return;
    if (!enabled()) return;
    const key = e.key.length === 1 ? (/[a-z]/i.test(e.key) ? e.key.toUpperCase() : e.key) : e.key;
    const fn = map[key];
    if (!fn) return;
    if (fn(e) !== false) e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
