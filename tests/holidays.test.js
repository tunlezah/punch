import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, holidayMap, holidayList, regionHolidays, HOLIDAY_YEARS } from '../public/js/holidays.js';
import { isISODate, dayName } from '../public/js/time.js';

test('every bundled holiday is a valid 2026/2027 date; additional days fall on weekdays', () => {
  for (const r of REGIONS) {
    for (const [iso, name] of holidayList(r.code)) {
      assert.ok(isISODate(iso), `${r.code} ${iso}`);
      assert.ok(HOLIDAY_YEARS.includes(Number(iso.slice(0, 4))), `${r.code} ${iso} year`);
      assert.ok(name.length > 0);
      if (/\(additional day\)/.test(name)) assert.ok(['Mon', 'Tue'].includes(dayName(iso)), `${r.code} ${iso} ${name}`);
    }
  }
});

test('national days appear in every jurisdiction; none is empty', () => {
  assert.equal(holidayMap('none').size, 0);
  assert.equal(holidayMap('bogus').size, 0);
  for (const r of REGIONS.filter((x) => x.code !== 'none')) {
    const m = holidayMap(r.code);
    assert.equal(m.get('2026-01-01'), "New Year's Day", r.code);
    assert.equal(m.get('2026-04-03'), 'Good Friday', r.code);
    assert.equal(m.get('2026-04-06'), 'Easter Monday', r.code);
    assert.equal(m.get('2026-12-25'), 'Christmas Day', r.code);
    assert.ok(m.has('2026-12-28'), `${r.code} has a Monday holiday after Boxing Day 2026`);
    assert.equal(m.get('2027-01-26'), 'Australia Day', r.code);
    assert.equal(m.get('2027-12-27'), 'Christmas Day (additional day)', r.code);
    assert.ok(m.has('2027-12-28'), `${r.code} has a Tuesday holiday after Boxing Day 2027`);
    assert.ok(regionHolidays(r.code).length >= 19, `${r.code} list size`);
  }
});

test('jurisdiction-specific dates match the Fair Work 2026 and 2027 lists', () => {
  // Anzac Day on a weekend: ACT, NSW and WA add a Monday; QLD and NT move it in 2027; SA, TAS and VIC do not add a day.
  assert.equal(holidayMap('ACT').get('2026-04-27'), 'Anzac Day (additional day)');
  assert.equal(holidayMap('NSW').get('2026-04-27'), 'Anzac Day (additional day)');
  assert.equal(holidayMap('WA').get('2026-04-27'), 'Anzac Day (additional day)');
  assert.equal(holidayMap('ACT').get('2027-04-26'), 'Anzac Day (additional day)');
  assert.equal(holidayMap('NSW').get('2027-04-26'), 'Anzac Day (additional day)');
  assert.equal(holidayMap('WA').get('2027-04-26'), 'Anzac Day (additional day)');
  assert.equal(holidayMap('QLD').get('2027-04-26'), 'Anzac Day');
  assert.equal(holidayMap('NT').get('2027-04-26'), 'Anzac Day');
  assert.equal(holidayMap('QLD').get('2027-04-25'), undefined);
  for (const r of ['SA', 'TAS', 'VIC', 'QLD', 'NT']) assert.equal(holidayMap(r).get('2026-04-27'), undefined, r);
  for (const r of ['SA', 'TAS', 'VIC']) assert.equal(holidayMap(r).get('2027-04-26'), undefined, r);
  // State days
  assert.equal(holidayMap('ACT').get('2026-03-09'), 'Canberra Day');
  assert.equal(holidayMap('ACT').get('2026-06-01'), 'Reconciliation Day');
  assert.equal(holidayMap('ACT').get('2027-05-31'), 'Reconciliation Day');
  assert.equal(holidayMap('NT').get('2026-08-03'), 'Picnic Day');
  assert.equal(holidayMap('QLD').get('2026-05-04'), 'Labour Day');
  assert.equal(holidayMap('QLD').get('2026-10-05'), "King's Birthday");
  assert.equal(holidayMap('SA').get('2026-03-09'), 'Adelaide Cup Day');
  assert.equal(holidayMap('SA').get('2026-12-26'), 'Proclamation Day holiday');
  assert.equal(holidayMap('TAS').get('2026-03-09'), 'Eight Hours Day');
  assert.equal(holidayMap('TAS').get('2026-12-26'), undefined);
  assert.equal(holidayMap('TAS').get('2026-12-28'), 'Boxing Day');
  assert.equal(holidayMap('TAS').get('2026-04-04'), undefined);
  assert.equal(holidayMap('VIC').get('2026-09-25'), 'Friday before the AFL Grand Final');
  assert.equal(holidayMap('VIC').get('2027-09-24'), undefined, 'date TBC per Fair Work');
  assert.equal(holidayMap('VIC').get('2026-11-03'), 'Melbourne Cup');
  assert.equal(holidayMap('WA').get('2026-03-02'), 'Labour Day');
  assert.equal(holidayMap('WA').get('2026-06-01'), 'Western Australia Day');
  assert.equal(holidayMap('WA').get('2026-09-28'), "King's Birthday");
  assert.equal(holidayMap('WA').get('2027-09-27'), "King's Birthday");
  assert.equal(holidayMap('WA').get('2026-04-04'), undefined, 'WA has no Easter Saturday');
  // Excluded on purpose: part-day and area-restricted holidays.
  assert.equal(holidayMap('QLD').get('2026-08-12'), undefined);
  assert.equal(holidayMap('NT').get('2026-12-24'), undefined);
  assert.equal(holidayMap('TAS').get('2026-04-07'), undefined);
});
