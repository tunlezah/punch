// markdown.js — render(state) → Markdown text and parse(text) → state.
// The Markdown file is the canonical store. Derived columns (Day, Worked for
// Work days, Std, Δ, the Period: lines) are recomputed on every save and
// ignored when reading. Anything the parser cannot understand is kept
// verbatim under "## Unparsed".

import {
  DAY_NAMES, isISODate, dayName, parseHHMM, fmtHHMM, parseDuration, fmtDuration, fmtDelta,
  minutesToHoursText,
} from './time.js';
import {
  TYPES, SPAN_TYPES, CREDITED_TYPES, standardMinutes, derive, periodsWithRecords, periodKey,
} from './calc.js';
import { emptyState, normalizeState } from './model.js';

export const APP_NAME = 'Punch';
export const FILE_VERSION = 1;
export const DEFAULT_FILE_NAME = 'timesheet.md';

const DAY_COLUMNS = ['Date', 'Day', 'Type', 'In', 'Lunch out', 'Lunch back', 'Home', 'Worked', 'Std', 'Δ', 'Notes'];
const LEAVE_COLUMNS = ['Type', 'Start', 'End', 'Hours/day', 'Notes'];
const TOIL_COLUMNS = ['Date', 'Adjustment', 'Reason'];
const HOLIDAY_COLUMNS = ['Date', 'Day', 'Name'];

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

function table(headers, rows) {
  const all = [headers, ...rows.map((r) => r.map((c) => esc(c)))];
  const widths = headers.map((_, i) => Math.max(3, ...all.map((r) => [...(r[i] ?? '')].length)));
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - [...s].length));
  const line = (cells) => `| ${cells.map((c, i) => pad(c ?? '', widths[i])).join(' | ')} |`;
  const out = [line(headers), `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`];
  for (const r of all.slice(1)) out.push(line(r));
  return out;
}

function configYaml(config) {
  const lines = [
    `last_saved: ${config.lastSaved || ''}`.trimEnd(),
    `standard_hours_per_day: ${minutesToHoursText(config.standardMinutesPerDay)}`,
    `work_days: [${config.workDays.join(', ')}]`,
    `pay_period_anchor: ${config.payPeriodAnchor}`,
    `pay_period_days: ${config.payPeriodDays}`,
    `default_lunch_minutes: ${config.defaultLunchMinutes}`,
    `rounding_minutes: ${config.roundingMinutes}`,
    `hours_display: ${config.hoursDisplay}`,
    `balance_start: ${config.balanceStart}`.trimEnd(),
    `recent_weeks: ${config.recentWeeks}`,
    `theme: ${config.theme}`,
    `accent: ${config.accent}`,
    `holiday_region: ${config.holidayRegion}`,
    `reminder_time: ${config.reminderTime}`.trimEnd(),
  ];
  for (const l of config.extra) lines.push(l);
  return lines;
}

const dur = (m) => fmtDuration(m, 'hmm');

/** Render the whole state as Markdown. `now` only affects derived "to date" figures. */
export function render(state, now = new Date()) {
  const d = derive(state, now);
  const config = state.config;
  const out = [];
  out.push('# Timesheet', '');
  out.push(`<!-- Written by ${APP_NAME} v${FILE_VERSION}. Tables below are read back by the app — keep the column layout. -->`, '');

  out.push('## Config', '', '```yaml', ...configYaml(config), '```', '');

  out.push('## Leave and travel', '');
  out.push(...table(LEAVE_COLUMNS, state.spans.map((s) => [
    s.type,
    `${s.start}${s.startTime ? ' ' + s.startTime : ''}`,
    s.end ? `${s.end}${s.endTime ? ' ' + s.endTime : ''}` : '',
    dur(s.hoursPerDay ?? config.standardMinutesPerDay),
    s.notes,
  ])), '');

  out.push('## TOIL adjustments', '');
  out.push(...table(TOIL_COLUMNS, state.adjustments.map((a) => [a.date, fmtDelta(a.minutes), a.reason])), '');

  out.push('## Public holidays', '');
  out.push(...table(HOLIDAY_COLUMNS, state.holidays.map((hd) => [hd.date, dayName(hd.date), hd.name])), '');

  for (const p of periodsWithRecords(state)) {
    out.push(`## Pay period ${periodKey(p)}`, '');
    const rows = p.dates.map((iso) => {
      const rec = state.days[iso];
      const { calc } = d.get(iso);
      let worked = '';
      if (CREDITED_TYPES.includes(rec.type) && !calc.actual) worked = dur(rec.creditedHours ?? standardMinutes(config, iso));
      else if (calc.complete) worked = dur(calc.worked);
      return [
        iso, dayName(iso), rec.type, rec.in, rec.lunchOut, rec.lunchBack, rec.home,
        worked, dur(calc.std), calc.complete ? fmtDelta(calc.delta) : '', rec.notes,
      ];
    });
    out.push(...table(DAY_COLUMNS, rows), '');
    const s = d.summarize(p.start, p.end);
    out.push(`Period: ${dur(s.worked)} worked · ${dur(s.std)} standard · Δ ${fmtDelta(s.delta)} · Balance to date: ${fmtDelta(s.balanceToDate)}`, '');
  }

  if (state.unparsed.length) {
    out.push('## Unparsed', '');
    out.push(...state.unparsed, '');
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Parsing

const TYPE_ALIASES = {
  work: 'Work', worked: 'Work', w: 'Work',
  holiday: 'Holiday', leave: 'Holiday', annual: 'Holiday', 'annual leave': 'Holiday', hol: 'Holiday', al: 'Holiday', rec: 'Holiday', 'rec leave': 'Holiday',
  sick: 'Sick', 'sick leave': 'Sick', personal: 'Sick', 'personal leave': 'Sick', carer: 'Sick', carers: 'Sick',
  publicholiday: 'PublicHoliday', 'public holiday': 'PublicHoliday', ph: 'PublicHoliday', public: 'PublicHoliday', 'public hol': 'PublicHoliday',
  tdy: 'TDY', travel: 'TDY', duty: 'TDY',
  off: 'Off', rdo: 'Off', 'day off': 'Off', weekend: 'Off', none: 'Off',
};

export function parseType(s) {
  const t = String(s ?? '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!t) return 'Work';
  if (TYPE_ALIASES[t]) return TYPE_ALIASES[t];
  const exact = TYPES.find((x) => x.toLowerCase() === t.replace(/\s/g, ''));
  return exact || null;
}

/** Accept ISO or Australian dd/mm/yyyy dates; returns ISO or null. */
export function parseDateCell(s) {
  const t = String(s ?? '').trim();
  if (isISODate(t)) return t;
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dmy = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isISODate(dmy) ? dmy : null;
  }
  m = t.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    return isISODate(iso) ? iso : null;
  }
  return null;
}

function parseDateTimeCell(s) {
  const t = String(s ?? '').trim();
  if (!t) return { date: '', time: '' };
  const parts = t.split(/\s+/);
  const date = parseDateCell(parts[0]);
  if (!date) return null;
  if (parts.length === 1) return { date, time: '' };
  const m = parseHHMM(parts.slice(1).join(''));
  if (m === null) return null;
  return { date, time: fmtHHMM(m) };
}

const PIPE_PLACEHOLDER = String.fromCharCode(1);
const BOM = String.fromCharCode(0xfeff);

export function splitRow(line) {
  const t = line.trim();
  const inner = t.replace(/^\|/, '').replace(/\|\s*$/, '');
  return inner
    .split('\\|').join(PIPE_PLACEHOLDER)
    .split('|')
    .map((c) => c.split(PIPE_PLACEHOLDER).join('|').trim());
}

const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '');

const normHeader = (h) => h.toLowerCase().replace(/[^a-z/δ]+/g, ' ').trim();

const DAY_HEADER_KEYS = {
  date: 'date', day: 'day', type: 'type', in: 'in', 'lunch out': 'lunchOut', lunchout: 'lunchOut', 'out to lunch': 'lunchOut',
  'lunch back': 'lunchBack', lunchback: 'lunchBack', 'back from lunch': 'lunchBack', 'lunch in': 'lunchBack',
  home: 'home', out: 'home', worked: 'worked', hours: 'worked', std: 'std', standard: 'std', 'δ': 'delta', delta: 'delta',
  variance: 'delta', diff: 'delta', notes: 'notes', note: 'notes', comment: 'notes', comments: 'notes',
};
const LEAVE_HEADER_KEYS = {
  type: 'type', start: 'start', from: 'start', end: 'end', to: 'end', 'hours/day': 'hoursPerDay', 'hours day': 'hoursPerDay',
  hours: 'hoursPerDay', 'hours per day': 'hoursPerDay', notes: 'notes', note: 'notes',
};
const TOIL_HEADER_KEYS = {
  date: 'date', adjustment: 'minutes', hours: 'minutes', amount: 'minutes', 'δ': 'minutes', delta: 'minutes',
  reason: 'reason', notes: 'reason', note: 'reason',
};
const HOLIDAY_HEADER_KEYS = {
  date: 'date', day: 'day', name: 'name', holiday: 'name', 'public holiday': 'name', notes: 'name', note: 'name', description: 'name',
};
const DEFAULT_HOLIDAY_COLS = ['date', 'day', 'name'];
const DEFAULT_DAY_COLS = ['date', 'day', 'type', 'in', 'lunchOut', 'lunchBack', 'home', 'worked', 'std', 'delta', 'notes'];
const DEFAULT_LEAVE_COLS = ['type', 'start', 'end', 'hoursPerDay', 'notes'];
const DEFAULT_TOIL_COLS = ['date', 'minutes', 'reason'];

function headerCols(cells, keys) {
  return cells.map((c) => {
    const n = normHeader(c);
    return keys[n] || keys[n.replace(/ /g, '')] || null;
  });
}

function looksLikeHeader(cells, keys) {
  if (!cells.length) return false;
  const first = normHeader(cells[0]);
  return Boolean(keys[first]) && parseDateCell(cells[0]) === null && parseType(cells[0]) === null;
}

function cellsByKey(cells, cols) {
  const o = {};
  cols.forEach((k, i) => { if (k && o[k] === undefined) o[k] = cells[i] ?? ''; });
  return o;
}

function classifySection(title) {
  const t = title.toLowerCase();
  if (/^config/.test(t)) return 'config';
  if (/public holiday/.test(t)) return 'holidays';
  if (/leave|travel/.test(t)) return 'leave';
  if (/toil|adjust/.test(t)) return 'toil';
  if (/^pay period|^period|^fortnight|^week/.test(t)) return 'period';
  if (/^unparsed/.test(t)) return 'unparsed';
  return 'other';
}

const YAML_KEYS = {
  last_saved: 'lastSaved',
  standard_hours_per_day: 'standardMinutesPerDay',
  standard_hours_per_week: '_weekMinutes',
  work_days: 'workDays',
  pay_period_anchor: 'payPeriodAnchor',
  pay_period_days: 'payPeriodDays',
  default_lunch_minutes: 'defaultLunchMinutes',
  rounding_minutes: 'roundingMinutes',
  hours_display: 'hoursDisplay',
  balance_start: 'balanceStart',
  recent_weeks: 'recentWeeks',
  theme: 'theme',
  accent: 'accent',
  holiday_region: 'holidayRegion',
  reminder_time: 'reminderTime',
};

function parseYamlLine(line, cfg) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return;
  const m = t.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
  if (!m) { cfg.extra.push(line); return; }
  const key = m[1].toLowerCase().replace(/-/g, '_');
  let value = m[2].trim().replace(/\s+#.*$/, '');
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  const prop = YAML_KEYS[key];
  if (!prop) { cfg.extra.push(line); return; }
  switch (prop) {
    case 'standardMinutesPerDay': {
      const mins = parseDuration(value);
      if (mins !== null) cfg.standardMinutesPerDay = mins;
      break;
    }
    case '_weekMinutes': {
      const mins = parseDuration(value);
      if (mins !== null) cfg._weekMinutes = mins;
      break;
    }
    case 'workDays':
      cfg.workDays = value.replace(/^\[|\]$/g, '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
      break;
    case 'payPeriodAnchor':
    case 'balanceStart': {
      const d = parseDateCell(value);
      cfg[prop] = d || '';
      break;
    }
    default:
      cfg[prop] = value;
  }
}

/**
 * Parse Markdown text into a normalised state. Never throws on bad input;
 * unrecognised lines are collected under state.unparsed.
 */
export function parse(text) {
  let src = String(text ?? '');
  if (src.startsWith(BOM)) src = src.slice(1);
  const lines = src.split(/\r?\n/);
  const cfg = { extra: [] };
  const days = [];
  const spans = [];
  const adjustments = [];
  const holidays = [];
  const unparsed = [];
  let section = 'preamble';
  let inYaml = false;
  let cols = null;

  const parseDayRow = (cells) => {
    const c = cols || DEFAULT_DAY_COLS;
    const v = cellsByKey(cells, c);
    const date = parseDateCell(v.date);
    if (!date) return false;
    const type = parseType(v.type);
    if (!type) return false;
    const times = {};
    for (const k of ['in', 'lunchOut', 'lunchBack', 'home']) {
      const raw = (v[k] ?? '').trim();
      if (!raw) { times[k] = ''; continue; }
      const m = parseHHMM(raw);
      if (m === null) return false;
      times[k] = fmtHHMM(m);
    }
    let creditedHours = null;
    if (CREDITED_TYPES.includes(type) && !(times.in && times.home)) {
      const raw = (v.worked ?? '').trim();
      if (raw) {
        const m = parseDuration(raw);
        if (m === null) return false;
        creditedHours = m;
      }
    }
    days.push({ date, type, ...times, creditedHours, notes: v.notes ?? '' });
    return true;
  };

  const parseLeaveRow = (cells) => {
    const c = cols || DEFAULT_LEAVE_COLS;
    const v = cellsByKey(cells, c);
    const type = parseType(v.type);
    if (!type || !SPAN_TYPES.includes(type)) return false;
    const start = parseDateTimeCell(v.start);
    if (!start || !start.date) return false;
    const end = parseDateTimeCell(v.end);
    if (end === null) return false;
    let hoursPerDay = null;
    const raw = (v.hoursPerDay ?? '').trim();
    if (raw) {
      const m = parseDuration(raw);
      if (m === null) return false;
      hoursPerDay = m;
    }
    spans.push({ type, start: start.date, startTime: start.time, end: end.date, endTime: end.time, hoursPerDay, notes: v.notes ?? '' });
    return true;
  };

  const parseHolidayRow = (cells) => {
    const c = cols || DEFAULT_HOLIDAY_COLS;
    const v = cellsByKey(cells, c);
    const date = parseDateCell(v.date);
    if (!date) return false;
    holidays.push({ date, name: v.name ?? '' });
    return true;
  };

  const parseToilRow = (cells) => {
    const c = cols || DEFAULT_TOIL_COLS;
    const v = cellsByKey(cells, c);
    const date = parseDateCell(v.date);
    if (!date) return false;
    const minutes = parseDuration(v.minutes);
    if (minutes === null) return false;
    adjustments.push({ date, minutes, reason: v.reason ?? '' });
    return true;
  };

  for (const line of lines) {
    const t = line.trim();
    if (inYaml) {
      if (t.startsWith('```')) { inYaml = false; continue; }
      parseYamlLine(line, cfg);
      continue;
    }
    if (/^##\s+/.test(t)) {
      cols = null;
      section = classifySection(t.replace(/^##\s+/, ''));
      if (section === 'other') unparsed.push(line);
      continue;
    }
    if (t === '') continue;
    if (/^#\s/.test(t) && section === 'preamble') continue; // title
    if (/^<!--.*-->$/.test(t)) continue; // comments
    if (section === 'config') {
      if (t.startsWith('```')) { inYaml = true; continue; }
      parseYamlLine(line, cfg);
      continue;
    }
    if (section === 'unparsed' || section === 'other' || section === 'preamble') {
      unparsed.push(line);
      continue;
    }
    if (t.startsWith('|')) {
      const cells = splitRow(t);
      if (isSeparator(cells)) continue;
      const keys = section === 'leave' ? LEAVE_HEADER_KEYS : section === 'toil' ? TOIL_HEADER_KEYS : section === 'holidays' ? HOLIDAY_HEADER_KEYS : DAY_HEADER_KEYS;
      if (looksLikeHeader(cells, keys)) { cols = headerCols(cells, keys); continue; }
      const ok = section === 'leave' ? parseLeaveRow(cells) : section === 'toil' ? parseToilRow(cells) : section === 'holidays' ? parseHolidayRow(cells) : parseDayRow(cells);
      if (!ok) unparsed.push(line);
      continue;
    }
    if (section === 'period' && /^(period|week|total)s?\b\s*:/i.test(t)) continue; // derived summary line
    unparsed.push(line);
  }

  if (cfg.standardMinutesPerDay == null && cfg._weekMinutes != null) {
    const wd = Array.isArray(cfg.workDays) && cfg.workDays.length ? cfg.workDays.length : 5;
    cfg.standardMinutesPerDay = Math.round(cfg._weekMinutes / wd);
  }
  delete cfg._weekMinutes;

  return normalizeState({ config: cfg, days, spans, adjustments, holidays, unparsed });
}

/** Read only the last_saved stamp out of a file without a full parse. */
export function peekLastSaved(text) {
  const m = String(text ?? '').match(/^\s*last_saved\s*:\s*(\S+)/m);
  return m ? m[1] : '';
}

export { emptyState, DAY_NAMES };
