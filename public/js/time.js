// time.js — pure date/time helpers.
// Dates are ISO strings 'YYYY-MM-DD' and are treated as plain calendar dates.
// All date arithmetic is done in UTC so that daylight-saving changes in the
// device's zone can never add or drop a day. Clock times are 'HH:MM' local
// wall-clock strings and are handled as minutes since midnight.

export const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_NAMES_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad2 = (n) => String(n).padStart(2, '0');

/** True when s is a real calendar date in ISO form. */
export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

/** ISO date → Date at UTC midnight. */
export function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date (any time of day, UTC fields) → ISO date. */
export function fromUTC(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Local calendar date of a Date instance (the device's zone). */
export function localISO(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function todayISO(now = new Date()) {
  return localISO(now);
}

/** Minutes since local midnight of a Date instance. */
export function nowMinutes(now = new Date()) {
  return now.getHours() * 60 + now.getMinutes();
}

export function nowHHMM(now = new Date()) {
  return fmtHHMM(nowMinutes(now));
}

export function addDays(iso, n) {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUTC(d);
}

/** Whole days from a to b (b − a). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(iso) {
  return (toUTC(iso).getUTCDay() + 6) % 7;
}

export function dayName(iso) {
  return DAY_NAMES[weekdayIndex(iso)];
}

export function compareISO(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(a, b) {
  return a <= b ? a : b;
}

export function maxISO(a, b) {
  return a >= b ? a : b;
}

/** Inclusive list of ISO dates. */
export function dateRange(start, end) {
  const out = [];
  if (start > end) return out;
  let d = start;
  const n = diffDays(start, end);
  for (let i = 0; i <= n; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** 'HH:MM' | 'H:MM' | 'HHMM' → minutes since midnight, or null. */
export function parseHHMM(s) {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  let m = t.match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) m = t.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function isHHMM(s) {
  return parseHHMM(s) !== null;
}

/** Minutes since midnight → 'HH:MM' (wraps at 24 h). */
export function fmtHHMM(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  let m = Math.round(minutes) % 1440;
  if (m < 0) m += 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Normalise a user-entered clock time to canonical 'HH:MM' (or '' if invalid/empty). */
export function normHHMM(s) {
  const m = parseHHMM(s);
  return m === null ? '' : fmtHHMM(m);
}

/**
 * Duration text → signed minutes, or null.
 * Accepts '7:36', '+0:02', '-1:30', '−1:30', '7.6', '7.6h', '0', '456m'.
 */
export function parseDuration(s) {
  if (s == null) return null;
  let t = String(s).trim().replace(/−/g, '-').replace(/\s+/g, '');
  if (!t) return null;
  let sign = 1;
  if (t.startsWith('+')) t = t.slice(1);
  else if (t.startsWith('-')) { sign = -1; t = t.slice(1); }
  let m = t.match(/^(\d{1,3}):(\d{2})$/);
  if (m) return sign * (Number(m[1]) * 60 + Number(m[2]));
  m = t.match(/^(\d+)m$/i);
  if (m) return sign * Number(m[1]);
  m = t.match(/^(\d+(?:\.\d+)?)h?$/i);
  if (m) return sign * Math.round(Number(m[1]) * 60);
  return null;
}

/**
 * Signed minutes → text.
 * mode 'hmm' → '7:36'; mode 'decimal' → '7.60'.
 * sign: 'always' prefixes + for positives and shows 0:00 unsigned; 'never' omits + (negatives still show −).
 */
export function fmtDuration(minutes, mode = 'hmm', sign = 'never') {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const m = Math.round(minutes);
  const neg = m < 0;
  const abs = Math.abs(m);
  let body;
  if (mode === 'decimal') {
    body = (abs / 60).toFixed(2);
  } else {
    body = `${Math.floor(abs / 60)}:${pad2(abs % 60)}`;
  }
  if (neg) return `-${body}`;
  if (sign === 'always' && m > 0) return `+${body}`;
  return body;
}

/** Signed delta for display: '+0:02', '-1:30', '0:00'. */
export function fmtDelta(minutes, mode = 'hmm') {
  return fmtDuration(minutes, mode, 'always');
}

/** Decimal hours (7.6) → minutes (456), rounded to the nearest minute. */
export function hoursToMinutes(h) {
  return Math.round(Number(h) * 60);
}

/** Minutes → decimal-hours text with up to 4 dp, trailing zeros trimmed ('7.6'). */
export function minutesToHoursText(m) {
  const h = m / 60;
  let s = h.toFixed(4).replace(/\.?0+$/, '');
  if (s === '' || s === '-') s = '0';
  return s;
}

/** Round minutes-since-midnight (or a duration) to the nearest step; step 0 = off. */
export function roundMinutes(m, step) {
  if (!step || step <= 0 || m == null) return m;
  return Math.round(m / step) * step;
}

/** 'Thu 27/08/2026' — Australian display format. */
export function fmtDateAU(iso, opts = {}) {
  if (!isISODate(iso)) return iso || '';
  const [y, m, d] = iso.split('-');
  const core = `${d}/${m}/${y}`;
  if (opts.weekday === false) return core;
  return `${dayName(iso)} ${core}`;
}

/** '27/08' */
export function fmtDateShortAU(iso) {
  if (!isISODate(iso)) return iso || '';
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** 'Thu 27 Aug 2026' */
export function fmtDateLong(iso) {
  if (!isISODate(iso)) return iso || '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${dayName(iso)} ${d} ${MONTHS_SHORT[m - 1]} ${y}`;
}

/** '27 Aug' */
export function fmtDayMonth(iso) {
  if (!isISODate(iso)) return iso || '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** ISO 8601 local timestamp with offset, e.g. 2026-09-05T14:22:10+10:00 */
export function isoTimestamp(now = new Date()) {
  const off = -now.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const a = Math.abs(off);
  return (
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}` +
    `T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}` +
    `${sign}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`
  );
}

/** Parse an ISO timestamp to epoch ms, or NaN. */
export function parseTimestamp(s) {
  if (!s) return NaN;
  const t = Date.parse(String(s).trim());
  return Number.isNaN(t) ? NaN : t;
}

export function fmtClock(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
