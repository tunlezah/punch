import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derive, pendingTdyDecisions, openDays, normalizeConfig } from '../public/js/calc.js';
import { normalizeState, addAdjustment, setDay } from '../public/js/model.js';

const NOW = new Date('2026-09-05T10:00:00');

const work = (date, i, h, extra = {}) => ({ date, type: 'Work', in: i, home: h, ...extra });

test('running balance is the cumulative Δ since the first record', () => {
  const s = normalizeState({
    days: [
      work('2026-08-31', '08:00', '16:06'), // 8:06 − 0:30 lunch = 7:36 → 0
      work('2026-09-01', '08:00', '17:06'), // 8:36 → +1:00
      work('2026-09-02', '08:00', '15:06'), // 6:36 → −1:00
      work('2026-09-03', '08:00', '16:16'), // 7:46 → +0:10
    ],
  });
  const d = derive(s, NOW);
  assert.equal(d.balance, 10);
  assert.equal(d.balanceThrough('2026-09-01'), 60);
  assert.equal(d.balanceThrough('2026-09-02'), 0);
  assert.equal(d.balanceThrough('2026-08-30'), 0);
});

test('balance start excludes earlier days; adjustments are added; future and live days are excluded', () => {
  let s = normalizeState({
    config: normalizeConfig({ balanceStart: '2026-09-01' }),
    days: [
      work('2026-08-31', '08:00', '18:36'), // +2:00 but before balance start
      work('2026-09-01', '08:00', '17:06'), // +1:00
      work('2026-09-05', '08:00'), // today, live
      work('2026-09-07', '08:00', '18:36'), // future, excluded
    ],
    adjustments: [{ date: '2026-09-02', minutes: 15, reason: 'Correction' }],
  });
  const d = derive(s, NOW);
  assert.equal(d.balance, 75);
  assert.equal(d.adjustmentsTotal, 15);
  s = addAdjustment(s, { date: '2026-09-03', minutes: -30, reason: 'Set by hand' });
  assert.equal(derive(s, NOW).balance, 45);
});

test('TDY variance waits for a decision, then enters TOIL through an adjustment', () => {
  let s = normalizeState({
    days: [{ date: '2026-08-25', type: 'TDY', in: '06:10', home: '19:40' }],
  });
  let d = derive(s, NOW);
  assert.equal(d.get('2026-08-25').calc.delta, 324);
  assert.equal(d.balance, 0);
  const pending = pendingTdyDecisions(s, d);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].date, '2026-08-25');
  assert.equal(pending[0].delta, 324);
  s = addAdjustment(s, { date: '2026-08-25', minutes: 324, reason: 'TDY variance accepted' });
  d = derive(s, NOW);
  assert.equal(pendingTdyDecisions(s, d).length, 0);
  assert.equal(d.balance, 324);
  // Declining records a zero adjustment so the question is not asked again.
  let s2 = normalizeState({ days: [{ date: '2026-08-25', type: 'TDY', in: '06:10', home: '19:40' }] });
  s2 = addAdjustment(s2, { date: '2026-08-25', minutes: 0, reason: 'TDY variance declined' });
  assert.equal(pendingTdyDecisions(s2, derive(s2, NOW)).length, 0);
  assert.equal(derive(s2, NOW).balance, 0);
});

test('period summaries: rows sum, balance to date is capped at today', () => {
  const s = normalizeState({
    days: [
      work('2026-08-27', '08:00', '16:06'),
      work('2026-08-28', '08:00', '17:06'), // +1:00
      { date: '2026-08-31', type: 'Sick' },
    ],
  });
  const d = derive(s, NOW);
  const p = d.summarize('2026-08-27', '2026-09-09');
  assert.equal(p.days, 3);
  assert.equal(p.worked, 3 * 456 + 60);
  assert.equal(p.std, 3 * 456);
  assert.equal(p.delta, 60);
  assert.equal(p.balanceToDate, 60);
  const prevPeriod = d.summarize('2026-08-13', '2026-08-26');
  assert.equal(prevPeriod.days, 0);
  assert.equal(prevPeriod.balanceToDate, 0);
});

test('open days are yesterday-or-earlier records with In but no Home', () => {
  const s = normalizeState({
    days: [work('2026-09-03', '08:00'), work('2026-09-04', '08:00', '16:00'), work('2026-09-05', '08:00')],
  });
  const open = openDays(s, '2026-09-05');
  assert.equal(open.length, 1);
  assert.equal(open[0].date, '2026-09-03');
  const fixed = setDay(s, '2026-09-03', { home: '16:06' }, NOW);
  assert.equal(openDays(fixed, '2026-09-05').length, 0);
});
