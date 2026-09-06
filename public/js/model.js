// model.js — the state shape, normalisation, and pure actions (reducers).
// State = { config, days: {iso → record}, spans: [], adjustments: [], unparsed: [] }
// Every action returns a new, normalised state and never mutates its input.

import { isISODate, normHHMM, addDays, todayISO } from './time.js';
import {
  normalizeConfig, TYPES, SPAN_TYPES, CREDITED_TYPES, isWorkDay, standardMinutes,
  openSpan, blankRecord, resolveDay, makeCtx,
} from './calc.js';

export function emptyState() {
  return { config: normalizeConfig({}), days: {}, spans: [], adjustments: [], holidays: [], unparsed: [] };
}

export function cleanText(s) {
  if (s == null) return '';
  return String(s).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const toMinutesOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : null;
};

/**
 * Normalise a day record. Returns null when the record carries no information
 * (a Work day with no times and no notes, or an Off day on a non-working day).
 * creditedHours is stored only when it differs from the standard day for that
 * date, so leave days follow the configured standard day unless overridden.
 */
export function normalizeRecord(r, config) {
  if (!r || !isISODate(r.date)) return null;
  const type = TYPES.includes(r.type) ? r.type : 'Work';
  const rec = {
    date: r.date,
    type,
    in: normHHMM(r.in),
    lunchOut: normHHMM(r.lunchOut),
    lunchBack: normHHMM(r.lunchBack),
    home: normHHMM(r.home),
    creditedHours: null,
    notes: cleanText(r.notes),
  };
  if (CREDITED_TYPES.includes(type)) {
    const ch = toMinutesOrNull(r.creditedHours);
    rec.creditedHours = ch === null || ch === standardMinutes(config, r.date) ? null : ch;
  }
  if (type !== 'Work' && type !== 'TDY') {
    rec.in = ''; rec.lunchOut = ''; rec.lunchBack = ''; rec.home = '';
  }
  const noTimes = !rec.in && !rec.lunchOut && !rec.lunchBack && !rec.home;
  if (type === 'Work' && noTimes && !rec.notes) return null;
  if (type === 'Off' && !rec.notes && !isWorkDay(config, r.date)) return null;
  return rec;
}

export function normalizeSpan(s, config) {
  if (!s || !SPAN_TYPES.includes(s.type) || !isISODate(s.start)) return null;
  let start = s.start;
  let end = isISODate(s.end) ? s.end : '';
  let startTime = s.type === 'TDY' ? normHHMM(s.startTime) : '';
  let endTime = s.type === 'TDY' ? normHHMM(s.endTime) : '';
  if (end && end < start) {
    [start, end] = [end, start];
    [startTime, endTime] = [endTime, startTime];
  }
  const hp = toMinutesOrNull(s.hoursPerDay);
  return {
    type: s.type,
    start,
    startTime,
    end,
    endTime,
    hoursPerDay: hp === null || hp === config.standardMinutesPerDay ? null : hp,
    notes: cleanText(s.notes),
  };
}

/** A public-holiday list entry: { date, name }. */
export function normalizeHoliday(hd) {
  if (!hd || !isISODate(hd.date)) return null;
  return { date: hd.date, name: cleanText(hd.name) || 'Public holiday' };
}

export function normalizeAdjustment(a) {
  if (!a || !isISODate(a.date)) return null;
  const minutes = Math.round(Number(a.minutes));
  if (!Number.isFinite(minutes)) return null;
  return { date: a.date, minutes, reason: cleanText(a.reason) };
}

const spanOrder = (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
const dateOrder = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

export function normalizeState(s) {
  const config = normalizeConfig((s && s.config) || {});
  const days = {};
  const src = s && s.days ? (Array.isArray(s.days) ? s.days : Object.values(s.days)) : [];
  for (const r of src) {
    const n = normalizeRecord(r, config);
    if (n) days[n.date] = n;
  }
  const spans = ((s && s.spans) || []).map((x) => normalizeSpan(x, config)).filter(Boolean).sort(spanOrder);
  const adjustments = ((s && s.adjustments) || []).map(normalizeAdjustment).filter(Boolean).sort(dateOrder);
  const byDate = new Map();
  for (const hd of ((s && s.holidays) || []).map(normalizeHoliday).filter(Boolean)) byDate.set(hd.date, hd); // last entry for a date wins
  const holidays = [...byDate.values()].sort(dateOrder);
  const unparsed = ((s && s.unparsed) || []).filter((l) => typeof l === 'string');
  return { config, days, spans, adjustments, holidays, unparsed };
}

export function cloneState(s) {
  return JSON.parse(JSON.stringify(s));
}

// ---------------------------------------------------------------------------
// Actions. Each takes (state, …) and returns a new normalised state.

export function updateConfig(state, patch) {
  const next = cloneState(state);
  Object.assign(next.config, patch);
  return normalizeState(next);
}

/** Merge a patch into the record for a date, creating it from the resolved (virtual) day if needed. */
export function setDay(state, iso, patch, now = new Date()) {
  const next = cloneState(state);
  let base = next.days[iso];
  if (!base) {
    const resolved = resolveDay(state, iso, makeCtx(state, now));
    base = blankRecord(iso, resolved.type);
    if (resolved.source !== 'none') {
      base.creditedHours = resolved.creditedHours;
      base.notes = resolved.notes;
    }
  }
  const rec = { ...base, ...patch, date: iso };
  if (patch.type && patch.type !== base.type && !CREDITED_TYPES.includes(patch.type)) rec.creditedHours = null;
  // Typing a clock time into a Holiday / Sick / Public holiday / Off day turns it into a work day.
  const timeKeys = ['in', 'lunchOut', 'lunchBack', 'home'];
  if (!patch.type && timeKeys.some((k) => patch[k]) && rec.type !== 'Work' && rec.type !== 'TDY') {
    rec.type = 'Work';
    rec.creditedHours = null;
  }
  next.days[iso] = rec;
  return normalizeState(next);
}

export function deleteDay(state, iso) {
  const next = cloneState(state);
  delete next.days[iso];
  return normalizeState(next);
}

function timeBasedType(state, iso, now) {
  const resolved = resolveDay(state, iso, makeCtx(state, now));
  return resolved.type === 'TDY' ? 'TDY' : 'Work';
}

export function clockIn(state, iso, hhmm, now = new Date()) {
  const rec = state.days[iso];
  const type = rec && (rec.type === 'Work' || rec.type === 'TDY') ? rec.type : timeBasedType(state, iso, now);
  return setDay(state, iso, { type, in: hhmm }, now);
}

export function clockLunchOut(state, iso, hhmm, now = new Date()) {
  return setDay(state, iso, { lunchOut: hhmm, lunchBack: '' }, now);
}

export function clockLunchBack(state, iso, hhmm, now = new Date()) {
  return setDay(state, iso, { lunchBack: hhmm }, now);
}

export function clockHome(state, iso, hhmm, now = new Date()) {
  const rec = state.days[iso] || {};
  const patch = { home: hhmm };
  if (rec.lunchOut && !rec.lunchBack) patch.lunchBack = hhmm; // Home during lunch closes the lunch
  return setDay(state, iso, patch, now);
}

export function addSpan(state, span) {
  const next = cloneState(state);
  next.spans.push(span);
  return normalizeState(next);
}

export function updateSpan(state, index, patch) {
  const next = cloneState(state);
  if (!next.spans[index]) return state;
  Object.assign(next.spans[index], patch);
  return normalizeState(next);
}

export function deleteSpan(state, index) {
  const next = cloneState(state);
  next.spans.splice(index, 1);
  return normalizeState(next);
}

/** Open a span of `type` starting at start (TDY: with a time). Closes any already-open span of that type first. */
export function startSpan(state, type, start, startTime = '', notes = '') {
  let next = cloneState(state);
  const open = openSpan(next.spans, type);
  if (open) open.end = addDays(start, -1) >= open.start ? addDays(start, -1) : open.start;
  next.spans.push({ type, start, startTime, end: '', endTime: '', hoursPerDay: null, notes });
  return normalizeState(next);
}

export function endSpan(state, type, end, endTime = '') {
  const next = cloneState(state);
  const open = openSpan(next.spans, type);
  if (!open) return state;
  open.end = end;
  open.endTime = endTime;
  return normalizeState(next);
}

/** Mark a single day as a credited type (Sick / PublicHoliday / Holiday / TDY) or Off. */
export function markDay(state, iso, type, notes, now = new Date()) {
  const patch = { type, in: '', lunchOut: '', lunchBack: '', home: '', creditedHours: null };
  if (notes != null) patch.notes = notes;
  return setDay(state, iso, patch, now);
}

/** Mark a date range: a single day becomes a record, several days become a span. */
export function markRange(state, type, start, end, notes = '', now = new Date()) {
  if (!end || end === start) return markDay(state, start, type, notes, now);
  const s = start <= end ? start : end;
  const e = start <= end ? end : start;
  return addSpan(state, { type, start: s, end: e, startTime: '', endTime: '', hoursPerDay: null, notes });
}

export function addAdjustment(state, adj) {
  const next = cloneState(state);
  next.adjustments.push(adj);
  return normalizeState(next);
}

export function updateAdjustment(state, index, patch) {
  const next = cloneState(state);
  if (!next.adjustments[index]) return state;
  Object.assign(next.adjustments[index], patch);
  return normalizeState(next);
}

export function deleteAdjustment(state, index) {
  const next = cloneState(state);
  next.adjustments.splice(index, 1);
  return normalizeState(next);
}

// Public holidays ------------------------------------------------------------

export function addHoliday(state, holiday) {
  const next = cloneState(state);
  next.holidays.push(holiday);
  return normalizeState(next);
}

export function updateHoliday(state, index, patch) {
  const next = cloneState(state);
  if (!next.holidays[index]) return state;
  Object.assign(next.holidays[index], patch);
  return normalizeState(next);
}

export function deleteHoliday(state, index) {
  const next = cloneState(state);
  next.holidays.splice(index, 1);
  return normalizeState(next);
}

/** Add every entry of `list` whose date is not already listed. Existing entries (moved or renamed) are left alone. */
export function loadHolidays(state, list) {
  const next = cloneState(state);
  const have = new Set(next.holidays.map((hd) => hd.date));
  for (const hd of list) if (!have.has(hd.date)) { next.holidays.push({ date: hd.date, name: hd.name }); have.add(hd.date); }
  return normalizeState(next);
}

export function clearHolidays(state) {
  const next = cloneState(state);
  next.holidays = [];
  return normalizeState(next);
}

export function clearUnparsed(state) {
  const next = cloneState(state);
  next.unparsed = [];
  return normalizeState(next);
}

/** Merge another state's data into this one (import): other's records win on the same date. */
export function mergeStates(base, other) {
  const next = cloneState(base);
  for (const [iso, rec] of Object.entries(other.days)) next.days[iso] = rec;
  const key = (s) => `${s.type}|${s.start}|${s.end}`;
  const have = new Set(next.spans.map(key));
  for (const s of other.spans) if (!have.has(key(s))) next.spans.push(s);
  const akey = (a) => `${a.date}|${a.minutes}|${a.reason}`;
  const haveA = new Set(next.adjustments.map(akey));
  for (const a of other.adjustments) if (!haveA.has(akey(a))) next.adjustments.push(a);
  const haveH = new Set(next.holidays.map((hd) => hd.date));
  for (const hd of other.holidays || []) if (!haveH.has(hd.date)) next.holidays.push(hd);
  next.unparsed = [...next.unparsed, ...other.unparsed.filter((l) => !next.unparsed.includes(l))];
  return normalizeState(next);
}

export { todayISO };
