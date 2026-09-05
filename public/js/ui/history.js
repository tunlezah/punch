// history.js — the whole file, read-only: configuration, leave/travel, TOIL
// adjustments and every pay period, with search, jump-to-date and a raw
// Markdown toggle.

import { h, clear, icon, toast } from '../dom.js';
import { fmtDateAU, fmtDateShortAU, dayName, dateRange, fmtDuration, fmtDelta, minutesToHoursText, isISODate } from '../time.js';
import { allPeriods, periodFor, TYPE_LABELS, CREDITED_TYPES, standardMinutes, firstDataDate } from '../calc.js';
import { render } from '../markdown.js';
import * as model from '../model.js';
import { confirmDialog } from './dialogs.js';

const au = (iso) => fmtDateAU(iso, { weekday: false });

export function renderHistory(root, app) {
  const { store } = app;
  const state = store.state;
  const cfg = state.config;
  const d = store.derived;
  const today = app.today();
  const fmt = app.fmt;
  const fmtD = app.fmtDelta;
  const periods = allPeriods(state, d);
  const current = periodFor(cfg, today);
  let raw = false;

  const search = h('input', { type: 'search', placeholder: 'Search dates, types, notes…', 'aria-label': 'Search the timesheet' });
  const jump = h('input', { type: 'date', 'aria-label': 'Jump to date' });
  const rawBtn = h('button', { type: 'button', class: 'btn', 'aria-pressed': 'false' }, icon('file', 16), 'Raw Markdown');
  const content = h('div', { class: 'stack' });
  const navList = h('ul');
  const nav = h('nav', { class: 'history-nav card', 'aria-label': 'Pay periods' },
    h('details', { open: true }, h('summary', {}, `${periods.length} pay period${periods.length === 1 ? '' : 's'}`), navList));

  const first = firstDataDate(state);
  root.append(
    h('div', { class: 'toolbar' },
      search,
      h('label', { class: 'row' }, 'Jump to', jump),
      h('span', { class: 'spacer' }),
      h('span', { class: 'muted' }, first ? `Records from ${au(first)}` : 'No records yet'),
      rawBtn),
    h('div', { class: 'history-layout' }, nav, content),
  );

  const rowFor = (iso) => {
    const { day, calc } = d.get(iso);
    const credited = CREDITED_TYPES.includes(day.type) && !calc.actual;
    const worked = calc.complete ? fmt(calc.worked) : credited ? fmt(day.creditedHours != null ? day.creditedHours : standardMinutes(cfg, iso)) : calc.live ? `${fmt(calc.worked)}…` : '—';
    const badge = day.source === 'span' ? h('span', { class: 'badge accent' }, 'span') : day.source === 'holiday' ? h('span', { class: 'badge accent' }, 'PH list') : null;
    const text = [iso, au(iso), dayName(iso), TYPE_LABELS[day.type], day.in, day.lunchOut, day.lunchBack, day.home, worked, day.notes].join(' ').toLowerCase();
    const cls = ['', !calc.workDay && 'row-off', iso === today && 'row-today', day.source !== 'record' && 'row-virtual'].filter(Boolean).join(' ');
    return h('tr', { class: cls, dataset: { date: iso, search: text } },
      h('td', {}, h('span', { class: 'date-cell' }, h('span', { class: 'dow' }, dayName(iso)), h('span', { class: 'dmy' }, fmtDateShortAU(iso)))),
      h('td', {}, TYPE_LABELS[day.type], badge ? ' ' : '', badge),
      h('td', {}, day.in || ''), h('td', {}, day.lunchOut || ''), h('td', {}, day.lunchBack || ''), h('td', {}, day.home || ''),
      h('td', { class: 'num' }, worked), h('td', { class: 'num' }, fmt(calc.std)),
      h('td', { class: `num ${calc.complete ? (calc.delta > 0 ? 'pos' : calc.delta < 0 ? 'neg' : 'zero') : ''}` }, calc.complete ? fmtD(calc.delta) : ''),
      h('td', { class: 'notes' }, day.notes || ''));
  };

  const dayHead = () => h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', {}, 'Type'), h('th', {}, 'In'), h('th', {}, 'Lunch out'), h('th', {}, 'Lunch back'), h('th', {}, 'Home'),
    h('th', { class: 'num' }, 'Worked'), h('th', { class: 'num' }, 'Std'), h('th', { class: 'num' }, 'Δ'), h('th', {}, 'Notes')));

  function build() {
    clear(content);
    clear(navList);
    if (raw) {
      content.append(h('section', { class: 'card' },
        h('div', { class: 'card-head' }, h('h3', {}, 'timesheet.md as it will be saved'), h('span', { class: 'sub' }, 'derived columns are recomputed on every save')),
        h('pre', { class: 'raw', tabindex: 0 }, render(state))));
      return;
    }
    // Config
    const kv = [
      ['standard_hours_per_day', `${minutesToHoursText(cfg.standardMinutesPerDay)} (${fmtDuration(cfg.standardMinutesPerDay)})`],
      ['work_days', cfg.workDays.join(', ')], ['pay_period_anchor', cfg.payPeriodAnchor], ['pay_period_days', String(cfg.payPeriodDays)],
      ['default_lunch_minutes', String(cfg.defaultLunchMinutes)], ['rounding_minutes', String(cfg.roundingMinutes)], ['hours_display', cfg.hoursDisplay],
      ['balance_start', cfg.balanceStart || '(first record)'], ['recent_weeks', String(cfg.recentWeeks)], ['theme', cfg.theme], ['accent', cfg.accent],
      ['holiday_region', cfg.holidayRegion], ['reminder_time', cfg.reminderTime || '(off)'], ['last_saved', cfg.lastSaved || '—'],
    ];
    content.append(h('section', { class: 'card' }, h('details', {}, h('summary', { style: { cursor: 'pointer', fontWeight: 700 } }, 'Configuration'),
      h('dl', { class: 'kv', style: { marginTop: '10px' } }, kv.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])))));

    // Leave and travel
    content.append(h('section', { class: 'card', dataset: { section: 'leave' } },
      h('div', { class: 'card-head' }, h('h3', {}, icon('plane', 16), 'Leave and travel'), h('span', { class: 'sub' }, `${state.spans.length} span${state.spans.length === 1 ? '' : 's'}`)),
      state.spans.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid readonly-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Type'), h('th', {}, 'Start'), h('th', {}, 'End'), h('th', { class: 'num' }, 'Hours/day'), h('th', {}, 'Notes'))),
        h('tbody', {}, [...state.spans].reverse().map((s) => h('tr', { dataset: { search: `${s.type} ${s.start} ${au(s.start)} ${s.end} ${au(s.end)} ${s.notes}`.toLowerCase() } },
          h('td', {}, TYPE_LABELS[s.type], !s.end ? h('span', { class: 'badge accent', style: { marginLeft: '6px' } }, 'open') : null),
          h('td', {}, `${fmtDateAU(s.start)}${s.startTime ? ' ' + s.startTime : ''}`), h('td', {}, s.end ? `${fmtDateAU(s.end)}${s.endTime ? ' ' + s.endTime : ''}` : '—'),
          h('td', { class: 'num' }, fmt(s.hoursPerDay != null ? s.hoursPerDay : cfg.standardMinutesPerDay)), h('td', { class: 'notes' }, s.notes)))))) : h('p', { class: 'muted' }, 'None.')));

    // TOIL adjustments
    content.append(h('section', { class: 'card', dataset: { section: 'toil' } },
      h('div', { class: 'card-head' }, h('h3', {}, 'TOIL adjustments'), h('span', { class: 'sub' }, `total ${fmtD(state.adjustments.reduce((a, x) => a + x.minutes, 0))}`)),
      state.adjustments.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid readonly-table' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Date'), h('th', { class: 'num' }, 'Adjustment'), h('th', {}, 'Reason'))),
        h('tbody', {}, [...state.adjustments].reverse().map((a) => h('tr', { dataset: { search: `${a.date} ${au(a.date)} ${fmtDelta(a.minutes)} ${a.reason}`.toLowerCase() } },
          h('td', {}, fmtDateAU(a.date)), h('td', { class: `num ${a.minutes > 0 ? 'pos' : a.minutes < 0 ? 'neg' : ''}` }, fmtD(a.minutes)), h('td', { class: 'notes' }, a.reason)))))) : h('p', { class: 'muted' }, 'None.')));

    // Periods
    for (const p of periods) {
      const dates = dateRange(p.start, p.end).filter((iso) => d.get(iso).day.source !== 'none');
      const s = d.summarize(p.start, p.end);
      const isCurrent = p.index === current.index;
      const section = h('section', { class: 'card period-section', id: `period-${p.index}`, dataset: { section: 'period' } },
        h('h3', {}, `Pay period ${fmtDateAU(p.start)} → ${fmtDateAU(p.end)}`, isCurrent ? h('span', { class: 'badge accent' }, 'current') : null, h('span', { class: 'sub' }, `${dates.length} day${dates.length === 1 ? '' : 's'} with data`)),
        dates.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'grid readonly-table' }, dayHead(), h('tbody', {}, dates.map(rowFor)))) : h('p', { class: 'muted', style: { marginTop: '8px' } }, 'No records in this period.'),
        h('div', { class: 'period-summary' }, 'Period: ', h('b', {}, fmt(s.worked)), ' worked · ', h('b', {}, fmt(s.std)), ' standard · Δ ', h('b', {}, fmtD(s.delta)), ' · Balance to date: ', h('b', {}, fmtD(s.balanceToDate))));
      content.append(section);
      const link = h('a', { href: `#period-${p.index}`, class: isCurrent ? 'current' : '' }, `${au(p.start)} → ${au(p.end)}`, h('span', { class: 'muted' }, ` · ${dates.length}`));
      link.addEventListener('click', (e) => { e.preventDefault(); section.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      navList.append(h('li', {}, link));
    }

    // Unparsed
    if (state.unparsed.length) {
      content.append(h('section', { class: 'card', dataset: { section: 'unparsed' } },
        h('div', { class: 'card-head' }, h('h3', {}, icon('warn', 16), 'Unparsed lines'),
          h('button', { type: 'button', class: 'btn btn-sm', onClick: async () => {
            if (await confirmDialog({ title: 'Discard unparsed lines?', message: `${state.unparsed.length} line(s) the app could not read will be removed from the file on the next save.`, okLabel: 'Discard', danger: true })) {
              app.act('Discarded unparsed lines', (st) => model.clearUnparsed(st), { undoable: true });
            }
          } }, 'Discard')),
        h('p', { class: 'hint' }, 'These lines were found in the file but could not be read as data. They are kept verbatim at the end of the file. Fix them by hand in the file, or discard them.'),
        h('pre', { class: 'raw' }, state.unparsed.join('\n'))));
    }
    applyFilter();
  }

  function applyFilter() {
    const q = search.value.trim().toLowerCase();
    for (const tr of content.querySelectorAll('tr[data-search]')) tr.hidden = Boolean(q) && !tr.dataset.search.includes(q);
    for (const sec of content.querySelectorAll('section[data-section]')) {
      const rows = [...sec.querySelectorAll('tr[data-search]')];
      sec.hidden = Boolean(q) && rows.length > 0 && rows.every((r) => r.hidden);
    }
  }

  search.addEventListener('input', applyFilter);
  jump.addEventListener('change', () => {
    const iso = jump.value;
    if (!isISODate(iso)) return;
    if (raw) { raw = false; rawBtn.setAttribute('aria-pressed', 'false'); build(); }
    const row = content.querySelector(`tr[data-date="${iso}"]`);
    if (row) {
      row.hidden = false;
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.remove('hl');
      requestAnimationFrame(() => row.classList.add('hl'));
      return;
    }
    const p = periodFor(cfg, iso);
    const sec = content.querySelector(`#period-${p.index}`);
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else toast(`No data around ${fmtDateAU(iso)}`, { kind: 'info' });
  });
  rawBtn.addEventListener('click', () => {
    raw = !raw;
    rawBtn.setAttribute('aria-pressed', String(raw));
    build();
  });
  build();
}
