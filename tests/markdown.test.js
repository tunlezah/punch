import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { render, parse, peekLastSaved, splitRow, parseDateCell, parseType } from '../public/js/markdown.js';
import { emptyState, clockIn, clockLunchOut, clockLunchBack, clockHome, markDay, addSpan, addAdjustment, updateConfig, normalizeState } from '../public/js/model.js';

const NOW = new Date('2026-09-05T10:00:00');

function sampleState() {
  let s = emptyState();
  s = updateConfig(s, { lastSaved: '2026-09-05T09:12:00+10:00', balanceStart: '2026-08-27', accent: 'violet', theme: 'dark', holidayRegion: 'ACT', reminderTime: '17:30' });
  s = clockIn(s, '2026-09-03', '08:32');
  s = clockLunchOut(s, '2026-09-03', '12:30');
  s = clockLunchBack(s, '2026-09-03', '13:05');
  s = clockHome(s, '2026-09-03', '16:45');
  s = markDay(s, '2026-09-04', 'Sick', 'Head cold', NOW);
  s = clockIn(s, '2026-08-26', '07:58');
  s = clockHome(s, '2026-08-26', '16:20');
  s = normalizeState({ ...s, days: { ...s.days, '2026-08-25': { date: '2026-08-25', type: 'TDY', in: '06:10', home: '19:40', notes: 'Travel day' } } });
  s = normalizeState({ ...s, days: { ...s.days, '2026-08-12': { date: '2026-08-12', type: 'PublicHoliday', notes: 'Ekka | show day' } } });
  s = normalizeState({ ...s, days: { ...s.days, '2026-08-19': { date: '2026-08-19', type: 'Holiday', creditedHours: 228, notes: 'Half day' } } });
  s = addSpan(s, { type: 'TDY', start: '2026-08-25', startTime: '06:10', end: '2026-08-27', endTime: '19:40', hoursPerDay: null, notes: 'Canberra' });
  s = addSpan(s, { type: 'Holiday', start: '2026-10-05', end: '', notes: 'Japan' });
  s = addSpan(s, { type: 'Sick', start: '2026-08-17', end: '2026-08-18', hoursPerDay: 600, notes: '' });
  s = addAdjustment(s, { date: '2026-08-25', minutes: 324, reason: 'TDY variance accepted' });
  s = addAdjustment(s, { date: '2026-07-27', minutes: 135, reason: 'Opening balance' });
  return s;
}

test('parse(render(state)) ≡ state', () => {
  const s = sampleState();
  const text = render(s, NOW);
  const back = parse(text);
  assert.deepEqual(back, s);
  // and rendering again is byte-identical
  assert.equal(render(back, NOW), text);
});

test('rendered file has the documented layout', () => {
  const text = render(sampleState(), NOW);
  assert.match(text, /^# Timesheet\n\n<!-- Written by Punch v1\./);
  assert.match(text, /## Config\n\n```yaml\nlast_saved: 2026-09-05T09:12:00\+10:00\nstandard_hours_per_day: 7\.6\nwork_days: \[Mon, Tue, Wed, Thu, Fri\]\npay_period_anchor: 2026-08-27\npay_period_days: 14\n/);
  assert.match(text, /## Leave and travel\n\n\| Type +\| Start +\| End +\| Hours\/day \| Notes/);
  assert.match(text, /\| TDY +\| 2026-08-25 06:10 \| 2026-08-27 19:40 \| 7:36 +\| Canberra/);
  assert.match(text, /\| Sick +\| 2026-08-17 +\| 2026-08-18 +\| 10:00 +\|/);
  assert.match(text, /## TOIL adjustments\n\n\| Date +\| Adjustment \| Reason/);
  assert.match(text, /\| 2026-08-25 \| \+5:24 +\| TDY variance accepted/);
  // newest period first
  const p0 = text.indexOf('## Pay period 2026-08-27 → 2026-09-09');
  const p1 = text.indexOf('## Pay period 2026-08-13 → 2026-08-26');
  const p2 = text.indexOf('## Pay period 2026-07-30 → 2026-08-12');
  assert.ok(p0 > 0 && p1 > p0 && p2 > p1);
  assert.match(text, /\| 2026-09-03 \| Thu \| Work +\| 08:32 \| 12:30 +\| 13:05 +\| 16:45 \| 7:38 +\| 7:36 \| \+0:02 \|/);
  assert.match(text, /\| 2026-09-04 \| Fri \| Sick +\| +\| +\| +\| +\| 7:36 +\| 7:36 \| 0:00 +\| Head cold/);
  assert.match(text, /\| 2026-08-19 \| Wed \| Holiday +\| +\| +\| +\| +\| 3:48 +\| 7:36 \| -3:48 \| Half day/);
  assert.match(text, /\| 2026-08-25 \| Tue \| TDY +\| 06:10 \| +\| +\| 19:40 \| 13:00 +\| 7:36 \| \+5:24 \| Travel day/);
  assert.match(text, /Ekka \\\| show day/);
  assert.match(text, /\nPeriod: [0-9]+:[0-9]{2} worked · [0-9]+:[0-9]{2} standard · Δ [+-]?[0-9]+:[0-9]{2} · Balance to date: [+-]?[0-9]+:[0-9]{2}\n/);
  assert.ok(!text.includes('## Unparsed'));
});

test('parser tolerates hand edits: whitespace, reordered rows, missing derived columns, extra rows, AU dates, aliases', () => {
  const text = `# Timesheet

## Config

\`\`\`yaml
standard_hours_per_day:   7:36
work_days: [Mon,Tue,Wed,Thu,Fri]
pay_period_anchor: 27/08/2026
my_custom_key: keep me
\`\`\`

## Leave and travel

| Type | Start | End | Hours/day | Notes |
|---|---|---|---|---|
|holiday|2026-10-05||   |Japan|
| tdy | 14/09/2026 6:10 | 2026-09-17 19:40 | 7.6 | Melbourne |

## Pay period 2026-08-27 → 2026-09-09

| Date | Day | Type | In | Lunch out | Lunch back | Home | Worked | Std | Δ | Notes |
|------|-----|------|----|-----------|------------|------|--------|-----|---|-------|
|2026-09-04|Fri|Work|8:00|||16:06|
| 2026-09-03 | Thu | Work | 08:32 | 12:30 | 13:05 | 16:45 | 9:99 | 1:00 | +9:00 | derived columns are ignored |
| 07/09/2026 |     | ph   |       |       |       |       |       |      |       | Public holiday alias |
| 2026-09-02 | Wed | Annual leave |  |  |  |  | 3:48 |  |  | half day |
| 2026-09-01 | Tue | Work | 08:00 | 12:00 | 12:30 | 16:36 | 7:36 | 7:36 | 0:00 | Notes with \\| pipe |
| 2026-09-05 | Sat | Work | 8:3x |  |  | 16:00 |  |  |  | bad time |
| not a date | | Work | | | | | | | | |

Period: 0:00 worked · 0:00 standard · Δ 0:00 · Balance to date: 0:00

Some stray prose the app does not understand.
`;
  const s = parse(text);
  assert.equal(s.config.standardMinutesPerDay, 456);
  assert.equal(s.config.payPeriodAnchor, '2026-08-27');
  assert.deepEqual(s.config.extra, ['my_custom_key: keep me']);
  assert.equal(s.spans.length, 2);
  assert.equal(s.spans[0].type, 'TDY');
  assert.equal(s.spans[0].start, '2026-09-14');
  assert.equal(s.spans[0].startTime, '06:10');
  assert.equal(s.spans[0].hoursPerDay, null); // 7.6 h = standard → default
  assert.equal(s.spans[1].type, 'Holiday');
  assert.equal(s.spans[1].end, '');
  assert.deepEqual(Object.keys(s.days).sort(), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07']);
  assert.equal(s.days['2026-09-04'].in, '08:00');
  assert.equal(s.days['2026-09-04'].home, '16:06');
  assert.equal(s.days['2026-09-03'].notes, 'derived columns are ignored');
  assert.equal(s.days['2026-09-07'].type, 'PublicHoliday');
  assert.equal(s.days['2026-09-02'].type, 'Holiday');
  assert.equal(s.days['2026-09-02'].creditedHours, 228);
  assert.equal(s.days['2026-09-01'].notes, 'Notes with | pipe');
  assert.equal(s.unparsed.length, 3);
  assert.match(s.unparsed[0], /8:3x/);
  assert.match(s.unparsed[1], /not a date/);
  assert.match(s.unparsed[2], /stray prose/);
  // Unparsed lines survive a save/load cycle verbatim.
  const again = parse(render(s, NOW));
  assert.deepEqual(again, s);
  assert.match(render(s, NOW), /## Unparsed\n\n\| 2026-09-05 \| Sat \| Work \| 8:3x/);
});

test('rows are regrouped by the configured pay periods, sorted, and the last duplicate wins', () => {
  const text = `## Config
standard_hours_per_day: 7.6
pay_period_anchor: 2026-08-27
pay_period_days: 14

## Pay period 1999-01-01 → 1999-01-14

| Date | Day | Type | In | Lunch out | Lunch back | Home | Worked | Std | Δ | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| 2026-09-10 | Thu | Work | 08:00 | | | 16:06 | | | | second period |
| 2026-09-03 | Thu | Work | 08:00 | | | 16:06 | | | | first |
| 2026-09-03 | Thu | Work | 09:00 | | | 17:06 | | | | replaces the first |
`;
  const s = parse(text);
  assert.equal(s.days['2026-09-03'].in, '09:00');
  const out = render(s, NOW);
  const a = out.indexOf('## Pay period 2026-09-10 → 2026-09-23');
  const b = out.indexOf('## Pay period 2026-08-27 → 2026-09-09');
  assert.ok(a > 0 && b > a, 'newest period first');
  assert.ok(!out.includes('1999'));
});

test('config fallbacks: weekly hours derive the day, CRLF and BOM are fine, missing sections are fine', () => {
  const crlf = '﻿# Timesheet\r\n\r\n## Config\r\n\r\n```yaml\r\nstandard_hours_per_week: 38\r\nwork_days: [Mon, Tue, Wed, Thu, Fri]\r\n```\r\n';
  const s = parse(crlf);
  assert.equal(s.config.standardMinutesPerDay, 456);
  assert.equal(s.unparsed.length, 0);
  const four = parse('## Config\nstandard_hours_per_week: 30.4\nwork_days: [Mon, Tue, Wed, Thu]\n');
  assert.equal(four.config.standardMinutesPerDay, 456);
  assert.deepEqual(parse(''), emptyState());
  assert.deepEqual(parse('garbage only\n').unparsed, ['garbage only']);
});

test('helpers: splitRow, parseDateCell, parseType, peekLastSaved', () => {
  assert.deepEqual(splitRow('| a | b \\| c | d |'), ['a', 'b | c', 'd']);
  assert.deepEqual(splitRow('|a|b|'), ['a', 'b']);
  assert.equal(parseDateCell('05/09/2026'), '2026-09-05');
  assert.equal(parseDateCell('2026/09/05'), '2026-09-05');
  assert.equal(parseDateCell('31/02/2026'), null);
  assert.equal(parseType('Public Holiday'), 'PublicHoliday');
  assert.equal(parseType('PublicHoliday'), 'PublicHoliday');
  assert.equal(parseType('tdy'), 'TDY');
  assert.equal(parseType(''), 'Work');
  assert.equal(parseType('xyz'), null);
  assert.equal(peekLastSaved('```yaml\nlast_saved: 2026-09-05T14:22:10+10:00\n```'), '2026-09-05T14:22:10+10:00');
  assert.equal(peekLastSaved('nothing'), '');
});

test('sample/timesheet.md round-trips exactly', () => {
  const path = new URL('../sample/timesheet.md', import.meta.url);
  assert.ok(existsSync(path), 'sample/timesheet.md exists');
  const text = readFileSync(path, 'utf8');
  const s = parse(text);
  assert.equal(s.unparsed.length, 0, 'sample parses cleanly');
  assert.ok(Object.keys(s.days).length >= 20);
  assert.ok(s.spans.some((x) => x.type === 'Holiday'));
  assert.ok(s.spans.some((x) => x.type === 'TDY'));
  assert.ok(Object.values(s.days).some((x) => x.type === 'Sick'));
  assert.ok(Object.values(s.days).some((x) => x.type === 'PublicHoliday'));
  const sampleNow = new Date('2026-09-05T09:12:00+10:00');
  assert.equal(render(s, sampleNow), text);
  assert.deepEqual(parse(render(s, sampleNow)), s);
});
