import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, periodFor, periodIndex, periodRange, recentWeeks } from '../public/js/calc.js';
import { addDays, dateRange } from '../public/js/time.js';

const cfg = (patch = {}) => normalizeConfig(patch);

test('default anchor 2026-08-27 / 14 days', () => {
  const c = cfg();
  assert.deepEqual(periodFor(c, '2026-08-27'), { index: 0, start: '2026-08-27', end: '2026-09-09' });
  assert.deepEqual(periodFor(c, '2026-09-09'), { index: 0, start: '2026-08-27', end: '2026-09-09' });
  assert.deepEqual(periodFor(c, '2026-09-10'), { index: 1, start: '2026-09-10', end: '2026-09-23' });
  assert.deepEqual(periodFor(c, '2026-08-26'), { index: -1, start: '2026-08-13', end: '2026-08-26' });
  assert.equal(periodIndex(c, '2026-01-01'), -17);
  assert.equal(periodRange(c, -17).start, '2026-01-01');
});

test('arbitrary anchors and lengths, year and month boundaries', () => {
  const weekly = cfg({ payPeriodAnchor: '2026-01-05', payPeriodDays: 7 });
  assert.deepEqual(periodFor(weekly, '2026-01-04'), { index: -1, start: '2025-12-29', end: '2026-01-04' });
  assert.deepEqual(periodFor(weekly, '2026-01-11'), { index: 0, start: '2026-01-05', end: '2026-01-11' });
  const feb = cfg({ payPeriodAnchor: '2026-02-19', payPeriodDays: 14 });
  assert.deepEqual(periodFor(feb, '2026-03-04'), { index: 0, start: '2026-02-19', end: '2026-03-04' });
  assert.deepEqual(periodFor(feb, '2026-03-05'), { index: 1, start: '2026-03-05', end: '2026-03-18' });
  const leap = cfg({ payPeriodAnchor: '2028-02-24', payPeriodDays: 14 });
  assert.equal(periodFor(leap, '2028-03-08').end, '2028-03-08');
  assert.equal(periodFor(leap, '2028-03-09').start, '2028-03-09');
  const monthly = cfg({ payPeriodAnchor: '2026-01-01', payPeriodDays: 28 });
  assert.equal(periodFor(monthly, '2026-12-31').index, 13);
  const single = cfg({ payPeriodAnchor: '2026-06-30', payPeriodDays: 1 });
  assert.deepEqual(periodFor(single, '2026-07-01'), { index: 1, start: '2026-07-01', end: '2026-07-01' });
});

test('periods tile the calendar with no gaps or overlaps (including DST changes)', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'Australia/Sydney';
  try {
    for (const c of [cfg(), cfg({ payPeriodAnchor: '2026-10-01', payPeriodDays: 14 }), cfg({ payPeriodAnchor: '2027-03-31', payPeriodDays: 10 })]) {
      for (let k = -40; k <= 40; k++) {
        const p = periodRange(c, k);
        const q = periodRange(c, k + 1);
        assert.equal(addDays(p.end, 1), q.start);
        for (const d of dateRange(p.start, p.end)) assert.equal(periodIndex(c, d), k, `${d} in period ${k}`);
      }
    }
    // The period containing the 2026 DST start (Sun 4 Oct) still has 14 days.
    const p = periodFor(cfg(), '2026-10-04');
    assert.deepEqual(p, { index: 2, start: '2026-09-24', end: '2026-10-07' });
    assert.equal(dateRange(p.start, p.end).length, 14);
    const q = periodFor(cfg(), '2027-04-04');
    assert.equal(dateRange(q.start, q.end).length, 14);
  } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});

test('recent weeks end with the current week', () => {
  const weeks = recentWeeks(cfg(), '2026-09-05', 4);
  assert.equal(weeks.length, 4);
  assert.deepEqual(weeks[0], { start: '2026-08-31', end: '2026-09-06' });
  assert.deepEqual(weeks[3], { start: '2026-08-10', end: '2026-08-16' });
});
