import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeDay, makeCtx, resolveDay, derive, normalizeConfig, weekStartIndex, weekStart } from '../public/js/calc.js';
import { emptyState, normalizeState, clockIn, clockLunchOut, clockLunchBack, clockHome, setDay, markDay } from '../public/js/model.js';

const NOW = new Date('2026-09-05T10:00:00');
const cfg = (patch = {}) => normalizeConfig(patch);

function dayCalc(rec, config = cfg(), now = NOW) {
  const state = normalizeState({ config, days: [rec] });
  const ctx = makeCtx(state, now);
  return computeDay(state.config, resolveDay(state, rec.date, ctx), ctx);
}

test('worked hours with a lunch pair', () => {
  const c = dayCalc({ date: '2026-09-03', type: 'Work', in: '08:32', lunchOut: '12:30', lunchBack: '13:05', home: '16:45' });
  assert.equal(c.worked, 458); // 7:38
  assert.equal(c.std, 456);
  assert.equal(c.delta, 2);
  assert.ok(c.complete);
  assert.equal(c.invalid, null);
});

test('default lunch is deducted when no lunch pair exists', () => {
  const c = dayCalc({ date: '2026-09-03', type: 'Work', in: '08:00', home: '16:30' });
  assert.equal(c.worked, 480); // 8:30 − 0:30
  assert.equal(c.delta, 24);
  const c0 = dayCalc({ date: '2026-09-03', type: 'Work', in: '08:00', home: '16:30' }, cfg({ defaultLunchMinutes: 0 }));
  assert.equal(c0.worked, 510);
  // A lone Lunch out without Lunch back also falls back to the default lunch.
  const c1 = dayCalc({ date: '2026-09-03', type: 'Work', in: '08:00', lunchOut: '12:00', home: '16:30' });
  assert.equal(c1.worked, 480);
});

test('rounding applies to each clock time, not the stored value', () => {
  const rec = { date: '2026-09-03', type: 'Work', in: '08:07', home: '16:38' };
  assert.equal(dayCalc(rec, cfg({ roundingMinutes: 15 })).worked, 8 * 60 + 15); // 08:00 → 16:45 − 0:30
  assert.equal(dayCalc({ date: '2026-09-03', type: 'Work', in: '08:04', home: '16:31' }, cfg({ roundingMinutes: 6 })).worked, 7 * 60 + 54); // 08:06 → 16:30
  assert.equal(dayCalc({ date: '2026-09-03', type: 'Work', in: '08:02', home: '16:33' }, cfg({ roundingMinutes: 5 })).worked, 8 * 60 + 5); // 08:00 → 16:35
  assert.equal(dayCalc(rec, cfg({ roundingMinutes: 0 })).worked, 8 * 60 + 1);
  // stored times are untouched
  const s = normalizeState({ config: cfg({ roundingMinutes: 15 }), days: [rec] });
  assert.equal(s.days['2026-09-03'].in, '08:07');
});

test('Home before In is flagged and counts as zero', () => {
  const c = dayCalc({ date: '2026-09-03', type: 'Work', in: '16:00', home: '08:00' });
  assert.equal(c.worked, 0);
  assert.match(c.invalid, /earlier/);
});

test('leave days credit the standard day, nothing on non-working days, overrides honoured', () => {
  assert.equal(dayCalc({ date: '2026-09-04', type: 'Sick' }).worked, 456);
  assert.equal(dayCalc({ date: '2026-09-04', type: 'Sick' }).delta, 0);
  const sat = dayCalc({ date: '2026-09-05', type: 'Holiday', notes: 'x' });
  assert.equal(sat.std, 0);
  assert.equal(sat.worked, 0);
  const half = dayCalc({ date: '2026-09-04', type: 'Holiday', creditedHours: 228 });
  assert.equal(half.worked, 228);
  assert.equal(half.delta, -228);
  const ph = dayCalc({ date: '2026-09-04', type: 'PublicHoliday' });
  assert.equal(ph.worked, 456);
});

test('Off days have no standard and no credit', () => {
  const c = dayCalc({ date: '2026-09-04', type: 'Off', notes: 'RDO' });
  assert.equal(c.std, 0);
  assert.equal(c.worked, 0);
  assert.equal(c.delta, 0);
});

test('Work on a non-working day is all variance', () => {
  const c = dayCalc({ date: '2026-09-05', type: 'Work', in: '09:00', home: '12:00' });
  assert.equal(c.std, 0);
  assert.equal(c.worked, 150);
  assert.equal(c.delta, 150);
});

test('TDY: actual times win over the credited default and variance is not counted automatically', () => {
  const credited = dayCalc({ date: '2026-09-03', type: 'TDY' });
  assert.equal(credited.worked, 456);
  assert.equal(credited.tdyVariance, false);
  const actual = dayCalc({ date: '2026-09-03', type: 'TDY', in: '06:10', home: '19:40' });
  assert.equal(actual.worked, 13 * 60); // 13:30 − 0:30
  assert.equal(actual.delta, 324);
  assert.ok(actual.tdyVariance);
  assert.ok(actual.counted);
  assert.equal(actual.countedDelta, 0);
  const longDay = dayCalc({ date: '2026-09-03', type: 'TDY', creditedHours: 600 });
  assert.equal(longDay.worked, 600);
  assert.ok(longDay.tdyVariance);
});

test('today ticks live and yesterday without Home is excluded', () => {
  const live = dayCalc({ date: '2026-09-05', type: 'Work', in: '08:00' }, cfg(), new Date('2026-09-05T11:30:00'));
  assert.ok(live.live);
  assert.ok(!live.complete);
  assert.equal(live.worked, 210);
  assert.equal(live.status, 'working');
  const atLunch = dayCalc({ date: '2026-09-05', type: 'Work', in: '08:00', lunchOut: '12:00' }, cfg(), new Date('2026-09-05T12:20:00'));
  assert.equal(atLunch.status, 'lunch');
  assert.equal(atLunch.worked, 240);
  const open = dayCalc({ date: '2026-09-04', type: 'Work', in: '08:00' });
  assert.equal(open.status, 'open');
  assert.ok(!open.complete);
  assert.equal(open.worked, null);
});

test('clock actions enforce the lunch pair and Home closes an open lunch', () => {
  let s = emptyState();
  s = clockIn(s, '2026-09-03', '08:32');
  s = clockLunchOut(s, '2026-09-03', '12:30');
  s = clockHome(s, '2026-09-03', '13:00');
  const rec = s.days['2026-09-03'];
  assert.equal(rec.lunchBack, '13:00');
  assert.equal(rec.home, '13:00');
  const c = derive(s, NOW).get('2026-09-03').calc;
  assert.equal(c.worked, 238); // 12:30 − 08:32
  s = clockLunchBack(s, '2026-09-03', '13:05');
  s = clockHome(s, '2026-09-03', '16:45');
  assert.equal(derive(s, NOW).get('2026-09-03').calc.worked, 458);
});

test('week start follows the working-day set', () => {
  assert.equal(weekStartIndex(cfg()), 0);
  assert.equal(weekStartIndex(cfg({ workDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] })), 6);
  assert.equal(weekStartIndex(cfg({ workDays: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'] })), 1);
  assert.equal(weekStartIndex(cfg({ workDays: ['Mon', 'Wed', 'Fri'] })), 0);
  assert.equal(weekStart(cfg(), '2026-09-05'), '2026-08-31');
  assert.equal(weekStart(cfg(), '2026-08-31'), '2026-08-31');
  assert.equal(weekStart(cfg({ workDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'] }), '2026-09-05'), '2026-08-30');
});

test('DST transition days compute from wall-clock times (Australia/Sydney)', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'Australia/Sydney';
  try {
    // 2026-10-04: clocks go forward 02:00 → 03:00. A Monday after the change is a normal day.
    const c = dayCalc({ date: '2026-10-05', type: 'Work', in: '08:00', home: '16:06' }, cfg(), new Date('2026-10-06T10:00:00+11:00'));
    assert.equal(c.worked, 456);
    // Sunday work across the skipped hour is measured on the wall clock: 01:30 → 04:30 = 3:00 (minus default lunch).
    const sun = dayCalc({ date: '2026-10-04', type: 'Work', in: '01:30', home: '04:30' }, cfg(), new Date('2026-10-06T10:00:00+11:00'));
    assert.equal(sun.worked, 150);
    // 2027-04-04: clocks go back. Same rule.
    const back = dayCalc({ date: '2027-04-04', type: 'Work', in: '01:30', home: '04:30' }, cfg(), new Date('2027-04-06T10:00:00+10:00'));
    assert.equal(back.worked, 150);
    // Live elapsed uses local wall-clock minutes.
    const live = dayCalc({ date: '2026-10-04', type: 'Work', in: '01:30' }, cfg(), new Date('2026-10-04T04:30:00+11:00'));
    assert.equal(live.worked, 180);
  } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});

test('setDay creates an override from a virtual span day and markDay converts a day', () => {
  let s = normalizeState({ spans: [{ type: 'Holiday', start: '2026-08-17', end: '2026-08-21', notes: 'Coast' }] });
  s = setDay(s, '2026-08-19', { creditedHours: 228 }, NOW);
  assert.equal(s.days['2026-08-19'].type, 'Holiday');
  assert.equal(s.days['2026-08-19'].notes, 'Coast');
  assert.equal(s.days['2026-08-19'].creditedHours, 228);
  s = markDay(s, '2026-08-19', 'Sick', 'flu', NOW);
  assert.equal(s.days['2026-08-19'].type, 'Sick');
  assert.equal(s.days['2026-08-19'].creditedHours, null);
});
