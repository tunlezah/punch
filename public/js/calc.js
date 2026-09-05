// calc.js — pure computations: configuration defaults, working days, pay
// periods, span expansion, per-day worked/standard/Δ and the running TOIL
// balance. Nothing here touches the DOM or storage.

import {
  DAY_NAMES, isISODate, addDays, diffDays, weekdayIndex, dayName, dateRange,
  parseHHMM, normHHMM, roundMinutes, minISO, maxISO, todayISO, nowMinutes,
} from './time.js';
import { holidayMap, isKnownRegion } from './holidays.js';

export const TYPES = ['Work', 'Holiday', 'Sick', 'PublicHoliday', 'TDY', 'Off'];
export const SPAN_TYPES = ['Holiday', 'TDY', 'Sick'];
export const CREDITED_TYPES = ['Holiday', 'Sick', 'PublicHoliday', 'TDY'];
export const TYPE_LABELS = {
  Work: 'Work', Holiday: 'Holiday', Sick: 'Sick', PublicHoliday: 'Public holiday', TDY: 'TDY', Off: 'Off',
};
export const ACCENTS = ['teal', 'blue', 'violet', 'amber', 'rose', 'green'];
export const THEMES = ['system', 'dark', 'light'];
export const ROUNDING_OPTIONS = [0, 5, 6, 15];

export const DEFAULT_CONFIG = Object.freeze({
  standardMinutesPerDay: 456, // 7.6 h = 7:36
  workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  payPeriodAnchor: '2026-08-27',
  payPeriodDays: 14,
  defaultLunchMinutes: 30,
  roundingMinutes: 0,
  hoursDisplay: 'hmm',
  balanceStart: '',
  recentWeeks: 4,
  theme: 'system',
  accent: 'teal',
  holidayRegion: 'none',
  reminderTime: '',
  lastSaved: '',
  extra: [], // unknown yaml lines preserved verbatim
});

const clampInt = (v, lo, hi, dflt) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

export function normalizeConfig(c = {}) {
  const d = DEFAULT_CONFIG;
  const workDays = Array.isArray(c.workDays)
    ? DAY_NAMES.filter((n) => c.workDays.some((w) => String(w).slice(0, 3).toLowerCase() === n.toLowerCase()))
    : [...d.workDays];
  return {
    standardMinutesPerDay: clampInt(c.standardMinutesPerDay, 0, 1440, d.standardMinutesPerDay),
    workDays: workDays.length ? workDays : [...d.workDays],
    payPeriodAnchor: isISODate(c.payPeriodAnchor) ? c.payPeriodAnchor : d.payPeriodAnchor,
    payPeriodDays: clampInt(c.payPeriodDays, 1, 366, d.payPeriodDays),
    defaultLunchMinutes: clampInt(c.defaultLunchMinutes, 0, 600, d.defaultLunchMinutes),
    roundingMinutes: ROUNDING_OPTIONS.includes(Number(c.roundingMinutes)) ? Number(c.roundingMinutes) : d.roundingMinutes,
    hoursDisplay: c.hoursDisplay === 'decimal' ? 'decimal' : 'hmm',
    balanceStart: isISODate(c.balanceStart) ? c.balanceStart : '',
    recentWeeks: clampInt(c.recentWeeks, 1, 52, d.recentWeeks),
    theme: THEMES.includes(c.theme) ? c.theme : d.theme,
    accent: ACCENTS.includes(c.accent) ? c.accent : d.accent,
    holidayRegion: isKnownRegion(c.holidayRegion) ? c.holidayRegion : 'none',
    reminderTime: normHHMM(c.reminderTime),
    lastSaved: typeof c.lastSaved === 'string' ? c.lastSaved.trim() : '',
    extra: Array.isArray(c.extra) ? c.extra.filter((l) => typeof l === 'string') : [],
  };
}

// ---------------------------------------------------------------------------
// Working days, standard hours, weeks

export function isWorkDay(config, iso) {
  return config.workDays.includes(dayName(iso));
}

export function standardMinutes(config, iso) {
  return isWorkDay(config, iso) ? config.standardMinutesPerDay : 0;
}

export function weeklyStandardMinutes(config) {
  return config.standardMinutesPerDay * config.workDays.length;
}

/**
 * Index (0 = Mon … 6 = Sun) of the day the Recent-view week starts on:
 * the working day that follows the longest run of non-working days
 * (Mon for Mon–Fri, Sun for Sun–Thu, Tue for Tue–Sat). Monday when ambiguous.
 */
export function weekStartIndex(config) {
  const wd = DAY_NAMES.map((n) => config.workDays.includes(n));
  if (wd.every(Boolean) || wd.every((x) => !x)) return 0;
  let best = 0;
  let bestRun = -1;
  for (let i = 0; i < 7; i++) {
    if (!wd[i] || wd[(i + 6) % 7]) continue;
    let run = 0;
    for (let j = 1; j < 7 && !wd[(i - j + 7) % 7]; j++) run++;
    if (run > bestRun) { bestRun = run; best = i; }
  }
  return best;
}

export function weekStart(config, iso) {
  const back = (weekdayIndex(iso) - weekStartIndex(config) + 7) % 7;
  return addDays(iso, -back);
}

export function weekEnd(config, iso) {
  return addDays(weekStart(config, iso), 6);
}

// ---------------------------------------------------------------------------
// Pay periods

export function periodIndex(config, iso) {
  return Math.floor(diffDays(config.payPeriodAnchor, iso) / config.payPeriodDays);
}

export function periodRange(config, index) {
  const start = addDays(config.payPeriodAnchor, index * config.payPeriodDays);
  return { index, start, end: addDays(start, config.payPeriodDays - 1) };
}

export function periodFor(config, iso) {
  return periodRange(config, periodIndex(config, iso));
}

export function periodKey(range) {
  return `${range.start} → ${range.end}`;
}

// ---------------------------------------------------------------------------
// Spans

export function spanCovers(span, iso) {
  return iso >= span.start && (!span.end || iso <= span.end);
}

/** Working days inside a span; open spans run up to `until` (inclusive). */
export function spanDays(config, span, until) {
  const end = span.end || until;
  if (!end || end < span.start) return [];
  return dateRange(span.start, end).filter((d) => isWorkDay(config, d));
}

/** The span covering a date (the latest-starting one wins when spans overlap). */
export function spanForDate(spans, iso) {
  let hit = null;
  for (const s of spans) {
    if (spanCovers(s, iso) && (!hit || s.start >= hit.start)) hit = s;
  }
  return hit;
}

export function openSpan(spans, type) {
  return spans.find((s) => s.type === type && !s.end) || null;
}

// ---------------------------------------------------------------------------
// Resolving a date to a day (explicit record → public holiday → span → blank)

export function blankRecord(iso, type = 'Work') {
  return { date: iso, type, in: '', lunchOut: '', lunchBack: '', home: '', creditedHours: null, notes: '' };
}

/**
 * ctx: { today, nowMin, holidays: Map, balanceStart, adjustmentsByDate: Map }
 */
export function makeCtx(state, now = new Date()) {
  const today = todayISO(now);
  const adjustmentsByDate = new Map();
  for (const a of state.adjustments || []) {
    adjustmentsByDate.set(a.date, (adjustmentsByDate.get(a.date) || 0) + a.minutes);
  }
  return {
    today,
    nowMin: nowMinutes(now),
    holidays: holidayMap(state.config.holidayRegion),
    balanceStart: state.config.balanceStart || firstDataDate(state) || today,
    adjustmentsByDate,
  };
}

export function resolveDay(state, iso, ctx) {
  const rec = state.days[iso];
  if (rec) return { ...rec, source: 'record' };
  const ph = ctx.holidays.get(iso);
  if (ph !== undefined) {
    return { ...blankRecord(iso, 'PublicHoliday'), notes: ph, source: 'holiday' };
  }
  const span = spanForDate(state.spans, iso);
  if (span) {
    return { ...blankRecord(iso, span.type), creditedHours: span.hoursPerDay, notes: span.notes, source: 'span', span };
  }
  return { ...blankRecord(iso, isWorkDay(state.config, iso) ? 'Work' : 'Off'), source: 'none' };
}

// ---------------------------------------------------------------------------
// Per-day computation

/**
 * Compute worked / standard / Δ for one resolved day.
 * Rounding (config.roundingMinutes) is applied to each clock time before
 * subtracting; stored times are never changed.
 */
export function computeDay(config, day, ctx) {
  const iso = day.date;
  const workDay = isWorkDay(config, iso);
  const std = day.type === 'Off' ? 0 : (workDay ? config.standardMinutesPerDay : 0);
  const r = (t) => {
    const m = parseHHMM(t);
    return m === null ? null : roundMinutes(m, config.roundingMinutes);
  };
  const tIn = r(day.in);
  const tLo = r(day.lunchOut);
  const tLb = r(day.lunchBack);
  const tHome = r(day.home);
  const hasIn = tIn !== null;
  const isToday = iso === ctx.today;
  const future = iso > ctx.today;
  const lunchPair = tLo !== null && tLb !== null ? Math.max(0, tLb - tLo) : null;

  let worked = null;
  let complete = false;
  let live = false;
  let actual = false;
  let invalid = null;
  let status = 'none';

  const timeBased = day.type === 'Work' || (day.type === 'TDY' && hasIn);
  if (timeBased) {
    if (hasIn && tHome !== null) {
      actual = true;
      complete = true;
      status = 'done';
      const lunch = lunchPair !== null ? lunchPair : config.defaultLunchMinutes;
      if (tHome < tIn) {
        invalid = 'Home is earlier than In';
        worked = 0;
      } else {
        worked = Math.max(0, tHome - tIn - lunch);
      }
      if (lunchPair !== null && (tLo < tIn || tLb > tHome)) invalid = invalid || 'Lunch is outside In–Home';
    } else if (hasIn && isToday) {
      actual = true;
      live = true;
      if (tLo !== null && tLb === null) {
        status = 'lunch';
        worked = Math.max(0, tLo - tIn);
      } else {
        status = 'working';
        worked = Math.max(0, ctx.nowMin - tIn - (lunchPair !== null ? lunchPair : 0));
      }
    } else if (hasIn) {
      status = future ? 'future' : 'open'; // In without Home on another day: excluded until fixed
    } else if (day.type === 'Work' && day.source === 'record' && !isToday && !future) {
      status = 'empty'; // an explicit Work record with no hours
      worked = 0;
      complete = true;
    } else if (day.type === 'Work' && day.source === 'record' && isToday) {
      status = 'notstarted';
    } else {
      status = future ? 'future' : 'none';
    }
  } else if (day.type === 'Off') {
    if (day.source === 'record') {
      worked = 0;
      complete = true;
      status = 'off';
    } else {
      status = future ? 'future' : 'none'; // a blank non-working day carries no data
    }
  } else {
    worked = day.creditedHours != null ? day.creditedHours : std;
    complete = true;
    status = 'credited';
  }

  const delta = complete ? worked - std : null;
  const counted = complete && !future && iso >= ctx.balanceStart;
  const tdyVariance = day.type === 'TDY' && complete && delta !== 0;
  // TDY over/under hours are never added to TOIL automatically; they are
  // brought in through an explicit TOIL adjustment once the user decides.
  const countedDelta = counted && day.type !== 'TDY' ? delta : 0;

  return {
    date: iso, workDay, std, worked, delta, complete, live, actual, invalid, status,
    counted, countedDelta, tdyVariance, future, isToday,
    times: { in: tIn, lunchOut: tLo, lunchBack: tLb, home: tHome, lunchPair },
  };
}

// ---------------------------------------------------------------------------
// Whole-state derivation

export function firstDataDate(state) {
  let first = null;
  for (const d of Object.keys(state.days)) if (!first || d < first) first = d;
  for (const s of state.spans) if (!first || s.start < first) first = s.start;
  for (const a of state.adjustments || []) if (!first || a.date < first) first = a.date;
  return first;
}

export function lastDataDate(state) {
  let last = null;
  for (const d of Object.keys(state.days)) if (!last || d > last) last = d;
  for (const s of state.spans) {
    const e = s.end || s.start;
    if (!last || e > last) last = e;
  }
  for (const a of state.adjustments || []) if (!last || a.date > last) last = a.date;
  return last;
}

/**
 * Derive everything for a state at a moment in time. Returns an object with
 * per-date entries { day, calc, balance } for the span first-data → max(today,
 * last-data), the closing TOIL balance, and helpers.
 */
export function derive(state, now = new Date()) {
  const config = state.config;
  const ctx = makeCtx(state, now);
  const first = firstDataDate(state) || ctx.today;
  const from = minISO(minISO(first, ctx.balanceStart), ctx.today);
  const to = maxISO(ctx.today, lastDataDate(state) || ctx.today);
  const entries = new Map();
  let running = 0;
  let adjustmentsTotal = 0;
  for (const iso of dateRange(from, to)) {
    const day = resolveDay(state, iso, ctx);
    const calc = computeDay(config, day, ctx);
    if (iso <= ctx.today && iso >= ctx.balanceStart) {
      running += calc.countedDelta;
      const adj = ctx.adjustmentsByDate.get(iso) || 0;
      running += adj;
      adjustmentsTotal += adj;
    }
    entries.set(iso, { day, calc, balance: running });
  }
  const derived = {
    config, ctx, from, to, entries,
    balance: running,
    adjustmentsTotal,
    get(iso) {
      const e = entries.get(iso);
      if (e) return e;
      const day = resolveDay(state, iso, ctx);
      const calc = computeDay(config, day, ctx);
      const balance = iso < from ? 0 : running;
      return { day, calc, balance };
    },
    balanceThrough(iso) {
      const cap = minISO(iso, ctx.today);
      if (cap < from) return 0;
      if (cap > to) return running;
      return entries.get(cap).balance;
    },
    summarize(start, end) {
      return summarizeRange(derived, start, end);
    },
  };
  return derived;
}

/** Totals over an inclusive date range: sums of the rows that have data. */
export function summarizeRange(derived, start, end) {
  let worked = 0;
  let std = 0;
  let delta = 0;
  let days = 0;
  let live = null;
  for (const iso of dateRange(start, end)) {
    const { calc } = derived.get(iso);
    if (calc.complete) {
      worked += calc.worked;
      std += calc.std;
      delta += calc.delta;
      days++;
    } else if (calc.live) {
      live = calc.worked;
    }
  }
  return { start, end, worked, std, delta, days, live, balanceToDate: derived.balanceThrough(end) };
}

/** TDY days whose over/under hours still need a TOIL decision. */
export function pendingTdyDecisions(state, derived) {
  const out = [];
  const decided = new Set((state.adjustments || []).map((a) => a.date));
  for (const [iso, e] of derived.entries) {
    if (e.calc.tdyVariance && !e.calc.future && !decided.has(iso)) out.push({ date: iso, delta: e.calc.delta, calc: e.calc, day: e.day });
  }
  return out;
}

/** Previous days that have an In but no Home (need a Home time). */
export function openDays(state, today) {
  return Object.values(state.days)
    .filter((d) => d.date < today && (d.type === 'Work' || d.type === 'TDY') && d.in && !d.home)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Weeks (as [start, end]) covering the last n weeks up to and including the week of `today`. */
export function recentWeeks(config, today, n) {
  const thisStart = weekStart(config, today);
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = addDays(thisStart, -7 * i);
    out.push({ start, end: addDays(start, 6) });
  }
  return out;
}

/** Group every date that has data (explicit records only) by pay period, newest first. */
export function periodsWithRecords(state) {
  const groups = new Map();
  for (const iso of Object.keys(state.days)) {
    const p = periodFor(state.config, iso);
    if (!groups.has(p.index)) groups.set(p.index, { ...p, dates: [] });
    groups.get(p.index).dates.push(iso);
  }
  const out = [...groups.values()].sort((a, b) => b.index - a.index);
  for (const g of out) g.dates.sort();
  return out;
}

/** Every pay period from first data to today (or later data), newest first — for the History view. */
export function allPeriods(state, derived) {
  const config = state.config;
  const first = firstDataDate(state) || derived.ctx.today;
  const last = maxISO(derived.ctx.today, lastDataDate(state) || derived.ctx.today);
  const a = periodIndex(config, first);
  const b = periodIndex(config, last);
  const out = [];
  for (let k = b; k >= a; k--) out.push(periodRange(config, k));
  return out;
}
