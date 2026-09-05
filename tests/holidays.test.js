import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, holidayMap, holidayList } from '../public/js/holidays.js';
import { isISODate, dayName } from '../public/js/time.js';

test('every bundled holiday is a valid date and Monday-substitutes fall on Mondays', () => {
  for (const r of REGIONS) {
    for (const [iso, name] of holidayList(r.code)) {
      assert.ok(isISODate(iso), `${r.code} ${iso}`);
      assert.ok(name.length > 0);
      if (/\(substitute\)/.test(name) && !/Boxing|Christmas/.test(name)) assert.equal(dayName(iso), 'Mon', `${r.code} ${iso} ${name}`);
    }
  }
});

test('national days appear in every region; none is empty', () => {
  assert.equal(holidayMap('none').size, 0);
  for (const r of REGIONS.filter((x) => x.code !== 'none')) {
    const m = holidayMap(r.code);
    assert.equal(m.get('2026-04-03'), 'Good Friday');
    assert.equal(m.get('2026-12-28'), 'Boxing Day (substitute)');
    assert.equal(m.get('2027-12-27'), 'Christmas Day (substitute)');
    assert.equal(m.get('2027-01-26'), 'Australia Day');
  }
  assert.equal(holidayMap('ACT').get('2026-06-01'), 'Reconciliation Day');
  assert.equal(holidayMap('WA').get('2026-04-27'), 'Anzac Day (substitute)');
  assert.equal(holidayMap('NSW').get('2026-04-27'), undefined);
  assert.equal(holidayMap('QLD').get('2026-10-05'), "King's Birthday");
  assert.equal(holidayMap('VIC').get('2026-11-03'), 'Melbourne Cup Day');
  assert.equal(holidayMap('bogus').size, 0);
});
