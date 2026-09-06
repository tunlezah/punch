import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, spanDays, derive, resolveDay, makeCtx } from '../public/js/calc.js';
import { normalizeState, startSpan, endSpan, markRange, setDay, loadHolidays, updateHoliday, deleteHoliday } from '../public/js/model.js';
import { regionHolidays } from '../public/js/holidays.js';

const NOW = new Date('2026-09-05T10:00:00');
const cfg = (patch = {}) => normalizeConfig(patch);

test('span expansion honours the working-day set', () => {
  const span = { type: 'Holiday', start: '2026-10-05', end: '2026-10-16', hoursPerDay: null, notes: '' };
  assert.equal(spanDays(cfg(), span).length, 10);
  const tueSat = cfg({ workDays: ['Tue', 'Wed', 'Thu', 'Fri', 'Sat'] });
  const days = spanDays(tueSat, span);
  assert.equal(days.length, 9); // Tue 6 … Sat 10, Tue 13 … Fri 16
  assert.ok(!days.includes('2026-10-05')); // Monday not a working day
  assert.ok(days.includes('2026-10-10')); // Saturday is
  assert.deepEqual(spanDays(cfg(), { ...span, end: '2026-10-04' }), []); // inverted range
});

test('span days are credited only on working days; weekend inside a span gets nothing', () => {
  const s = normalizeState({ spans: [{ type: 'Holiday', start: '2026-08-17', end: '2026-08-23', notes: 'Coast' }] });
  const d = derive(s, NOW);
  const mon = d.get('2026-08-17');
  assert.equal(mon.day.source, 'span');
  assert.equal(mon.day.type, 'Holiday');
  assert.equal(mon.calc.worked, 456);
  assert.equal(mon.calc.delta, 0);
  const sat = d.get('2026-08-22');
  assert.equal(sat.calc.std, 0);
  assert.equal(sat.calc.worked, 0);
  const sum = d.summarize('2026-08-17', '2026-08-23');
  assert.equal(sum.worked, 5 * 456);
  assert.equal(sum.std, 5 * 456);
});

test('span hours per day, explicit overrides and explicit Work inside a span', () => {
  let s = normalizeState({
    config: cfg(),
    spans: [{ type: 'TDY', start: '2026-08-25', startTime: '06:10', end: '2026-08-27', endTime: '19:40', hoursPerDay: 600, notes: 'Canberra' }],
  });
  let d = derive(s, NOW);
  assert.equal(d.get('2026-08-26').calc.worked, 600);
  assert.ok(d.get('2026-08-26').calc.tdyVariance);
  s = setDay(s, '2026-08-26', { creditedHours: 456 }, NOW);
  d = derive(s, NOW);
  assert.equal(d.get('2026-08-26').calc.worked, 456);
  assert.equal(d.get('2026-08-26').day.source, 'record');
  s = setDay(s, '2026-08-27', { type: 'Work', in: '08:00', home: '16:06' }, NOW);
  d = derive(s, NOW);
  assert.equal(d.get('2026-08-27').day.type, 'Work');
  assert.equal(d.get('2026-08-27').calc.worked, 456);
});

test('open spans run to today and can be closed', () => {
  let s = normalizeState({ config: cfg() });
  s = startSpan(s, 'Holiday', '2026-09-01');
  assert.equal(s.spans.length, 1);
  assert.equal(s.spans[0].end, '');
  let d = derive(s, NOW);
  assert.equal(d.get('2026-09-04').day.type, 'Holiday');
  assert.equal(d.get('2026-09-07').day.type, 'Holiday'); // future days show the open span too
  assert.ok(!d.get('2026-09-07').calc.counted);
  assert.equal(d.summarize('2026-09-01', '2026-09-05').worked, 4 * 456);
  s = endSpan(s, 'Holiday', '2026-09-03');
  d = derive(s, NOW);
  assert.equal(d.get('2026-09-04').day.type, 'Work');
  assert.equal(d.get('2026-09-04').day.source, 'none');
  assert.equal(d.summarize('2026-09-01', '2026-09-05').worked, 3 * 456);
});

test('TDY spans keep their start and end times; a second Start closes the first', () => {
  let s = normalizeState({});
  s = startSpan(s, 'TDY', '2026-09-01', '06:10', 'Melbourne');
  s = startSpan(s, 'TDY', '2026-09-03', '07:00', 'Sydney');
  assert.equal(s.spans.length, 2);
  assert.equal(s.spans[0].end, '2026-09-02');
  assert.equal(s.spans[1].startTime, '07:00');
  s = endSpan(s, 'TDY', '2026-09-04', '19:40');
  assert.equal(s.spans[1].end, '2026-09-04');
  assert.equal(s.spans[1].endTime, '19:40');
});

test('markRange makes a single record or a span', () => {
  let s = normalizeState({});
  s = markRange(s, 'Sick', '2026-09-03', '2026-09-03', 'flu', NOW);
  assert.equal(Object.keys(s.days).length, 1);
  assert.equal(s.spans.length, 0);
  s = markRange(s, 'Sick', '2026-09-08', '2026-09-10', 'flu', NOW);
  assert.equal(s.spans.length, 1);
  assert.equal(s.spans[0].type, 'Sick');
});

test('listed public holidays are virtual days that explicit records override, and the list is editable', () => {
  let s = normalizeState({ config: cfg({ holidayRegion: 'ACT' }) });
  const now = new Date('2026-10-10T10:00:00');
  // Nothing is pre-marked until the list is loaded.
  assert.equal(resolveDay(s, '2026-10-05', makeCtx(s, now)).source, 'none');
  s = loadHolidays(s, regionHolidays('ACT'));
  assert.equal(s.holidays.length, regionHolidays('ACT').length);
  assert.equal(loadHolidays(s, regionHolidays('ACT')).holidays.length, s.holidays.length, 'loading twice adds nothing');
  let d = derive(s, now);
  const labour = d.get('2026-10-05');
  assert.equal(labour.day.type, 'PublicHoliday');
  assert.equal(labour.day.source, 'holiday');
  assert.equal(labour.day.notes, 'Labour Day');
  assert.equal(labour.calc.worked, 456);
  // A public holiday beats a holiday span on the same date.
  s = normalizeState({ ...s, spans: [{ type: 'Holiday', start: '2026-10-05', end: '2026-10-09' }] });
  assert.equal(derive(s, now).get('2026-10-05').day.type, 'PublicHoliday');
  assert.equal(derive(s, now).get('2026-10-06').day.type, 'Holiday');
  // Worked that day? An explicit record wins.
  s = setDay(s, '2026-10-05', { type: 'Work', in: '09:00', home: '13:00' }, now);
  assert.equal(derive(s, now).get('2026-10-05').day.type, 'Work');
  // The list is not locked: move Labour Day to the Tuesday, rename, or remove.
  const idx = s.holidays.findIndex((hd) => hd.date === '2026-10-05');
  const moved = updateHoliday(s, idx, { date: '2026-10-06', name: 'Labour Day (observed Tuesday)' });
  assert.equal(derive(moved, now).get('2026-10-06').day.type, 'PublicHoliday');
  assert.equal(derive(moved, now).get('2026-10-06').day.notes, 'Labour Day (observed Tuesday)');
  const removed = deleteHoliday(s, idx);
  assert.equal(removed.holidays.length, s.holidays.length - 1);
  // Two entries for one date collapse to the last one.
  const dup = normalizeState({ holidays: [{ date: '2026-12-25', name: 'A' }, { date: '2026-12-25', name: 'B' }, { date: 'bad' }] });
  assert.deepEqual(dup.holidays, [{ date: '2026-12-25', name: 'B' }]);
});
