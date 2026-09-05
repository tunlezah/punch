// actions.js — the button flows shared by the Today view and the hotkeys.

import { nowHHMM, nowMinutes, addDays, fmtDateAU, fmtDuration, parseHHMM, fmtHHMM, dateRange } from '../time.js';
import * as model from '../model.js';
import { openSpan, standardMinutes } from '../calc.js';
import { promptDate, promptDateTime, promptRange, promptTimes, promptAdjustment, choiceDialog } from './dialogs.js';
import { toast } from '../dom.js';

const au = (iso) => fmtDateAU(iso, { weekday: false });

/** Everything the Today view needs to know about today's state. */
export function todayState(app) {
  const state = app.store.state;
  const today = app.today();
  const e = app.store.derived.get(today);
  const rec = state.days[today] || null;
  const day = e.day;
  const calc = e.calc;
  const holidaySpan = openSpan(state.spans, 'Holiday');
  const tdySpan = openSpan(state.spans, 'TDY');
  const onLeave = Boolean(holidaySpan && holidaySpan.start <= today);
  const lockedType = rec && ['Holiday', 'Sick', 'PublicHoliday', 'Off'].includes(rec.type) ? rec.type : null;
  const has = {
    in: Boolean(rec && rec.in),
    lunchOut: Boolean(rec && rec.lunchOut),
    lunchBack: Boolean(rec && rec.lunchBack),
    home: Boolean(rec && rec.home),
  };
  const can = {
    in: !onLeave && !lockedType && !has.in,
    lunchOut: !onLeave && has.in && !has.lunchOut && !has.home,
    lunchBack: !onLeave && has.lunchOut && !has.lunchBack && !has.home,
    home: !onLeave && has.in && !has.home,
  };
  let primary = null;
  if (can.in) primary = 'in';
  else if (can.lunchBack) primary = 'lunchBack';
  else if (can.home) primary = can.lunchOut && nowMinutes() < 14 * 60 ? 'lunchOut' : 'home';

  let phase;
  if (onLeave) phase = 'leave';
  else if (lockedType) phase = { Holiday: 'leave', Sick: 'sick', PublicHoliday: 'ph', Off: 'off' }[lockedType];
  else if (!has.in) phase = day.type === 'TDY' ? 'tdy' : day.type === 'PublicHoliday' ? 'ph' : 'notstarted';
  else if (has.home) phase = 'done';
  else if (has.lunchOut && !has.lunchBack) phase = 'lunch';
  else phase = 'working';

  return { today, rec, day, calc, holidaySpan, tdySpan, onLeave, lockedType, has, can, primary, phase, tdyToday: day.type === 'TDY' };
}

export function pressIn(app) {
  const ts = todayState(app);
  if (!ts.can.in) return false;
  const t = nowHHMM();
  return app.act(`In ${t}`, (s) => model.clockIn(s, ts.today, t));
}

export function pressLunchOut(app) {
  const ts = todayState(app);
  if (!ts.can.lunchOut) return false;
  const t = nowHHMM();
  return app.act(`Out to lunch ${t}`, (s) => model.clockLunchOut(s, ts.today, t));
}

export function pressLunchBack(app) {
  const ts = todayState(app);
  if (!ts.can.lunchBack) return false;
  const t = nowHHMM();
  return app.act(`Back from lunch ${t}`, (s) => model.clockLunchBack(s, ts.today, t));
}

export function pressHome(app) {
  const ts = todayState(app);
  if (!ts.can.home) return false;
  const t = nowHHMM();
  return app.act(`Home ${t}`, (s) => model.clockHome(s, ts.today, t));
}

/** Set one of today's times by hand (in-place edit). */
export function setTodayTime(app, field, value) {
  const ts = todayState(app);
  const v = value ? fmtHHMM(parseHHMM(value)) : '';
  if (value && parseHHMM(value) === null) { toast('Enter a time as HH:MM', { kind: 'warn' }); return false; }
  if (field === 'lunchBack' && v && !ts.has.lunchOut) { toast('Set Out to lunch first', { kind: 'warn' }); return false; }
  const labels = { in: 'In', lunchOut: 'Out to lunch', lunchBack: 'Back from lunch', home: 'Home' };
  return app.act(`${labels[field]} ${v || 'cleared'}`, (s) => model.setDay(s, ts.today, { [field]: v }));
}

export async function toggleHoliday(app) {
  const ts = todayState(app);
  if (ts.holidaySpan) {
    const proposed = ts.has.in ? ts.today : addDays(ts.today, -1);
    const start = ts.holidaySpan.start;
    const r = await promptDate({
      title: 'End holiday',
      message: `Holiday started ${fmtDateAU(start)}. Choose the last day of leave — yesterday is proposed when nothing has been worked today.`,
      label: 'Last day of leave',
      date: proposed < start ? start : proposed,
      min: start,
      okLabel: 'End holiday',
    });
    if (!r) return false;
    return app.act(`End holiday ${au(r.date)}`, (s) => model.endSpan(s, 'Holiday', r.date));
  }
  const proposed = ts.has.in ? addDays(ts.today, 1) : ts.today;
  const r = await promptDate({
    title: 'Start holiday',
    message: ts.has.in
      ? 'Work is recorded today, so leave is proposed to start tomorrow. If today is still open it will be closed with a Home time now.'
      : 'Leave starts today unless you choose another date. Each working day in the span is credited a standard day.',
    label: 'First day of leave',
    date: proposed,
    notes: '',
    okLabel: 'Start holiday',
  });
  if (!r) return false;
  const now = nowHHMM();
  return app.act(`Start holiday ${au(r.date)}`, (s) => {
    let n = s;
    if (ts.has.in && !ts.has.home) n = model.clockHome(n, ts.today, now);
    return model.startSpan(n, 'Holiday', r.date, '', r.notes);
  });
}

export async function toggleTdy(app) {
  const ts = todayState(app);
  if (ts.tdySpan) {
    const r = await promptDateTime({
      title: 'TDY end',
      message: `TDY started ${fmtDateAU(ts.tdySpan.start)}${ts.tdySpan.startTime ? ' at ' + ts.tdySpan.startTime : ''}. When did it end?`,
      date: ts.today,
      time: nowHHMM(),
      okLabel: 'End TDY',
    });
    if (!r) return false;
    if (r.date < ts.tdySpan.start) { toast('The end is before the start of the TDY', { kind: 'warn' }); return false; }
    return app.act(`TDY end ${au(r.date)} ${r.time}`, (s) => model.endSpan(s, 'TDY', r.date, r.time));
  }
  const r = await promptDateTime({
    title: 'TDY start',
    message: 'Each working day of the TDY is credited a standard day. Clock actual times on any day and those hours are used instead; over or under hours are only added to TOIL when you confirm them.',
    date: ts.today,
    time: nowHHMM(),
    notes: '',
    okLabel: 'Start TDY',
  });
  if (!r) return false;
  return app.act(`TDY start ${au(r.date)} ${r.time}`, (s) => model.startSpan(s, 'TDY', r.date, r.time, r.notes));
}

/** Mark a range as a credited type. Explicit days with recorded times inside the range are left alone. */
function applyRange(s, type, start, end, notes) {
  let n = model.markRange(s, type, start, end, notes);
  let kept = 0;
  if (start !== end) {
    for (const iso of dateRange(start, end)) {
      const rec = n.days[iso];
      if (!rec) continue;
      if (rec.in) kept++;
      else n = model.markDay(n, iso, type, notes || rec.notes);
    }
  }
  return { state: n, kept };
}

export async function pressSick(app) {
  const ts = todayState(app);
  let start = ts.today;
  let message = 'Sick leave credits a standard day for each working day in the range.';
  let closeToday = false;
  if (ts.has.in && !ts.lockedType) {
    const choice = await choiceDialog({
      title: 'Sick',
      message: `Today already has an In time (${ts.rec.in}). Convert today to a sick day, or keep the partial work day and mark sick from tomorrow?`,
      choices: [
        { label: 'Convert today to Sick', value: 'convert' },
        { label: 'Keep today, sick from tomorrow', value: 'tomorrow', kind: 'primary' },
      ],
    });
    if (!choice) return false;
    if (choice === 'tomorrow') {
      start = addDays(ts.today, 1);
      closeToday = !ts.has.home;
      message = 'Today is kept as a work day' + (closeToday ? ' and closed with a Home time now.' : '.');
    }
  }
  const r = await promptRange({ title: 'Sick leave', message, start, end: start, notes: '', okLabel: 'Mark sick' });
  if (!r) return false;
  const now = nowHHMM();
  let kept = 0;
  const ok = app.act(`Sick ${au(r.start)}${r.end !== r.start ? ' → ' + au(r.end) : ''}`, (s) => {
    let n = s;
    if (closeToday) n = model.clockHome(n, ts.today, now);
    const res = applyRange(n, 'Sick', r.start, r.end, r.notes);
    kept = res.kept;
    return res.state;
  });
  if (kept) toast(`${kept} day(s) with recorded times were left as they are`, { kind: 'info' });
  return ok;
}

export async function pressPublicHoliday(app) {
  const ts = todayState(app);
  const r = await promptDate({
    title: 'Public holiday',
    message: 'Marks the day as a public holiday and credits a standard day (nothing on a non-working day). Recorded times on that day are removed.',
    label: 'Date',
    date: ts.today,
    notes: '',
    okLabel: 'Mark public holiday',
  });
  if (!r) return false;
  return app.act(`Public holiday ${au(r.date)}`, (s) => model.markDay(s, r.date, 'PublicHoliday', r.notes));
}

export async function editToday(app) {
  const ts = todayState(app);
  const rec = ts.rec || { in: '', lunchOut: '', lunchBack: '', home: '', notes: '' };
  const r = await promptTimes({ title: `Edit ${fmtDateAU(ts.today)}`, rec, hint: ts.lockedType ? `Today is marked ${ts.lockedType}; entering an In time converts it to a work day.` : null });
  if (!r) return false;
  return app.act(`Edited ${au(ts.today)}`, (s) => {
    const patch = { ...r };
    if (ts.lockedType && r.in) patch.type = 'Work';
    return model.setDay(s, ts.today, patch);
  });
}

export async function adjustToil(app) {
  const d = app.store.derived;
  const r = await promptAdjustment({ currentBalance: d.balance, hoursDisplay: app.store.state.config.hoursDisplay, today: app.today() });
  if (!r) return false;
  return app.act(`TOIL adjustment ${fmtDuration(r.minutes, 'hmm', 'always')}`, (s) => model.addAdjustment(s, r));
}

export function decideTdy(app, pending, accept) {
  const { date, delta, calc } = pending;
  const std = calc.std;
  const reason = accept
    ? `TDY variance accepted (worked ${fmtDuration(calc.worked)} vs ${fmtDuration(std)})`
    : `TDY variance declined (worked ${fmtDuration(calc.worked)} vs ${fmtDuration(std)})`;
  return app.act(accept ? `Added ${fmtDuration(delta, 'hmm', 'always')} TDY hours to TOIL` : `TDY hours for ${au(date)} left out of TOIL`,
    (s) => model.addAdjustment(s, { date, minutes: accept ? delta : 0, reason }));
}

export function setHomeForOpenDay(app, date, hhmm) {
  const v = parseHHMM(hhmm);
  if (v === null) { toast('Enter a time as HH:MM', { kind: 'warn' }); return false; }
  return app.act(`Home ${fmtHHMM(v)} for ${au(date)}`, (s) => model.setDay(s, date, { home: fmtHHMM(v) }));
}

/** Default Home time for an open day: In + standard day + lunch. */
export function suggestedHome(config, rec) {
  const tIn = parseHHMM(rec.in);
  if (tIn === null) return '17:00';
  const lo = parseHHMM(rec.lunchOut);
  const lb = parseHHMM(rec.lunchBack);
  const lunch = lo !== null && lb !== null ? Math.max(0, lb - lo) : config.defaultLunchMinutes;
  return fmtHHMM(Math.min(23 * 60 + 59, tIn + standardMinutes(config, rec.date) + lunch));
}
