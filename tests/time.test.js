import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHHMM, fmtHHMM, parseDuration, fmtDuration, fmtDelta, addDays, diffDays, weekdayIndex, dayName,
  isISODate, fmtDateAU, roundMinutes, minutesToHoursText, hoursToMinutes, dateRange, localISO, isoTimestamp,
} from '../public/js/time.js';

test('parseHHMM accepts common spellings and rejects junk', () => {
  assert.equal(parseHHMM('08:32'), 512);
  assert.equal(parseHHMM('8:32'), 512);
  assert.equal(parseHHMM('0832'), 512);
  assert.equal(parseHHMM(' 16:45 '), 1005);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(parseHHMM('8:3x'), null);
  assert.equal(parseHHMM(''), null);
  assert.equal(fmtHHMM(512), '08:32');
  assert.equal(fmtHHMM(1440 + 5), '00:05');
});

test('durations parse in h:mm, decimal and signed forms', () => {
  assert.equal(parseDuration('7:36'), 456);
  assert.equal(parseDuration('+0:02'), 2);
  assert.equal(parseDuration('-1:30'), -90);
  assert.equal(parseDuration('−1:30'), -90);
  assert.equal(parseDuration('7.6'), 456);
  assert.equal(parseDuration('7.6h'), 456);
  assert.equal(parseDuration('0:00'), 0);
  assert.equal(parseDuration('abc'), null);
  assert.equal(fmtDuration(456), '7:36');
  assert.equal(fmtDuration(456, 'decimal'), '7.60');
  assert.equal(fmtDuration(-90), '-1:30');
  assert.equal(fmtDelta(2), '+0:02');
  assert.equal(fmtDelta(0), '0:00');
  assert.equal(fmtDelta(-456), '-7:36');
  assert.equal(minutesToHoursText(456), '7.6');
  assert.equal(minutesToHoursText(450), '7.5');
  assert.equal(minutesToHoursText(455), '7.5833');
  assert.equal(hoursToMinutes('7.5833'), 455);
});

test('date arithmetic is calendar based', () => {
  assert.equal(addDays('2026-08-31', 1), '2026-09-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(diffDays('2026-08-27', '2026-09-10'), 14);
  assert.equal(weekdayIndex('2026-08-27'), 3); // Thursday
  assert.equal(dayName('2026-08-27'), 'Thu');
  assert.equal(dayName('2026-09-05'), 'Sat');
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
  assert.ok(!isISODate('26-02-01'));
  assert.equal(fmtDateAU('2026-08-27'), 'Thu 27/08/2026');
  assert.equal(dateRange('2026-09-01', '2026-09-03').length, 3);
  assert.equal(dateRange('2026-09-03', '2026-09-01').length, 0);
});

test('rounding to nearest step', () => {
  assert.equal(roundMinutes(487, 15), 480);
  assert.equal(roundMinutes(998, 15), 1005);
  assert.equal(roundMinutes(484, 6), 486);
  assert.equal(roundMinutes(512, 5), 510);
  assert.equal(roundMinutes(512, 0), 512);
});

test('local ISO date and timestamp follow the device zone (Australia/Sydney, across DST)', () => {
  const prev = process.env.TZ;
  process.env.TZ = 'Australia/Sydney';
  try {
    // 00:30 on 5 Oct 2026 in Sydney (AEDT, UTC+11) is still 4 Oct in UTC.
    assert.equal(localISO(new Date('2026-10-05T00:30:00+11:00')), '2026-10-05');
    // DST starts 2026-10-04 at 02:00 AEST → 03:00 AEDT.
    assert.equal(localISO(new Date('2026-10-04T03:30:00+11:00')), '2026-10-04');
    const ts = isoTimestamp(new Date('2026-09-05T14:22:10+10:00'));
    assert.equal(ts, '2026-09-05T14:22:10+10:00');
    const tsDst = isoTimestamp(new Date('2026-10-10T09:00:00+11:00'));
    assert.equal(tsDst, '2026-10-10T09:00:00+11:00');
  } finally {
    if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev;
  }
});
