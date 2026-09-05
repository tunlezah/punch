// storage.js — IndexedDB key/value store plus file access. Chrome/Edge use the
// File System Access API (a persisted FileSystemFileHandle); other browsers
// fall back to download/import. Nothing here ever talks to a network.

const DB_NAME = 'punch';
const STORE = 'kv';
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function run(mode, fn) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req ? req.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('transaction aborted'));
  }));
}

export const idb = {
  get: (key) => run('readonly', (s) => s.get(key)),
  set: (key, value) => run('readwrite', (s) => s.put(value, key)),
  del: (key) => run('readwrite', (s) => s.delete(key)),
  clear: () => run('readwrite', (s) => s.clear()),
};

export const KEYS = {
  state: 'state', // { state, savedAt }
  handle: 'fileHandle', // FileSystemFileHandle
  meta: 'meta', // { helpSeen, lastExportAt, lastFileWriteAt, fileLastModified, view }
};

export const hasFSA =
  typeof window !== 'undefined' &&
  typeof window.showSaveFilePicker === 'function' &&
  typeof window.showOpenFilePicker === 'function' &&
  window.isSecureContext;

const MD_TYPES = [{ description: 'Markdown timesheet', accept: { 'text/markdown': ['.md'] } }];

export function pickNewFile(suggestedName = 'timesheet.md') {
  return window.showSaveFilePicker({ suggestedName, types: MD_TYPES, id: 'punch-timesheet' });
}

export async function pickExistingFile() {
  const [handle] = await window.showOpenFilePicker({ types: MD_TYPES, multiple: false, id: 'punch-timesheet' });
  return handle;
}

export async function queryPermission(handle) {
  try { return await handle.queryPermission({ mode: 'readwrite' }); } catch { return 'granted'; }
}

export async function requestPermission(handle) {
  try { return await handle.requestPermission({ mode: 'readwrite' }); } catch { return 'denied'; }
}

export async function readHandle(handle) {
  const file = await handle.getFile();
  return { text: await file.text(), lastModified: file.lastModified, name: file.name, size: file.size };
}

export async function statHandle(handle) {
  const file = await handle.getFile();
  return { lastModified: file.lastModified, name: file.name, size: file.size };
}

/** Write the whole file; resolves with the file's new lastModified stamp. */
export async function writeHandle(handle, text) {
  const writable = await handle.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (e) {
    try { await writable.abort(); } catch { /* ignore */ }
    throw e;
  }
  const file = await handle.getFile();
  return file.lastModified;
}

export function downloadText(text, filename, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Open a file chooser (any browser); resolves with a File or null. */
export function pickImportFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.md,.markdown,.txt,text/markdown,text/plain';
    input.style.display = 'none';
    let settled = false;
    const done = (file) => { if (!settled) { settled = true; input.remove(); resolve(file || null); } };
    input.addEventListener('change', () => done(input.files && input.files[0]));
    input.addEventListener('cancel', () => done(null));
    window.addEventListener('focus', () => setTimeout(() => done(null), 800), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function clearBrowserData() {
  try { await idb.clear(); } catch { /* ignore */ }
  try { localStorage.clear(); } catch { /* ignore */ }
  if (typeof caches !== 'undefined') {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* ignore */ }
  }
  if (navigator.serviceWorker) {
    try { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* ignore */ }
  }
}
