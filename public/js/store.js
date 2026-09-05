// store.js — holds the current state, notifies listeners, memoises derived
// values and keeps a 30-second undo window for the last action.

import { normalizeState, emptyState } from './model.js';
import { derive } from './calc.js';

export const UNDO_WINDOW_MS = 30000;

export class Store {
  constructor(state) {
    this.state = normalizeState(state || emptyState());
    this.listeners = new Set();
    this.undoStack = [];
    this._derived = null;
    this._derivedKey = null;
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Derived figures for "now"; recomputed when the state or the minute changes. */
  get derived() {
    const key = Math.floor(Date.now() / 60000);
    if (!this._derived || this._derivedKey !== key) {
      this._derived = derive(this.state, new Date());
      this._derivedKey = key;
    }
    return this._derived;
  }

  invalidate() {
    this._derived = null;
  }

  /**
   * Apply a pure action (state → state). Returns true when the state changed.
   * `label` names the action for the undo toast.
   */
  apply(label, fn, { undoable = true, silent = false } = {}) {
    const prev = this.state;
    const next = fn(prev);
    if (!next || next === prev || JSON.stringify(next) === JSON.stringify(prev)) return false;
    this.state = next;
    this._derived = null;
    if (undoable) {
      this.undoStack.push({ label, prev, at: Date.now() });
      if (this.undoStack.length > 50) this.undoStack.shift();
    }
    this.emit({ type: 'change', label, undoable, silent });
    return true;
  }

  /** Replace the state wholesale (load from file / import). Clears undo. */
  replace(state, label = 'load') {
    this.state = normalizeState(state);
    this._derived = null;
    this.undoStack = [];
    this.emit({ type: 'load', label });
  }

  /** The undoable action if one is still inside the undo window. */
  canUndo() {
    const top = this.undoStack[this.undoStack.length - 1];
    if (!top) return null;
    return Date.now() - top.at <= UNDO_WINDOW_MS ? top : null;
  }

  undo() {
    const top = this.canUndo();
    if (!top) return null;
    this.undoStack.pop();
    this.state = top.prev;
    this._derived = null;
    this.emit({ type: 'undo', label: top.label });
    return top;
  }

  emit(evt) {
    for (const fn of this.listeners) {
      try { fn(this.state, evt); } catch (e) { console.error(e); }
    }
  }
}
