// sync.js — keeps the Markdown file, IndexedDB and the in-memory store in step.
// Chrome/Edge: a persisted FileSystemFileHandle is written (debounced) on every
// change. Other browsers: IndexedDB is the working copy and the user downloads
// / imports the file explicitly.

import {
  idb, KEYS, hasFSA, pickNewFile, pickExistingFile, queryPermission, requestPermission,
  readHandle, statHandle, writeHandle, downloadText,
} from './storage.js';
import { render, parse, DEFAULT_FILE_NAME } from './markdown.js';
import { isoTimestamp, parseTimestamp } from './time.js';
import { mergeStates } from './model.js';

export class FileSync {
  constructor(store) {
    this.store = store;
    this.mode = hasFSA ? 'fsa' : 'download';
    this.handle = null;
    this.fileName = DEFAULT_FILE_NAME;
    // nofile | disconnected | connected | error (fsa) — browser (download mode)
    this.status = this.mode === 'fsa' ? 'nofile' : 'browser';
    this.dirty = false;
    this.saving = false;
    this.lastWriteAt = null;
    this.lastError = null;
    this.fileLastModified = 0;
    this.meta = {};
    this.browserCopy = null; // kept when the file won a load-time conflict
    this.listeners = new Set();
    this._timer = null;
    this._pending = false;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(evt = {}) {
    for (const fn of this.listeners) {
      try { fn(this, evt); } catch (e) { console.error(e); }
    }
  }

  async init() {
    let saved = null;
    let handle = null;
    let meta = null;
    try {
      [saved, handle, meta] = await Promise.all([idb.get(KEYS.state), idb.get(KEYS.handle), idb.get(KEYS.meta)]);
    } catch (e) {
      console.warn('IndexedDB unavailable', e);
    }
    this.meta = meta || {};
    const hasBrowserCopy = Boolean(saved && saved.state);
    if (hasBrowserCopy) this.store.replace(saved.state, 'browser');
    if (this.mode === 'fsa' && handle) {
      this.handle = handle;
      this.fileName = handle.name || DEFAULT_FILE_NAME;
      const perm = await queryPermission(handle);
      if (perm === 'granted') await this.loadFromFile({ initial: true });
      else this.status = 'disconnected';
    } else if (this.mode === 'download') {
      this.status = 'browser';
      this.dirty = Boolean(this.meta.dirty);
    }
    this.emit({ type: 'init' });
    return { firstRun: !hasBrowserCopy && !handle };
  }

  async setMeta(patch) {
    this.meta = { ...this.meta, ...patch };
    try { await idb.set(KEYS.meta, this.meta); } catch { /* ignore */ }
  }

  /** Ask for read/write permission on the stored handle (needs a user gesture). */
  async connect() {
    if (!this.handle) return false;
    const perm = await requestPermission(this.handle);
    if (perm !== 'granted') {
      this.status = 'disconnected';
      this.emit({ type: 'status' });
      return false;
    }
    const ok = await this.loadFromFile({ initial: true });
    if (ok && this.dirty) await this.save();
    return ok;
  }

  /**
   * Read the file and hydrate the store. On the initial load the file wins if
   * it differs from the browser copy; a newer browser copy is kept aside so the
   * user can explicitly "Replace file with browser copy".
   */
  async loadFromFile({ initial = false, force = false } = {}) {
    if (!this.handle) return false;
    try {
      const { text, lastModified, name } = await readHandle(this.handle);
      this.fileName = name || this.fileName;
      this.fileLastModified = lastModified;
      if (!text.trim()) {
        // A brand-new empty file: keep what we have and write it out.
        this.status = 'connected';
        this.lastError = null;
        this.dirty = true;
        this.emit({ type: 'loaded', conflict: false, empty: true });
        this.scheduleSave(50);
        return true;
      }
      const fileState = parse(text);
      const local = this.store.state;
      const same = JSON.stringify(fileState) === JSON.stringify(local);
      let conflict = false;
      if (initial && !force && !same) {
        const localStamp = parseTimestamp(local.config.lastSaved);
        const fileStamp = parseTimestamp(fileState.config.lastSaved);
        if (Number.isFinite(localStamp) && (!Number.isFinite(fileStamp) || localStamp > fileStamp)) {
          this.browserCopy = local;
          conflict = true;
        }
      }
      if (!same) this.store.replace(fileState, 'file');
      try { await idb.set(KEYS.state, { state: fileState, savedAt: Date.now() }); } catch { /* ignore */ }
      this.status = 'connected';
      this.dirty = false;
      this.lastError = null;
      this.emit({ type: 'loaded', conflict });
      return true;
    } catch (e) {
      this.lastError = e;
      this.status = e && e.name === 'NotAllowedError' ? 'disconnected' : 'error';
      this.emit({ type: 'status' });
      return false;
    }
  }

  scheduleSave(delay = 500) {
    this._pending = true;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.save(), delay);
  }

  async flush() {
    if (this._pending) {
      clearTimeout(this._timer);
      await this.save();
    }
  }

  /** Persist to IndexedDB always, and to the file when connected. */
  async save() {
    this._pending = false;
    clearTimeout(this._timer);
    const store = this.store;
    const stamp = isoTimestamp(new Date());
    store.state = { ...store.state, config: { ...store.state.config, lastSaved: stamp } };
    store.invalidate();
    const state = store.state;
    const text = render(state);
    try { await idb.set(KEYS.state, { state, savedAt: Date.now() }); } catch (e) { console.warn('IndexedDB save failed', e); }
    if (this.mode === 'fsa') {
      if (this.handle && this.status !== 'disconnected' && this.status !== 'nofile') {
        this.saving = true;
        this.emit({ type: 'saving' });
        try {
          this.fileLastModified = await writeHandle(this.handle, text);
          this.lastWriteAt = new Date();
          this.dirty = false;
          this.status = 'connected';
          this.lastError = null;
        } catch (e) {
          this.dirty = true;
          this.lastError = e;
          this.status = e && e.name === 'NotAllowedError' ? 'disconnected' : 'error';
        } finally {
          this.saving = false;
        }
      } else {
        this.dirty = Boolean(this.handle);
      }
    } else {
      this.dirty = true;
      await this.setMeta({ dirty: true });
    }
    this.emit({ type: 'saved' });
  }

  /** Create a new file with the current state (user gesture). */
  async createFile() {
    const handle = await pickNewFile(this.fileName || DEFAULT_FILE_NAME);
    this.handle = handle;
    this.fileName = handle.name || DEFAULT_FILE_NAME;
    this.browserCopy = null;
    try { await idb.set(KEYS.handle, handle); } catch { /* ignore */ }
    this.status = 'connected';
    await this.save();
    this.emit({ type: 'status' });
    return true;
  }

  /** Open an existing file; its contents replace the browser copy (user gesture). */
  async openFile() {
    const handle = await pickExistingFile();
    this.handle = handle;
    this.fileName = handle.name || DEFAULT_FILE_NAME;
    this.browserCopy = null;
    try { await idb.set(KEYS.handle, handle); } catch { /* ignore */ }
    const ok = await this.loadFromFile({ force: true });
    this.emit({ type: 'status' });
    return ok;
  }

  async reload() {
    if (!this.handle) return false;
    return this.loadFromFile({ force: true });
  }

  /** Called on focus: pick up hand edits made to the file while the app was in the background. */
  async checkExternalChange() {
    if (this.mode !== 'fsa' || !this.handle || this.status !== 'connected' || this._pending || this.saving) return false;
    try {
      const st = await statHandle(this.handle);
      if (st.lastModified > this.fileLastModified + 1500) {
        const ok = await this.loadFromFile({ force: true });
        if (ok) this.emit({ type: 'external' });
        return ok;
      }
    } catch { /* permission may have lapsed; the next save reports it */ }
    return false;
  }

  download() {
    const text = render(this.store.state);
    downloadText(text, this.fileName || DEFAULT_FILE_NAME);
    if (this.mode === 'download') {
      this.dirty = false;
      this.setMeta({ dirty: false, lastExportAt: Date.now() });
    }
    this.emit({ type: 'status' });
  }

  /** Apply imported text: 'replace' the browser copy or 'merge' by date. Returns the parsed state. */
  applyImport(text, mode = 'replace') {
    const incoming = parse(text);
    if (mode === 'merge') this.store.replace(mergeStates(this.store.state, incoming), 'import');
    else this.store.replace(incoming, 'import');
    this.scheduleSave(50);
    return incoming;
  }

  async replaceFileWithBrowserCopy() {
    if (!this.browserCopy) return false;
    this.store.replace(this.browserCopy, 'browser');
    this.browserCopy = null;
    await this.save();
    return true;
  }

  dismissConflict() {
    this.browserCopy = null;
    this.emit({ type: 'status' });
  }

  async forgetFile() {
    try { await idb.del(KEYS.handle); } catch { /* ignore */ }
    this.handle = null;
    this.status = 'nofile';
    this.emit({ type: 'status' });
  }
}
