// settings.js — every configurable value, the file connection and the danger zone.

import { h, clear, icon, toast, append, timeInput } from '../dom.js';
import { DAY_NAMES, DAY_NAMES_LONG, fmtDateAU, dayName, parseDuration, fmtDuration, fmtDelta, normHHMM, isISODate, fmtClock } from '../time.js';
import { ACCENTS, THEMES, ROUNDING_OPTIONS, periodFor, weeklyStandardMinutes, firstDataDate } from '../calc.js';
import { REGIONS, regionHolidays } from '../holidays.js';
import * as model from '../model.js';
import { hasFSA, clearBrowserData } from '../storage.js';
import { confirmDialog } from './dialogs.js';
import * as actions from './actions.js';

const SWATCH = { teal: '#14b8a6', blue: '#3b82f6', violet: '#8b5cf6', amber: '#f59e0b', rose: '#f43f5e', green: '#22c55e' };
const au = (iso) => fmtDateAU(iso, { weekday: false });

function setting(label, help, ...controls) {
  return h('div', { class: 'setting' },
    h('div', { class: 'setting-text' }, h('div', { class: 'setting-label' }, label), h('div', { class: 'setting-help' }, help)),
    h('div', { class: 'setting-control' }, ...controls));
}

export function renderSettings(root, app) {
  const { store, files } = app;
  const state = store.state;
  const cfg = state.config;
  const d = store.derived;
  const set = (patch, label = 'Settings saved') => app.act(label, (s) => model.updateConfig(s, patch), { undoable: false, quiet: true, silent: true });

  // ---- hours -----------------------------------------------------------------
  const perDay = h('input', { type: 'text', class: 'short', value: fmtDuration(cfg.standardMinutesPerDay), 'aria-label': 'Standard hours per day', inputmode: 'text' });
  const perWeek = h('input', { type: 'text', class: 'short', value: fmtDuration(weeklyStandardMinutes(cfg)), 'aria-label': 'Standard hours per week' });
  const dayCount = () => store.state.config.workDays.length;
  const refreshHours = () => {
    const c = store.state.config;
    perDay.value = fmtDuration(c.standardMinutesPerDay);
    perWeek.value = fmtDuration(weeklyStandardMinutes(c));
  };
  perDay.addEventListener('change', () => {
    const m = parseDuration(perDay.value);
    if (m === null || m < 0 || m > 1440) { toast('Enter hours as h:mm or decimal (e.g. 7:36 or 7.6)', { kind: 'warn' }); refreshHours(); return; }
    set({ standardMinutesPerDay: m }, `Standard day ${fmtDuration(m)}`);
    refreshHours();
  });
  perWeek.addEventListener('change', () => {
    const m = parseDuration(perWeek.value);
    if (m === null || m < 0) { toast('Enter hours as h:mm or decimal (e.g. 38 or 38:00)', { kind: 'warn' }); refreshHours(); return; }
    set({ standardMinutesPerDay: Math.round(m / dayCount()) }, `Standard week ${fmtDuration(m)}`);
    refreshHours();
  });
  const dayPicker = h('div', { class: 'daypicker', role: 'group', 'aria-label': 'Working days' }, DAY_NAMES.map((n, i) => {
    const cb = h('input', { type: 'checkbox', checked: cfg.workDays.includes(n), 'aria-label': DAY_NAMES_LONG[i] });
    cb.addEventListener('change', () => {
      const days = DAY_NAMES.filter((x, j) => dayPicker.querySelectorAll('input')[j].checked);
      if (!days.length) { cb.checked = true; toast('Keep at least one working day', { kind: 'warn' }); return; }
      set({ workDays: days }, `Working days: ${days.join(' ')}`);
      refreshHours();
    });
    return h('label', {}, cb, h('span', {}, n));
  }));

  // ---- pay period ------------------------------------------------------------
  const anchor = h('input', { type: 'date', value: cfg.payPeriodAnchor, 'aria-label': 'Pay period anchor date' });
  const length = h('input', { type: 'number', min: 1, max: 366, value: cfg.payPeriodDays, 'aria-label': 'Pay period length in days' });
  const periodPreview = h('div', { class: 'setting-help hint-live' });
  const refreshPeriod = () => {
    const c = store.state.config;
    const p = periodFor(c, app.today());
    periodPreview.textContent = `Anchor ${fmtDateAU(c.payPeriodAnchor)} · current period ${fmtDateAU(p.start)} → ${fmtDateAU(p.end)}`;
  };
  anchor.addEventListener('change', () => { if (isISODate(anchor.value)) { set({ payPeriodAnchor: anchor.value }, 'Pay period anchor'); refreshPeriod(); } });
  length.addEventListener('change', () => { set({ payPeriodDays: Number(length.value) }, 'Pay period length'); length.value = store.state.config.payPeriodDays; refreshPeriod(); });
  refreshPeriod();

  // ---- lunch, rounding, display ------------------------------------------------
  const lunch = h('input', { type: 'number', min: 0, max: 600, value: cfg.defaultLunchMinutes, 'aria-label': 'Default lunch in minutes' });
  lunch.addEventListener('change', () => { set({ defaultLunchMinutes: Number(lunch.value) }, 'Default lunch'); lunch.value = store.state.config.defaultLunchMinutes; });
  const rounding = h('select', { 'aria-label': 'Time rounding' }, ROUNDING_OPTIONS.map((r) => h('option', { value: r, selected: r === cfg.roundingMinutes }, r === 0 ? 'Off' : `${r} minutes`)));
  rounding.addEventListener('change', () => set({ roundingMinutes: Number(rounding.value) }, 'Rounding'));
  const seg = (options, value, onPick, label) => h('div', { class: 'segmented', role: 'group', 'aria-label': label }, options.map(([v, text, ic]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(v === value), onClick: () => { onPick(v); for (const x of b.parentElement.children) x.setAttribute('aria-pressed', String(x === b)); } }, ic ? icon(ic, 15) : null, text);
    return b;
  }));
  const hoursDisplay = seg([['hmm', 'h:mm'], ['decimal', 'Decimal']], cfg.hoursDisplay, (v) => set({ hoursDisplay: v }, 'Hours display'), 'Hours display');
  const weeks = h('input', { type: 'number', min: 1, max: 52, value: cfg.recentWeeks, 'aria-label': 'Recent view weeks' });
  weeks.addEventListener('change', () => { set({ recentWeeks: Number(weeks.value) }, 'Recent weeks'); weeks.value = store.state.config.recentWeeks; });

  // ---- theme -----------------------------------------------------------------
  const theme = seg([['dark', 'Dark', 'moon'], ['light', 'Light', 'sun'], ['system', 'System', 'monitor']], cfg.theme, (v) => set({ theme: v }, 'Theme'), 'Theme');
  const swatches = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Accent colour' }, ACCENTS.map((a) => {
    const b = h('button', { type: 'button', class: 'swatch', style: { background: SWATCH[a] }, 'aria-label': a, title: a, 'aria-pressed': String(a === cfg.accent) });
    b.addEventListener('click', () => { set({ accent: a }, `Accent: ${a}`); for (const x of swatches.children) x.setAttribute('aria-pressed', String(x === b)); });
    return b;
  }));

  // ---- TOIL ------------------------------------------------------------------
  const balanceStart = h('input', { type: 'date', value: cfg.balanceStart, 'aria-label': 'Balance start date' });
  const balanceHint = h('div', { class: 'setting-help' });
  const refreshBalance = () => {
    const c = store.state.config;
    balanceHint.textContent = c.balanceStart ? `Counting from ${fmtDateAU(c.balanceStart)}` : `Blank = first record (${firstDataDate(store.state) ? fmtDateAU(firstDataDate(store.state)) : 'none yet'})`;
  };
  balanceStart.addEventListener('change', () => { set({ balanceStart: isISODate(balanceStart.value) ? balanceStart.value : '' }, 'Balance start'); refreshBalance(); });
  refreshBalance();
  const adjRows = state.adjustments.map((a, i) => ({ a, i })).sort((x, y) => (x.a.date < y.a.date ? 1 : -1));
  const adjTable = adjRows.length ? h('div', { class: 'table-wrap', style: { marginTop: '10px' } }, h('table', { class: 'grid readonly-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'num' }, 'Adjustment'), h('th', {}, 'Reason'), h('th', { 'aria-label': 'Actions' }))),
    h('tbody', {}, adjRows.map(({ a, i }) => h('tr', {},
      h('td', {}, fmtDateAU(a.date)), h('td', { class: `num ${a.minutes > 0 ? 'pos' : a.minutes < 0 ? 'neg' : ''}` }, app.fmtDelta(a.minutes)), h('td', { class: 'notes' }, a.reason),
      h('td', {}, h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Delete adjustment', onClick: () => app.act(`Deleted adjustment ${fmtDelta(a.minutes)}`, (s) => model.deleteAdjustment(s, i)) }, icon('trash', 16)))))))) : h('p', { class: 'hint', style: { marginTop: '8px' } }, 'No adjustments yet.');

  // ---- public holidays ---------------------------------------------------------
  const region = h('select', { 'aria-label': 'Jurisdiction' }, REGIONS.map((r) => h('option', { value: r.code, selected: r.code === cfg.holidayRegion }, r.name)));
  const loadFor = (code) => {
    if (code === 'none') return;
    const list = regionHolidays(code);
    const before = store.state.holidays.length;
    app.act(`Added ${code} public holidays`, (s) => model.loadHolidays(s, list), { quiet: true });
    const added = store.state.holidays.length - before;
    toast(added ? `Added ${added} public holiday${added === 1 ? '' : 's'} for ${code}${list.length - added ? ` (${list.length - added} already listed)` : ''}` : `All ${list.length} ${code} dates are already listed`, { kind: 'success' });
    if (!added) app.render();
  };
  region.addEventListener('change', () => { set({ holidayRegion: region.value }, 'Public holiday region'); loadFor(region.value); });
  const loadBtn = h('button', { type: 'button', class: 'btn btn-sm', disabled: cfg.holidayRegion === 'none', onClick: () => loadFor(store.state.config.holidayRegion) }, icon('download', 16), 'Add listed dates');
  const hols = state.holidays.map((hd, i) => ({ hd, i }));
  const newDate = h('input', { type: 'date', 'aria-label': 'New public holiday date' });
  const newName = h('input', { type: 'text', placeholder: 'Name, e.g. Show Day', 'aria-label': 'New public holiday name', maxlength: 100 });
  const addHoliday = () => {
    if (!isISODate(newDate.value)) { toast('Pick a date for the public holiday', { kind: 'warn' }); newDate.focus(); return; }
    app.act(`Added public holiday ${fmtDateAU(newDate.value, { weekday: false })}`, (s) => model.addHoliday(s, { date: newDate.value, name: newName.value }));
  };
  newName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addHoliday(); } });
  let lastYear = '';
  const holidayRows = [];
  for (const { hd, i } of hols) {
    const year = hd.date.slice(0, 4);
    if (year !== lastYear) {
      holidayRows.push(h('tr', { class: 'period-marker' }, h('td', { colspan: 4 }, h('div', { class: 'period-rule' }, year))));
      lastYear = year;
    }
    const dateIn = h('input', { type: 'date', value: hd.date, 'aria-label': `Date of ${hd.name}` });
    dateIn.addEventListener('change', () => {
      if (!isISODate(dateIn.value)) { dateIn.value = hd.date; return; }
      app.act(`Moved ${hd.name} to ${fmtDateAU(dateIn.value, { weekday: false })}`, (s) => model.updateHoliday(s, i, { date: dateIn.value }));
    });
    const nameIn = h('input', { type: 'text', value: hd.name, 'aria-label': `Name of public holiday on ${fmtDateAU(hd.date)}`, maxlength: 100 });
    nameIn.addEventListener('change', () => app.act(`Renamed public holiday ${fmtDateAU(hd.date, { weekday: false })}`, (s) => model.updateHoliday(s, i, { name: nameIn.value })));
    const overridden = Boolean(state.days[hd.date]);
    holidayRows.push(h('tr', { class: hd.date < app.today() ? 'row-past' : '' },
      h('td', {}, dateIn),
      h('td', { class: 'muted' }, dayName(hd.date), overridden ? h('span', { class: 'badge', style: { marginLeft: '6px' }, title: 'This day has its own record, which takes precedence' }, 'has record') : null),
      h('td', { class: 'notes' }, nameIn),
      h('td', {}, h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': `Remove ${hd.name}`, onClick: () => app.act(`Removed public holiday ${hd.name}`, (s) => model.deleteHoliday(s, i)) }, icon('trash', 16)))));
  }
  const holidayTable = h('div', { class: 'table-wrap', style: { marginTop: '10px' } }, h('table', { class: 'grid' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Day'), h('th', {}, 'Name'), h('th', { 'aria-label': 'Actions' }))),
    h('tbody', {}, holidayRows,
      h('tr', {}, h('td', {}, newDate), h('td', {}), h('td', { class: 'notes' }, newName), h('td', {}, h('button', { type: 'button', class: 'btn btn-sm btn-soft', onClick: addHoliday }, icon('plus', 16), 'Add'))))));
  const clearHolBtn = h('button', { type: 'button', class: 'btn btn-sm btn-ghost', disabled: !state.holidays.length, onClick: async () => {
    if (await confirmDialog({ title: 'Remove all public holidays?', message: `${state.holidays.length} listed dates will be removed from the file. Days that already have their own record are not affected.`, okLabel: 'Remove all', danger: true })) {
      app.act('Removed all public holidays', (s) => model.clearHolidays(s));
    }
  } }, 'Remove all');

  // ---- reminder --------------------------------------------------------------
  const reminder = timeInput({ value: cfg.reminderTime, 'aria-label': 'Clock-out reminder time (24-hour HH:MM)' }, (v) => {
    if (v === null) { toast('Enter a time as HH:MM (24-hour)', { kind: 'warn' }); return; }
    set({ reminderTime: v }, 'Reminder');
  });
  const notifStatus = h('span', { class: 'hint' });
  const notifBtn = h('button', { type: 'button', class: 'btn btn-sm' }, 'Enable notifications');
  const refreshNotif = () => {
    if (typeof Notification === 'undefined') { notifStatus.textContent = 'Notifications are not available in this browser; a toast is shown instead.'; notifBtn.hidden = true; return; }
    notifStatus.textContent = Notification.permission === 'granted' ? 'Notifications enabled' : Notification.permission === 'denied' ? 'Notifications blocked in the browser; a toast is shown instead' : 'Notifications not yet allowed';
    notifBtn.hidden = Notification.permission === 'granted';
  };
  notifBtn.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch { /* ignore */ } refreshNotif(); });
  refreshNotif();

  // ---- file ------------------------------------------------------------------
  const f = files;
  const fileStatus = h('div', { class: 'file-status' });
  const statusText = {
    nofile: 'No file connected — data is kept in this browser only.',
    disconnected: 'Permission needed to read and write the file.',
    connected: 'Connected — the file is rewritten after every change.',
    error: `Last write failed${f.lastError ? ': ' + (f.lastError.message || f.lastError) : ''}.`,
    browser: 'This browser cannot write files directly. Data is kept in the browser; download the file to keep it up to date.',
  };
  append(fileStatus, [
    h('div', { class: 'name' }, icon('file', 16), f.mode === 'fsa' && f.handle ? f.fileName : (f.mode === 'fsa' ? 'No file' : f.fileName)),
    h('div', { class: 'hint' }, statusText[f.status] || ''),
    f.lastWriteAt ? h('div', { class: 'hint' }, `Last written ${fmtClock(f.lastWriteAt)}`) : null,
    cfg.lastSaved ? h('div', { class: 'hint' }, `last_saved in file: ${cfg.lastSaved}`) : null,
    f.mode === 'fsa' ? h('div', { class: 'hint' }, 'Browsers only expose the file name, not its folder. The location is the one you chose in the file picker.') : null,
  ]);
  const fileButtons = h('div', { class: 'row', style: { marginTop: '10px' } });
  if (f.mode === 'fsa') {
    if (f.status === 'disconnected') fileButtons.append(h('button', { type: 'button', class: 'btn btn-primary', onClick: () => app.connectFile() }, icon('link', 16), 'Allow access'));
    append(fileButtons, [
      h('button', { type: 'button', class: 'btn', onClick: () => app.doOpenFile() }, icon('upload', 16), f.handle ? 'Change file' : 'Open existing'),
      h('button', { type: 'button', class: 'btn', onClick: () => app.doCreateFile() }, icon('plus', 16), f.handle ? 'Create new file' : 'Create timesheet.md'),
      f.handle ? h('button', { type: 'button', class: 'btn', onClick: async () => { const ok = await f.reload(); toast(ok ? 'Reloaded from file' : 'Could not read the file', { kind: ok ? 'success' : 'error' }); app.render(); } }, icon('refresh', 16), 'Reload from file') : null,
    ]);
  }
  append(fileButtons, [
    h('button', { type: 'button', class: f.mode === 'download' && f.dirty ? 'btn btn-primary' : 'btn', onClick: () => f.download() }, icon('download', 16), f.mode === 'download' ? 'Download timesheet.md' : 'Download copy'),
    h('button', { type: 'button', class: 'btn', onClick: () => app.doImport() }, icon('upload', 16), 'Import timesheet.md'),
  ]);

  // ---- danger zone ---------------------------------------------------------------
  const clearBtn = h('button', { type: 'button', class: 'btn btn-danger', onClick: async () => {
    const ok = await confirmDialog({
      title: 'Clear browser cache?',
      message: hasFSA
        ? 'Removes the browser copy, the remembered file handle and the offline cache. The timesheet file on disk is not touched — you can open it again afterwards.'
        : 'Removes the browser copy and the offline cache. Download timesheet.md first if you have unsaved changes; the download itself is never touched.',
      okLabel: 'Clear and reload', danger: true,
    });
    if (!ok) return;
    await clearBrowserData();
    location.replace(location.pathname);
  } }, icon('trash', 16), 'Clear browser cache');

  const build = document.querySelector('meta[name="build"]');

  root.append(
    h('div', { class: 'settings-grid' },
      h('section', { class: 'card', 'aria-labelledby': 's-hours' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-hours' }, icon('clock', 16), 'Hours')),
        setting('Standard day', 'Enter either figure; the other is derived (week ÷ working days).', h('label', { class: 'row' }, 'per day', perDay), h('label', { class: 'row' }, 'per week', perWeek)),
        setting('Working days', 'Standard hours apply on these days. Other days have no standard and no leave credit.', dayPicker),
        setting('Default lunch', 'Minutes deducted when a day has In and Home but no lunch pair. 0 to disable.', lunch, h('span', { class: 'hint' }, 'min')),
        setting('Rounding', 'Rounds each clock time to the nearest step for display and totals. Stored times are never rounded.', rounding),
      ),
      h('section', { class: 'card', 'aria-labelledby': 's-period' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-period' }, icon('calendar', 16), 'Pay period')),
        setting('Anchor date', 'Any day a period starts on. Periods repeat every N days before and after it.', anchor),
        setting('Length', 'Days per pay period (14 = fortnight).', length, h('span', { class: 'hint' }, 'days')),
        h('div', { class: 'setting' }, periodPreview),
        setting('Recent view', 'How many weeks the Recent view shows.', weeks, h('span', { class: 'hint' }, 'weeks')),
        setting('Hours display', 'h:mm (7:36) or decimal hours (7.60). The file always uses h:mm.', hoursDisplay),
      ),
      h('section', { class: 'card', 'aria-labelledby': 's-toil' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-toil' }, 'TOIL balance'), h('span', { class: `sub ${d.balance > 0 ? 'pos' : d.balance < 0 ? 'neg' : ''}` }, `now ${app.fmtDelta(d.balance)}`)),
        setting('Balance start', 'The running balance counts Δ from this date.', balanceStart, h('button', { type: 'button', class: 'btn btn-sm btn-ghost', onClick: () => { balanceStart.value = ''; set({ balanceStart: '' }, 'Balance start'); refreshBalance(); } }, 'Clear')),
        h('div', { class: 'setting' }, balanceHint),
        setting('Adjustments', 'Fix the balance or bring in an opening figure. TDY over/under hours enter TOIL only through an accepted adjustment.', h('button', { type: 'button', class: 'btn btn-sm', onClick: () => actions.adjustToil(app) }, icon('edit', 16), 'Adjust balance')),
        adjTable,
      ),
      h('section', { class: 'card', 'aria-labelledby': 's-look' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-look' }, 'Appearance')),
        setting('Theme', 'System follows the operating system and switches live. Press D to cycle.', theme),
        setting('Accent', 'Used for primary buttons, highlights and links. Every accent meets WCAG AA in both themes.', swatches),
      ),
      h('section', { class: 'card', 'aria-labelledby': 's-ph', style: { gridColumn: '1 / -1' } },
        h('div', { class: 'card-head' }, h('h3', { id: 's-ph' }, icon('flag', 16), 'Public holidays'), h('span', { class: 'sub' }, `${state.holidays.length} listed`)),
        setting('Jurisdiction', 'Choosing a state or territory adds its 2026–2027 public holidays (national days included) to the list below. Press “Add listed dates” again after an update to pick up new dates; entries you have moved, renamed or removed are left alone.', region, loadBtn),
        setting('How the list is used', 'A date in this list is treated as a public holiday — credited a standard day on working days — unless that day has its own record. Change a date to move a holiday, rename it, remove one you do not observe, or add a local one. The list is saved in the file under “Public holidays”.', clearHolBtn),
        holidayTable,
      ),
      h('section', { class: 'card', 'aria-labelledby': 's-rem' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-rem' }, 'Clock-out reminder')),
        setting('Reminder time', 'Reminds you to press Home if the day is still open at this time (only while Punch is open). Blank = off.', reminder),
        h('div', { class: 'setting' }, notifStatus, h('div', { class: 'setting-control' }, notifBtn)),
      ),
      h('section', { class: 'card', 'aria-labelledby': 's-file' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-file' }, icon('file', 16), 'File'), h('span', { class: 'sub' }, f.mode === 'fsa' ? 'File System Access API' : 'download / import mode')),
        fileStatus, fileButtons,
      ),
      h('section', { class: 'card danger-zone', 'aria-labelledby': 's-danger' },
        h('div', { class: 'card-head' }, h('h3', { id: 's-danger' }, icon('warn', 16), 'Danger zone')),
        setting('Clear browser cache', 'Forgets the browser copy, the file handle and the offline cache. Does not touch the file.', clearBtn),
        h('p', { class: 'hint', style: { marginTop: '12px' } }, `Punch v1${build && build.content && build.content !== '__BUILD__' ? ` · build ${build.content}` : ''} · runs entirely in your browser`),
      ),
    ),
  );
}
