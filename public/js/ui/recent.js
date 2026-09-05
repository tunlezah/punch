// recent.js — the last N weeks as editable week tables, plus the leave/travel
// span editor, CSV export and the print layout for a pay period.

import { h, clear, icon, kbd, toast, timeInput } from '../dom.js';
import { fmtDateAU, fmtDateShortAU, dayName, dateRange, parseDuration, fmtDuration, normHHMM, nowHHMM, fmtDelta, isISODate } from '../time.js';
import {
  recentWeeks, periodFor, periodIndex, periodRange, allPeriods, TYPES, TYPE_LABELS, SPAN_TYPES, CREDITED_TYPES, standardMinutes,
} from '../calc.js';
import * as model from '../model.js';
import { downloadText } from '../storage.js';
import { openDialog, dateField, timeField, textField, field, confirmDialog } from './dialogs.js';

const au = (iso) => fmtDateAU(iso, { weekday: false });
let selectedPeriodIndex = null;

const SOURCE_BADGE = { span: (day) => `${TYPE_LABELS[day.type]} span`, holiday: () => 'Public holiday list' };

export function renderRecent(root, app) {
  const { store } = app;
  const state = store.state;
  const cfg = state.config;
  const d = store.derived;
  const today = app.today();
  const periods = allPeriods(state, d);
  const current = periodFor(cfg, today);
  if (selectedPeriodIndex === null || !periods.some((p) => p.index === selectedPeriodIndex)) selectedPeriodIndex = current.index;

  const sel = h('select', { 'aria-label': 'Pay period for export and print' },
    periods.map((p) => h('option', { value: String(p.index), selected: p.index === selectedPeriodIndex }, `${au(p.start)} → ${au(p.end)}${p.index === current.index ? ' (current)' : ''}`)));
  sel.addEventListener('change', () => { selectedPeriodIndex = Number(sel.value); });
  root.append(h('div', { class: 'toolbar' },
    h('span', { class: 'muted' }, `Last ${cfg.recentWeeks} week${cfg.recentWeeks === 1 ? '' : 's'} · every cell is editable · times are 24-hour, dates are day/month`),
    h('span', { class: 'spacer' }),
    h('label', { class: 'row' }, 'Pay period', sel),
    h('button', { type: 'button', class: 'btn', onClick: () => exportCSV(app, periodRange(cfg, selectedPeriodIndex)) }, icon('download', 16), 'Export CSV'),
    h('button', { type: 'button', class: 'btn', onClick: () => printPeriod(app, periodRange(cfg, selectedPeriodIndex)) }, icon('print', 16), 'Print period'),
  ));

  for (const w of recentWeeks(cfg, today, cfg.recentWeeks)) root.append(weekCard(app, w));
  root.append(spansCard(app));
}

function weekCard(app, w) {
  const { store } = app;
  const state = store.state;
  const cfg = state.config;
  const d = store.derived;
  const today = app.today();
  const fmt = app.fmt;
  const fmtD = app.fmtDelta;
  const body = h('tbody');
  let lastPeriod = null;
  for (const iso of dateRange(w.start, w.end)) {
    const pi = periodIndex(cfg, iso);
    if (lastPeriod !== null && pi !== lastPeriod) {
      const p = periodRange(cfg, pi);
      body.append(h('tr', { class: 'period-marker' }, h('td', { colspan: 12 }, h('div', { class: 'period-rule' }, `Pay period ${au(p.start)} → ${au(p.end)} starts`))));
    }
    lastPeriod = pi;
    body.append(dayRow(app, iso));
  }
  const ws = d.summarize(w.start, w.end);
  const touched = [...new Set(dateRange(w.start, w.end).map((iso) => periodIndex(cfg, iso)))];
  const foot = h('div', { class: 'week-foot' },
    h('span', {}, 'Week: ', h('b', {}, fmt(ws.worked)), ' worked · ', h('b', {}, fmt(ws.std)), ' standard · Δ ', h('b', { class: ws.delta > 0 ? 'pos' : ws.delta < 0 ? 'neg' : '' }, fmtD(ws.delta)), ws.live != null ? ` · today so far ${fmt(ws.live)}` : ''),
    ...touched.map((k) => {
      const p = periodRange(cfg, k);
      const ps = d.summarize(p.start, p.end);
      return h('span', {}, `Period ${au(p.start)} → ${au(p.end)}: `, h('b', {}, fmt(ps.worked)), ` / ${fmt(ps.std)} · Δ `, h('b', { class: ps.delta > 0 ? 'pos' : ps.delta < 0 ? 'neg' : '' }, fmtD(ps.delta)), ' · balance ', h('b', {}, fmtD(ps.balanceToDate)));
    }),
  );
  const isThisWeek = w.start <= today && today <= w.end;
  return h('section', { class: 'card', 'aria-label': `Week of ${fmtDateAU(w.start)}` },
    h('div', { class: 'card-head' }, h('h3', {}, `Week of ${fmtDateAU(w.start)}`, isThisWeek ? h('span', { class: 'badge accent' }, 'this week') : null),
      h('span', { class: 'sub' }, `${au(w.start)} → ${au(w.end)}`)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'grid' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Type'), h('th', {}, 'In'), h('th', {}, 'Lunch out'), h('th', {}, 'Lunch back'), h('th', {}, 'Home'),
        h('th', { class: 'num' }, 'Worked'), h('th', { class: 'num' }, 'Std'), h('th', { class: 'num' }, 'Δ'), h('th', {}, 'Notes'), h('th', { 'aria-label': 'Actions' }))),
      body)),
    foot);
}

function dayRow(app, iso) {
  const { store } = app;
  const state = store.state;
  const cfg = state.config;
  const d = store.derived;
  const today = app.today();
  const fmt = app.fmt;
  const fmtD = app.fmtDelta;
  const { day, calc } = d.get(iso);
  const rec = state.days[iso] || null;
  const virtual = day.source === 'span' || day.source === 'holiday';
  const blank = day.source === 'none';
  const commit = (label, patch) => app.act(label, (s) => model.setDay(s, iso, patch));
  const dLabel = au(iso);

  const badges = [];
  if (virtual) badges.push(h('span', { class: 'badge accent', title: 'Derived from the Leave and travel table or the public-holiday list; edit to override' }, SOURCE_BADGE[day.source](day)));
  if (calc.invalid) badges.push(h('span', { class: 'badge danger', title: calc.invalid }, 'check times'));
  if (calc.status === 'open') badges.push(h('span', { class: 'badge warn' }, 'no Home'));
  if (calc.tdyVariance && !state.adjustments.some((a) => a.date === iso) && !calc.future) badges.push(h('span', { class: 'badge warn', title: 'TDY over/under hours waiting for a TOIL decision (Today view)' }, 'TOIL?'));
  if (calc.live) badges.push(h('span', { class: 'badge ok' }, 'live'));

  const typeSel = h('select', { 'aria-label': `Type for ${dLabel}` }, TYPES.map((t) => h('option', { value: t, selected: t === day.type }, TYPE_LABELS[t])));
  typeSel.addEventListener('change', () => commit(`${dLabel}: ${TYPE_LABELS[typeSel.value]}`, { type: typeSel.value }));

  const timeCell = (field, label) => {
    const disabled = !(day.type === 'Work' || day.type === 'TDY' || blank);
    return timeInput({ value: day[field] || '', disabled, 'aria-label': `${label} for ${dLabel} (24-hour HH:MM)` }, (v) => {
      if (v === null) { toast('Enter a time as HH:MM (24-hour)', { kind: 'warn' }); return; }
      if (field === 'lunchBack' && v && !(rec && rec.lunchOut)) { toast('Set Out to lunch first', { kind: 'warn' }); return; }
      commit(`${dLabel}: ${label} ${v || 'cleared'}`, { [field]: v });
    });
  };

  let workedCell;
  if (CREDITED_TYPES.includes(day.type) && !calc.actual) {
    const dur = h('input', { type: 'text', class: 'dur', value: fmt(day.creditedHours != null ? day.creditedHours : standardMinutes(cfg, iso)), 'aria-label': `Credited hours for ${dLabel}`, title: 'Credited hours — h:mm or decimal' });
    dur.addEventListener('change', () => {
      const m = parseDuration(dur.value);
      if (m === null) { toast('Enter hours as h:mm or decimal', { kind: 'warn' }); dur.value = fmt(day.creditedHours != null ? day.creditedHours : standardMinutes(cfg, iso)); return; }
      commit(`${dLabel}: credited ${fmt(m)}`, { creditedHours: m });
    });
    workedCell = h('td', { class: 'num' }, dur);
  } else {
    workedCell = h('td', { class: 'num' }, calc.complete ? fmt(calc.worked) : calc.live ? `${fmt(calc.worked)}…` : '—');
  }

  const notes = h('input', { type: 'text', value: day.notes || '', placeholder: blank ? (calc.workDay ? 'No record — click to add' : 'Non-working day') : '', 'aria-label': `Notes for ${dLabel}`, maxlength: 200 });
  notes.addEventListener('change', () => commit(`${dLabel}: notes`, { notes: notes.value }));

  const del = rec
    ? h('button', { type: 'button', class: 'icon-btn danger', title: virtual || day.source === 'record' ? 'Remove this record' : '', 'aria-label': `Remove record for ${dLabel}`, onClick: () => app.act(`Removed ${dLabel}`, (s) => model.deleteDay(s, iso)) }, icon('trash', 16))
    : null;

  const cls = ['', !calc.workDay && 'row-off', iso === today && 'row-today', blank && 'row-blank', virtual && 'row-virtual', calc.future && 'row-future'].filter(Boolean).join(' ');
  return h('tr', { class: cls, dataset: { date: iso } },
    h('td', {}, h('div', { class: 'date-stack' }, h('span', { class: 'date-cell' }, h('span', { class: 'dow' }, dayName(iso)), h('span', { class: 'dmy' }, fmtDateShortAU(iso))), badges.length ? h('span', { class: 'row', style: { gap: '4px' } }, ...badges) : null)),
    h('td', {}, typeSel),
    h('td', {}, timeCell('in', 'In')),
    h('td', {}, timeCell('lunchOut', 'Lunch out')),
    h('td', {}, timeCell('lunchBack', 'Lunch back')),
    h('td', {}, timeCell('home', 'Home')),
    workedCell,
    h('td', { class: 'num' }, fmt(calc.std)),
    h('td', { class: `num ${calc.complete ? (calc.delta > 0 ? 'pos' : calc.delta < 0 ? 'neg' : 'zero') : ''}` }, calc.complete ? fmtD(calc.delta) : '—'),
    h('td', { class: 'notes' }, notes),
    h('td', {}, del),
  );
}

// ---------------------------------------------------------------------------
// Leave and travel spans

function spansCard(app) {
  const { store } = app;
  const state = store.state;
  const cfg = state.config;
  const fmt = app.fmt;
  const rows = state.spans.map((s, i) => ({ s, i })).sort((a, b) => (a.s.start < b.s.start ? 1 : -1));
  const table = rows.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid readonly-table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Start'), h('th', {}, 'End'), h('th', { class: 'num' }, 'Hours/day'), h('th', {}, 'Notes'), h('th', { 'aria-label': 'Actions' }))),
    h('tbody', {}, rows.map(({ s, i }) => h('tr', {},
      h('td', {}, TYPE_LABELS[s.type], !s.end ? h('span', { class: 'badge accent', style: { marginLeft: '6px' } }, 'open') : null),
      h('td', {}, `${fmtDateAU(s.start)}${s.startTime ? ' ' + s.startTime : ''}`),
      h('td', {}, s.end ? `${fmtDateAU(s.end)}${s.endTime ? ' ' + s.endTime : ''}` : '—'),
      h('td', { class: 'num' }, fmt(s.hoursPerDay != null ? s.hoursPerDay : cfg.standardMinutesPerDay)),
      h('td', { class: 'notes' }, s.notes),
      h('td', {}, h('div', { class: 'row', style: { flexWrap: 'nowrap' } },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Edit span', onClick: () => editSpan(app, i) }, icon('edit', 16)),
        h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Delete span', onClick: async () => {
          if (await confirmDialog({ title: 'Delete this span?', message: `${TYPE_LABELS[s.type]} from ${fmtDateAU(s.start)}${s.end ? ' to ' + fmtDateAU(s.end) : ' (open)'} will be removed. Days you edited individually keep their own records.`, okLabel: 'Delete', danger: true })) {
            app.act(`Deleted ${TYPE_LABELS[s.type]} span`, (st) => model.deleteSpan(st, i));
          }
        } }, icon('trash', 16)))),
    ))))) : h('div', { class: 'empty' }, 'No leave or travel spans yet. Use the Today view buttons, or add one here.');
  return h('section', { class: 'card', 'aria-labelledby': 'spans-h' },
    h('div', { class: 'card-head' }, h('h3', { id: 'spans-h' }, icon('plane', 16), 'Leave and travel'),
      h('button', { type: 'button', class: 'btn btn-sm', onClick: () => editSpan(app, -1) }, icon('plus', 16), 'Add span')),
    h('p', { class: 'hint' }, 'Each working day inside a span is credited the hours per day. Days you edit in the tables above override the span for that day only.'),
    table);
}

async function editSpan(app, index) {
  const state = app.store.state;
  const cfg = state.config;
  const span = index >= 0 ? state.spans[index] : { type: 'Holiday', start: app.today(), end: '', startTime: '', endTime: '', hoursPerDay: null, notes: '' };
  const typeSel = h('select', { name: 'type' }, SPAN_TYPES.map((t) => h('option', { value: t, selected: t === span.type }, TYPE_LABELS[t])));
  const start = dateField('Start', 'start', span.start);
  const end = dateField('End (leave blank while open)', 'end', span.end);
  end.input.required = false;
  const st = timeField('Start time', 'startTime', span.startTime);
  const et = timeField('End time', 'endTime', span.endTime);
  const hours = h('input', { type: 'text', name: 'hours', class: 'short', value: fmtDuration(span.hoursPerDay != null ? span.hoursPerDay : cfg.standardMinutesPerDay) });
  const notes = textField('Notes', 'notes', span.notes, { placeholder: 'e.g. Melbourne' });
  const times = h('div', { class: 'field-row' }, st.wrap, et.wrap);
  const syncTimes = () => { times.hidden = typeSel.value !== 'TDY'; };
  typeSel.addEventListener('change', syncTimes);
  syncTimes();
  const r = await openDialog({
    title: index >= 0 ? 'Edit span' : 'Add span',
    body: h('div', {}, field('Type', typeSel), h('div', { class: 'field-row' }, start.wrap, end.wrap), times, field('Hours credited per working day', hours, 'h:mm or decimal hours'), notes.wrap),
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, { label: 'Save', value: 'ok', kind: 'primary' }],
    validate: (form) => {
      if (!isISODate(form.elements.start.value)) return 'Enter a valid start date.';
      if (form.elements.end.value && !isISODate(form.elements.end.value)) return 'Enter a valid end date or leave it blank.';
      if (form.elements.end.value && form.elements.end.value < form.elements.start.value) return 'The end date is before the start date.';
      if (parseDuration(form.elements.hours.value) === null) return 'Enter the hours per day as h:mm or decimal.';
      return null;
    },
  });
  if (!r) return;
  const patch = {
    type: typeSel.value, start: start.input.value, end: end.input.value,
    startTime: normHHMM(st.input.value), endTime: normHHMM(et.input.value),
    hoursPerDay: parseDuration(hours.value), notes: notes.input.value,
  };
  if (index >= 0) app.act(`Updated ${TYPE_LABELS[patch.type]} span`, (s) => model.updateSpan(s, index, patch));
  else app.act(`Added ${TYPE_LABELS[patch.type]} span`, (s) => model.addSpan(s, patch));
}

// ---------------------------------------------------------------------------
// CSV export and printing

function periodRows(app, period) {
  const { store } = app;
  const state = store.state;
  const d = store.derived;
  const fmt = (m) => fmtDuration(m, 'hmm');
  return dateRange(period.start, period.end).map((iso) => {
    const { day, calc } = d.get(iso);
    const credited = CREDITED_TYPES.includes(day.type) && !calc.actual;
    return {
      iso, day, calc,
      cells: [
        iso, dayName(iso), day.source === 'none' ? '' : TYPE_LABELS[day.type], day.in, day.lunchOut, day.lunchBack, day.home,
        calc.complete ? fmt(calc.worked) : credited ? fmt(day.creditedHours != null ? day.creditedHours : calc.std) : '',
        fmt(calc.std), calc.complete ? fmtDelta(calc.delta) : '', day.notes || '',
        day.source === 'record' ? 'record' : day.source === 'span' ? 'leave table' : day.source === 'holiday' ? 'public holiday list' : '',
      ],
    };
  });
}

export function exportCSV(app, period) {
  const q = (v) => (/[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const header = ['Date', 'Day', 'Type', 'In', 'Lunch out', 'Lunch back', 'Home', 'Worked', 'Std', 'Delta', 'Notes', 'Source'];
  const rows = periodRows(app, period).map((r) => r.cells.map(q).join(','));
  const s = app.store.derived.summarize(period.start, period.end);
  rows.push(['Period total', '', '', '', '', '', '', fmtDuration(s.worked), fmtDuration(s.std), fmtDelta(s.delta), `Balance to date ${fmtDelta(s.balanceToDate)}`, ''].map(q).join(','));
  const csv = [header.join(','), ...rows].join('\r\n') + '\r\n';
  downloadText(csv, `timesheet_${period.start}_${period.end}.csv`, 'text/csv;charset=utf-8');
  toast('CSV exported', { kind: 'success', duration: 2500 });
}

export function fillPrintArea(app, period) {
  const area = document.getElementById('print-area');
  if (!area) return;
  clear(area);
  const { store } = app;
  const cfg = store.state.config;
  const d = store.derived;
  const s = d.summarize(period.start, period.end);
  const fmt = (m) => fmtDuration(m, cfg.hoursDisplay);
  const fmtD = (m) => fmtDelta(m, cfg.hoursDisplay);
  const rows = periodRows(app, period);
  area.append(
    h('h1', {}, `Timesheet — pay period ${fmtDateAU(period.start)} → ${fmtDateAU(period.end)}`),
    h('div', { class: 'print-meta' },
      h('span', {}, `Standard day ${fmt(cfg.standardMinutesPerDay)} · working days ${cfg.workDays.join(', ')} · default lunch ${cfg.defaultLunchMinutes} min${cfg.roundingMinutes ? ` · rounded to ${cfg.roundingMinutes} min` : ''}`),
      h('span', {}, `Printed ${fmtDateAU(app.today())} ${nowHHMM()}`)),
    h('table', {},
      h('thead', {}, h('tr', {}, ...['Date', 'Day', 'Type', 'In', 'Lunch out', 'Lunch back', 'Home'].map((t) => h('th', {}, t)), h('th', { class: 'num' }, 'Worked'), h('th', { class: 'num' }, 'Std'), h('th', { class: 'num' }, 'Δ'), h('th', {}, 'Notes'))),
      h('tbody', {}, rows.map((r) => h('tr', { class: r.calc.workDay ? '' : 'row-off' },
        h('td', {}, au(r.iso)), h('td', {}, r.cells[1]), h('td', {}, r.cells[2]), h('td', {}, r.cells[3]), h('td', {}, r.cells[4]), h('td', {}, r.cells[5]), h('td', {}, r.cells[6]),
        h('td', { class: 'num' }, r.calc.complete ? fmt(r.calc.worked) : r.cells[7]), h('td', { class: 'num' }, fmt(r.calc.std)), h('td', { class: 'num' }, r.calc.complete ? fmtD(r.calc.delta) : ''), h('td', {}, r.cells[10]))))),
    h('div', { class: 'print-summary' },
      h('span', {}, h('b', {}, 'Worked: '), fmt(s.worked)), h('span', {}, h('b', {}, 'Standard: '), fmt(s.std)), h('span', {}, h('b', {}, 'Δ: '), fmtD(s.delta)),
      h('span', {}, h('b', {}, 'TOIL balance to date: '), fmtD(s.balanceToDate))),
    h('div', { class: 'sig' }, h('div', {}, 'Employee signature / date'), h('div', {}, 'Supervisor signature / date')),
    h('div', { class: 'print-foot' }, 'Generated by Punch from timesheet.md. Leave and travel days come from the Leave and travel table; TOIL includes recorded adjustments.'),
  );
}

export function printPeriod(app, period) {
  fillPrintArea(app, period);
  window.print();
}
