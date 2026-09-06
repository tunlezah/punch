// Generates sample/timesheet.md — about six weeks of realistic data.
// Run: node scripts/make-sample.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as model from '../public/js/model.js';
import { render } from '../public/js/markdown.js';
import { regionHolidays } from '../public/js/holidays.js';

const here = dirname(fileURLToPath(import.meta.url));
const NOW = new Date('2026-09-05T09:12:00+10:00');

let s = model.emptyState();
s = model.updateConfig(s, {
  lastSaved: '2026-09-05T09:12:00+10:00',
  balanceStart: '2026-07-27',
  holidayRegion: 'ACT',
  theme: 'system',
  accent: 'teal',
});

// The ACT public-holiday list, as loaded by choosing the jurisdiction in Settings.
s = model.loadHolidays(s, regionHolidays('ACT'));

const work = (date, tIn, lo, lb, home, notes = '') => {
  s = model.clockIn(s, date, tIn, NOW);
  if (lo) s = model.clockLunchOut(s, date, lo, NOW);
  if (lb) s = model.clockLunchBack(s, date, lb, NOW);
  s = model.clockHome(s, date, home, NOW);
  if (notes) s = model.setDay(s, date, { notes }, NOW);
};

// Week 1 — 27–31 Jul: a plain working week
work('2026-07-27', '08:31', '12:32', '13:04', '16:48');
work('2026-07-28', '08:12', '12:15', '12:50', '16:30', 'Early start for stand-up');
work('2026-07-29', '08:45', '12:40', '13:20', '17:15');
work('2026-07-30', '08:30', '', '', '16:36');
work('2026-07-31', '08:34', '12:00', '12:35', '15:50', 'Left early — dentist');

// Week 2 — 3–7 Aug
work('2026-08-03', '08:28', '12:30', '13:00', '16:40');
work('2026-08-04', '08:05', '12:20', '12:50', '18:10', 'Release night');
work('2026-08-05', '08:40', '12:35', '13:10', '16:50');
work('2026-08-06', '08:30', '12:30', '13:00', '15:30', 'Short day — flex');
work('2026-08-07', '08:36', '12:31', '13:03', '16:45');

// Week 3 — 10–14 Aug: local public holiday on the Wednesday
work('2026-08-10', '08:30', '12:30', '13:05', '16:42');
work('2026-08-11', '08:22', '12:28', '13:00', '16:35');
s = model.markDay(s, '2026-08-12', 'PublicHoliday', 'Ekka (Brisbane show day)', NOW);
work('2026-08-13', '08:35', '12:30', '13:00', '16:50');
work('2026-08-14', '08:30', '12:15', '12:45', '16:20');

// Week 4 — 17–21 Aug: a week of annual leave (span)
s = model.addSpan(s, { type: 'Holiday', start: '2026-08-17', end: '2026-08-21', startTime: '', endTime: '', hoursPerDay: null, notes: 'Coast trip' });

// Week 5 — 24–28 Aug: TDY straddling the pay-period boundary (26/27 Aug)
work('2026-08-24', '08:29', '12:30', '13:02', '16:38');
s = model.addSpan(s, { type: 'TDY', start: '2026-08-25', startTime: '06:10', end: '2026-08-27', endTime: '19:40', hoursPerDay: null, notes: 'Canberra — workshop' });
// The travel day had actual times recorded; its over-hours were accepted into TOIL.
s = model.setDay(s, '2026-08-25', { type: 'TDY', in: '06:10', home: '19:40', notes: 'Travel day' }, NOW);
s = model.addAdjustment(s, { date: '2026-08-25', minutes: 324, reason: 'TDY variance accepted (worked 13:00 vs 7:36)' });
work('2026-08-28', '09:05', '12:30', '13:00', '16:45', 'Late start after travel');

// Week 6 — 31 Aug – 4 Sep: sick on the Thursday
work('2026-08-31', '08:30', '12:30', '13:00', '16:40');
work('2026-09-01', '08:27', '12:33', '13:05', '16:52');
work('2026-09-02', '08:31', '12:30', '13:00', '17:20', 'Covering for Sam');
s = model.markDay(s, '2026-09-03', 'Sick', 'Head cold', NOW);
work('2026-09-04', '08:40', '12:30', '13:00', '16:30');

// Opening balance carried in from the previous system, and a planned holiday.
s = model.addAdjustment(s, { date: '2026-07-27', minutes: 135, reason: 'Opening balance carried over' });
s = model.addSpan(s, { type: 'Holiday', start: '2026-10-05', end: '2026-10-16', startTime: '', endTime: '', hoursPerDay: null, notes: 'Japan' });

const text = render(s, NOW);
const out = resolve(here, '../sample/timesheet.md');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.log(`wrote ${out} (${text.length} bytes, ${Object.keys(s.days).length} day records, ${s.spans.length} spans)`);
