// main.js — boots the app: storage → store → views, hotkeys, saving, reminders.

import { Store } from './store.js';
import { FileSync } from './sync.js';
import { h, clear, $, $$, toast, announce, icon, kbd } from './dom.js';
import { applyTheme, nextTheme, effectiveTheme, watchSystemTheme } from './theme.js';
import { installHotkeys } from './hotkeys.js';
import { todayISO, nowHHMM, fmtClock, fmtDuration, fmtDelta, fmtDateAU } from './time.js';
import { hasFSA, pickImportFile } from './storage.js';
import { periodFor } from './calc.js';
import { renderToday } from './ui/today.js';
import { renderRecent, fillPrintArea } from './ui/recent.js';
import { renderHistory } from './ui/history.js';
import { renderSettings } from './ui/settings.js';
import { openHelp } from './ui/help.js';
import { confirmDialog, choiceDialog } from './ui/dialogs.js';
import * as actions from './ui/actions.js';

const VIEWS = { today: renderToday, recent: renderRecent, history: renderHistory, settings: renderSettings };
const VIEW_TITLES = { today: 'Today', recent: 'Recent', history: 'History', settings: 'Settings' };

const store = new Store();
const files = new FileSync(store);

const app = {
  store,
  files,
  view: 'today',
  viewHandle: null,
  dismissedOpenDays: new Set(),
  dismissedBanners: new Set(),
  today: () => todayISO(),
  now: () => new Date(),
  fmt: (m) => fmtDuration(m, store.state.config.hoursDisplay),
  fmtDelta: (m) => fmtDelta(m, store.state.config.hoursDisplay),
  toast,
  announce,
  act(label, fn, opts = {}) {
    const changed = store.apply(label, fn, opts);
    if (changed && !opts.quiet) {
      const undoable = opts.undoable !== false;
      toast(label, {
        kind: 'success',
        duration: undoable ? 8000 : 3000,
        id: 'act',
        action: undoable ? { label: 'Undo', onClick: () => app.undo() } : null,
      });
      announce(label);
    }
    return changed;
  },
  undo() {
    const u = store.undo();
    if (u) {
      toast(`Undid: ${u.label}`, { id: 'act', duration: 3000 });
      announce(`Undid ${u.label}`);
    } else {
      toast('Nothing to undo — the undo window is 30 seconds', { id: 'act', duration: 2500 });
    }
  },
  go(view, { replace = false } = {}) {
    if (!VIEWS[view]) view = 'today';
    app.view = view;
    for (const t of $$('#tabs .tab')) {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    }
    const url = `#${view}`;
    if (location.hash !== url) {
      if (replace) history.replaceState(null, '', url);
      else history.pushState(null, '', url);
    }
    document.title = `${VIEW_TITLES[view]} · Punch`;
    app.render();
    announce(`${VIEW_TITLES[view]} view`);
  },
  render() {
    const root = $('#view');
    clear(root);
    app.viewHandle = VIEWS[app.view](root, app) || null;
  },
  openHelp() {
    openHelp(app);
  },
  cycleTheme() {
    const next = nextTheme(store.state.config.theme);
    store.apply('Theme', (s) => ({ ...s, config: { ...s.config, theme: next } }), { undoable: false, silent: true });
    toast(`Theme: ${next}${next === 'system' ? ` (${effectiveTheme('system')})` : ''}`, { id: 'theme', duration: 1500 });
  },
};

// ---------------------------------------------------------------------------
// Header: save indicator, theme + help buttons, tabs

function updateSaveIndicator() {
  const el = $('#save-indicator');
  clear(el);
  el.className = 'save-indicator';
  const f = files;
  if (f.mode === 'fsa') {
    if (f.status === 'nofile') {
      el.classList.add('busy');
      el.append(icon('cloudOff', 15), 'Browser only');
      el.title = 'No file connected — data is kept in this browser. Connect a file in Settings.';
    } else if (f.status === 'disconnected') {
      el.classList.add('warn');
      el.append(icon('link', 15), 'Connect file', h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => connectFile() }, 'Allow'));
      el.title = `Permission needed to read/write ${f.fileName}`;
    } else if (f.status === 'error') {
      el.classList.add('error');
      el.append(icon('warn', 15), 'Save failed', h('button', { class: 'btn btn-sm', type: 'button', onClick: () => f.save() }, 'Retry'));
      el.title = f.lastError ? String(f.lastError.message || f.lastError) : 'Could not write the file';
    } else if (f.saving) {
      el.classList.add('busy');
      el.append(icon('save', 15), 'Saving…');
    } else if (f.dirty) {
      el.classList.add('warn');
      el.append(icon('warn', 15), 'Unsaved', h('button', { class: 'btn btn-sm', type: 'button', onClick: () => f.save() }, 'Save now'));
    } else if (f.lastWriteAt) {
      el.classList.add('ok');
      el.append(icon('check', 15), `Saved ${fmtClock(f.lastWriteAt)}`);
      el.title = `${f.fileName} written at ${fmtClock(f.lastWriteAt)}`;
    } else {
      el.classList.add('ok');
      el.append(icon('file', 15), f.fileName);
      el.title = `Connected to ${f.fileName}`;
    }
  } else if (f.dirty) {
    el.classList.add('warn');
    el.append(icon('warn', 15), 'Unsaved changes to the file', h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => f.download() }, 'Download timesheet.md'));
    el.title = 'This browser cannot write files directly. Download the Markdown file to keep it up to date.';
  } else {
    el.classList.add('ok');
    el.append(icon('check', 15), 'Saved in browser');
    el.title = 'Up to date with the last downloaded copy';
  }
}

async function connectFile() {
  try {
    const ok = await files.connect();
    if (ok) toast(`Connected to ${files.fileName}`, { kind: 'success' });
    else toast('Permission was not granted', { kind: 'warn' });
  } catch (e) {
    toast(`Could not connect: ${e.message || e}`, { kind: 'error' });
  }
}

function renderBanners() {
  const root = $('#banners');
  clear(root);
  const f = files;
  const banner = (kind, iconName, title, text, ...buttons) => h('div', { class: `banner ${kind}` },
    icon(iconName, 20),
    h('div', { class: 'banner-text' }, h('strong', {}, title), text),
    h('div', { class: 'row' }, ...buttons),
  );
  if (f.mode === 'fsa' && f.status === 'disconnected') {
    root.append(banner('warn', 'link', `Connect to ${f.fileName}`,
      'The browser needs your permission (one click) to read and write the timesheet file. Until then you are working on the browser copy.',
      h('button', { class: 'btn btn-primary', type: 'button', onClick: connectFile }, 'Allow access'),
    ));
  }
  if (f.mode === 'fsa' && f.status === 'error') {
    root.append(banner('error', 'warn', 'The file could not be written',
      `${f.lastError ? (f.lastError.message || f.lastError) : 'Unknown error'}. Your changes are safe in the browser; retry, or connect a different file in Settings.`,
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => f.save() }, 'Retry'),
      h('button', { class: 'btn', type: 'button', onClick: () => app.go('settings') }, 'Settings'),
    ));
  }
  if (f.browserCopy) {
    root.append(banner('warn', 'refresh', 'The file on disk was older than the browser copy',
      'The file has been loaded (the file always wins). If the browser copy is the one you want, replace the file with it.',
      h('button', { class: 'btn btn-primary', type: 'button', onClick: async () => { await f.replaceFileWithBrowserCopy(); toast('File replaced with the browser copy', { kind: 'success' }); } }, 'Replace file with browser copy'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => f.dismissConflict() }, 'Keep the file'),
    ));
  }
  if (f.mode === 'fsa' && f.status === 'nofile' && !app.dismissedBanners.has('nofile') && Object.keys(store.state.days).length > 0) {
    root.append(banner('', 'cloudOff', 'Not saving to a file yet',
      'Your data lives in this browser only. Create or open timesheet.md to keep a human-readable copy on disk.',
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => doCreateFile() }, 'Create timesheet.md'),
      h('button', { class: 'btn', type: 'button', onClick: () => doOpenFile() }, 'Open existing'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => { app.dismissedBanners.add('nofile'); renderBanners(); } }, 'Later'),
    ));
  }
}

async function doCreateFile() {
  try {
    await files.createFile();
    toast(`Created ${files.fileName}`, { kind: 'success' });
    app.render();
  } catch (e) {
    if (e && e.name !== 'AbortError') toast(`Could not create the file: ${e.message || e}`, { kind: 'error' });
  }
}

async function doOpenFile() {
  try {
    const hadData = Object.keys(store.state.days).length > 0;
    if (hadData) {
      const ok = await confirmDialog({
        title: 'Open a different file?',
        message: 'The file you pick becomes the timesheet. Its contents replace the browser copy (the browser copy is not merged).',
        okLabel: 'Open file',
      });
      if (!ok) return;
    }
    const ok = await files.openFile();
    if (ok) toast(`Opened ${files.fileName}`, { kind: 'success' });
    app.render();
  } catch (e) {
    if (e && e.name !== 'AbortError') toast(`Could not open the file: ${e.message || e}`, { kind: 'error' });
  }
}

async function doImport() {
  const file = await pickImportFile();
  if (!file) return;
  const text = await file.text();
  const hasData = Object.keys(store.state.days).length > 0 || store.state.spans.length > 0;
  let mode = 'replace';
  if (hasData) {
    mode = await choiceDialog({
      title: `Import ${file.name}`,
      message: 'Replace everything with the imported file, or merge it into the current data? Merging keeps existing days and takes the imported version of any day that appears in both.',
      choices: [{ label: 'Merge by date', value: 'merge' }, { label: 'Replace all', value: 'replace', kind: 'danger' }],
    });
    if (!mode) return;
  }
  const incoming = files.applyImport(text, mode);
  toast(`Imported ${Object.keys(incoming.days).length} days, ${incoming.spans.length} leave/travel spans (${mode})`, { kind: 'success' });
  app.render();
}

app.doCreateFile = doCreateFile;
app.doOpenFile = doOpenFile;
app.doImport = doImport;
app.connectFile = connectFile;

function updateThemeButton() {
  const btn = $('#theme-btn');
  clear(btn);
  const t = store.state.config.theme;
  btn.append(icon(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'monitor', 18));
  btn.title = `Theme: ${t} (press D to cycle)`;
}

// ---------------------------------------------------------------------------
// First run

function renderFirstRun() {
  const root = $('#view');
  clear(root);
  const choice = (label, sub, iconName, onClick, primary) => h('button', { type: 'button', class: `big-btn choice${primary ? ' primary' : ''}`, onClick },
    h('div', { class: 'big-top' }, icon(iconName, 22)),
    h('div', {}, h('div', { class: 'big-label' }, label), h('div', { class: 'big-sub' }, sub)),
  );
  const finish = () => { app.render(); renderBanners(); updateSaveIndicator(); files.setMeta({ helpSeen: true }); openHelp(app); };
  const choices = [];
  if (hasFSA) {
    choices.push(choice('Create timesheet.md', 'Pick where to keep the file. Punch writes it after every change.', 'file', async () => { await doCreateFile(); if (files.handle) finish(); }, true));
    choices.push(choice('Open existing', 'Continue a timesheet.md you already have (hand-written ones are fine).', 'upload', async () => { await doOpenFile(); if (files.handle) finish(); }));
  } else {
    choices.push(choice('Import timesheet.md', 'Load a file you already have into this browser.', 'upload', async () => { await doImport(); finish(); }, true));
  }
  choices.push(choice(hasFSA ? 'Browser only for now' : 'Start fresh', hasFSA ? 'Keep data in this browser; connect a file later from Settings.' : 'Data is kept in this browser; download the Markdown file whenever you like.', 'clock', () => { files.setMeta({ started: true }); finish(); }));
  root.append(h('div', { class: 'card firstrun' },
    h('h2', {}, 'Welcome to Punch'),
    h('p', { class: 'muted' }, 'A timesheet that lives in one Markdown file on your machine. Nothing is sent anywhere.'),
    h('p', { class: 'muted' }, hasFSA
      ? 'This browser can read and write the file directly, so every change is saved to disk within a moment.'
      : 'This browser cannot write files directly (Firefox and Safari). Your data is kept in the browser and you download or import the Markdown file with a button.'),
    h('div', { class: 'choices' }, ...choices),
  ));
}

// ---------------------------------------------------------------------------
// Service worker

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:' || new URLSearchParams(location.search).has('nosw')) return;
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version of Punch is ready', { duration: 0, id: 'update', action: { label: 'Reload', onClick: () => location.reload() } });
        }
      });
    });
  }).catch((e) => console.warn('Service worker registration failed', e));
}

// ---------------------------------------------------------------------------
// Reminders (browser Notifications, local only)

let reminderFiredFor = '';
function checkReminder() {
  const cfg = store.state.config;
  if (!cfg.reminderTime) return;
  const today = app.today();
  if (reminderFiredFor === today) return;
  if (nowHHMM() !== cfg.reminderTime) return;
  const rec = store.state.days[today];
  if (!rec || !rec.in || rec.home) return;
  reminderFiredFor = today;
  const body = `Clocked in at ${rec.in} — don't forget to press Home.`;
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try { new Notification('Punch: time to clock out?', { body, icon: 'icons/icon-192.png', tag: 'punch-reminder' }); } catch { toast(body, { kind: 'warn', duration: 0 }); }
  } else {
    toast(body, { kind: 'warn', duration: 0 });
  }
}

// ---------------------------------------------------------------------------
// Boot

let lastTickDate = todayISO();
function tick() {
  const today = todayISO();
  if (today !== lastTickDate) {
    lastTickDate = today;
    store.invalidate();
    app.render();
  }
  if (app.view === 'today' && app.viewHandle && app.viewHandle.tick) app.viewHandle.tick();
  checkReminder();
}

async function boot() {
  applyTheme(store.state.config.theme, store.state.config.accent);
  updateThemeButton();
  $('#help-btn').append(icon('help', 18));
  $('#help-btn').addEventListener('click', () => app.openHelp());
  $('#theme-btn').addEventListener('click', () => app.cycleTheme());
  $('#tabs').addEventListener('click', (e) => {
    const t = e.target.closest('.tab');
    if (t) app.go(t.dataset.view);
  });

  const { firstRun } = await files.init();
  applyTheme(store.state.config.theme, store.state.config.accent);
  updateThemeButton();
  updateSaveIndicator();
  renderBanners();

  files.onChange((f, evt) => {
    updateSaveIndicator();
    renderBanners();
    if (evt.type === 'external') toast(`${f.fileName} changed on disk — reloaded`, { kind: 'info' });
    if (evt.type === 'loaded' && evt.conflict) announce('The file on disk was older than the browser copy; the file was loaded.');
  });

  store.subscribe((state, evt) => {
    applyTheme(state.config.theme, state.config.accent);
    updateThemeButton();
    if (evt.type === 'change' || evt.type === 'undo') files.scheduleSave();
    if (evt.type === 'load' && evt.label !== 'file') files.scheduleSave(50);
    if (evt.type === 'change' && evt.silent) {
      if (app.view === 'settings' && evt.label === 'Theme') app.render();
    } else {
      app.render();
    }
    renderBanners();
  });

  watchSystemTheme(() => applyTheme(store.state.config.theme, store.state.config.accent));

  const initial = location.hash.slice(1);
  app.view = VIEWS[initial] ? initial : 'today';
  for (const t of $$('#tabs .tab')) {
    if (t.dataset.view === app.view) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  document.title = `${VIEW_TITLES[app.view]} · Punch`;

  if (firstRun) renderFirstRun();
  else {
    app.render();
    if (!files.meta.helpSeen) { files.setMeta({ helpSeen: true }); openHelp(app); }
  }

  installHotkeys({
    I: () => actions.pressIn(app),
    L: () => actions.pressLunchOut(app),
    B: () => actions.pressLunchBack(app),
    H: () => actions.pressHome(app),
    V: () => actions.toggleHoliday(app),
    T: () => actions.toggleTdy(app),
    S: () => actions.pressSick(app),
    P: () => actions.pressPublicHoliday(app),
    Z: () => app.undo(),
    E: () => actions.editToday(app),
    1: () => app.go('today'),
    2: () => app.go('recent'),
    3: () => app.go('history'),
    4: () => app.go('settings'),
    D: () => app.cycleTheme(),
    ',': () => app.go('settings'),
    '?': () => app.openHelp(),
    Escape: () => false,
  });

  window.addEventListener('hashchange', () => {
    const v = location.hash.slice(1);
    if (VIEWS[v] && v !== app.view) app.go(v, { replace: true });
  });
  window.addEventListener('focus', () => files.checkExternalChange());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) files.checkExternalChange(); });
  window.addEventListener('beforeunload', () => { files.flush(); });
  window.addEventListener('beforeprint', () => {
    const area = $('#print-area');
    if (!area.childElementCount) fillPrintArea(app, periodFor(store.state.config, app.today()));
  });
  window.addEventListener('afterprint', () => clear($('#print-area')));

  setInterval(tick, 1000);
  registerServiceWorker();
}

boot().catch((e) => {
  console.error(e);
  const root = $('#view');
  clear(root);
  root.append(h('div', { class: 'card' }, h('h2', {}, 'Punch could not start'), h('pre', { class: 'raw' }, String(e && e.stack || e))));
});

export { app };
