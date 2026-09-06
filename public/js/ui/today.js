// today.js — the default view: big day/leave buttons, today's editable times
// and the live status panel (elapsed, week, pay period, TOIL balance).

import { h, clear, icon, kbd, timeInput } from '../dom.js';
import { fmtDateAU, fmtDateLong, fmtHHMM, parseHHMM, nowMinutes, fmtClock, diffDays, fmtDuration } from '../time.js';
import { weekStart, weekEnd, periodFor, openDays, pendingTdyDecisions, TYPE_LABELS } from '../calc.js';
import * as actions from './actions.js';

const au = (iso) => fmtDateAU(iso, { weekday: false });

function bigBtn({ label, sub, key, iconName, disabled, primary, onClick, tone }) {
  return h('button', {
    type: 'button',
    class: `big-btn${primary ? ' primary' : ''}${tone ? ' ' + tone : ''}`,
    disabled: Boolean(disabled),
    onClick,
    'aria-keyshortcuts': key,
    'aria-label': `${label}${sub ? ' — ' + sub : ''}`,
  },
  h('div', { class: 'big-top' }, icon(iconName, 22), kbd(key)),
  h('div', {}, h('div', { class: 'big-label' }, label), sub ? h('div', { class: 'big-sub' }, sub) : null));
}

function phaseInfo(ts) {
  const rec = ts.rec || {};
  switch (ts.phase) {
    case 'working': return { label: 'Working', dot: 'working', sub: `since ${rec.in}${rec.lunchBack ? ` · lunch ${rec.lunchOut}–${rec.lunchBack}` : ''}` };
    case 'lunch': return { label: 'At lunch', dot: 'lunch', sub: `out since ${rec.lunchOut} · in at ${rec.in}` };
    case 'done': return { label: 'Done for today', dot: 'done', sub: `${rec.in} → ${rec.home}${rec.lunchOut ? ` · lunch ${rec.lunchOut}–${rec.lunchBack || rec.home}` : ''}` };
    case 'leave': return { label: 'On leave', dot: 'leave', sub: ts.holidaySpan ? `since ${au(ts.holidaySpan.start)}${ts.holidaySpan.notes ? ' · ' + ts.holidaySpan.notes : ''}` : (rec.notes || '') };
    case 'tdy': return { label: 'TDY', dot: 'leave', sub: ts.tdySpan ? `${ts.tdySpan.notes || 'travelling'} · standard day credited unless you clock times` : 'standard day credited unless you clock times' };
    case 'sick': return { label: 'Sick day', dot: 'leave', sub: rec.notes || 'standard day credited' };
    case 'ph': return { label: 'Public holiday', dot: 'leave', sub: ts.day.notes || 'standard day credited' };
    case 'off': return { label: 'Day off', dot: '', sub: rec.notes || 'no standard hours today' };
    default: return { label: 'Not started', dot: '', sub: ts.calc.workDay ? 'press In when you start' : 'non-working day — press In if you work today' };
  }
}

export function renderToday(root, app) {
  const { store } = app;
  const state = store.state;
  const cfg = state.config;
  const d = store.derived;
  const today = app.today();
  const ts = actions.todayState(app);
  const rec = ts.rec;
  const fmt = app.fmt;
  const fmtD = app.fmtDelta;

  // ---- banners inside the view -------------------------------------------
  const top = h('div', { class: 'stack' });
  if (ts.onLeave) {
    top.append(h('div', { class: 'banner accent' }, icon('sunset', 20),
      h('div', { class: 'banner-text' }, h('strong', {}, `On leave since ${fmtDateAU(ts.holidaySpan.start)}`), 'Day buttons are disabled until the holiday ends.'),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => actions.toggleHoliday(app) }, 'End holiday', kbd('V'))));
  }
  for (const od of openDays(state, today).filter((x) => !app.dismissedOpenDays.has(x.date))) {
    const input = timeInput({ value: actions.suggestedHome(cfg, od), 'aria-label': `Home time for ${fmtDateAU(od.date)} (24-hour HH:MM)` });
    top.append(h('div', { class: 'banner warn' }, icon('warn', 20),
      h('div', { class: 'banner-text' }, h('strong', {}, `${fmtDateAU(od.date)} has no Home time`),
        `In ${od.in}${od.lunchOut ? `, lunch ${od.lunchOut}–${od.lunchBack || '…'}` : ''}. The proposed time is In + standard day + lunch. The day stays out of totals until it has a Home time.`),
      h('div', { class: 'row' }, input,
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => actions.setHomeForOpenDay(app, od.date, input.value) }, 'Set'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => { app.dismissedOpenDays.add(od.date); app.render(); } }, 'Leave it'))));
  }

  // ---- day buttons ----------------------------------------------------------
  const dayCard = h('section', { class: 'card', 'aria-labelledby': 'day-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'day-h' }, icon('clock', 18), 'Day'), h('span', { class: 'sub' }, fmtDateLong(today))),
    h('div', { class: 'big-grid' },
      bigBtn({ label: 'In', key: 'I', iconName: 'login', disabled: !ts.can.in, primary: ts.primary === 'in', onClick: () => actions.pressIn(app),
        sub: ts.has.in ? `In at ${rec.in}` : ts.lockedType ? `Today is ${TYPE_LABELS[ts.lockedType].toLowerCase()}` : ts.onLeave ? 'On leave' : 'Start the day' }),
      bigBtn({ label: 'Out to lunch', key: 'L', iconName: 'coffee', disabled: !ts.can.lunchOut, primary: ts.primary === 'lunchOut', onClick: () => actions.pressLunchOut(app),
        sub: ts.has.lunchOut ? `Out at ${rec.lunchOut}` : ts.can.lunchOut ? 'Pause the clock' : 'Needs In first' }),
      bigBtn({ label: 'Back from lunch', key: 'B', iconName: 'refresh', disabled: !ts.can.lunchBack, primary: ts.primary === 'lunchBack', onClick: () => actions.pressLunchBack(app),
        sub: ts.has.lunchBack ? `Back at ${rec.lunchBack}` : ts.can.lunchBack ? 'Resume the clock' : 'Needs Out to lunch' }),
      bigBtn({ label: 'Home', key: 'H', iconName: 'home', disabled: !ts.can.home, primary: ts.primary === 'home', onClick: () => actions.pressHome(app),
        sub: ts.has.home ? `Home at ${rec.home}` : ts.phase === 'lunch' ? 'Also closes the lunch' : ts.can.home ? 'Finish the day' : 'Needs In first' }),
    ));

  // ---- today's times --------------------------------------------------------
  const chip = (label, field) => {
    const value = rec && rec[field] ? rec[field] : '';
    const btn = h('button', { type: 'button', class: `time-chip${value ? '' : ' empty'}`, 'aria-label': `${label}: ${value || 'not set'}. Activate to edit.` },
      h('span', { class: 'chip-label' }, label), h('span', { class: 'chip-value' }, value || '—'));
    btn.addEventListener('click', () => {
      const input = timeInput({ value, 'aria-label': `${label} time, 24-hour HH:MM` });
      const wrap = h('div', { class: 'time-chip' }, h('span', { class: 'chip-label' }, label), input);
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        if (commit && input.value.trim() !== value) {
          if (!actions.setTodayTime(app, field, input.value)) app.render();
        } else {
          wrap.replaceWith(btn);
          btn.focus();
        }
      };
      input.addEventListener('change', () => finish(true));
      input.addEventListener('blur', () => setTimeout(() => finish(true), 0));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      });
      btn.replaceWith(wrap);
      input.focus();
    });
    return btn;
  };
  const undoWrap = h('span', { class: 'undo-chip' });
  const renderUndo = () => {
    clear(undoWrap);
    const u = store.canUndo();
    if (u) undoWrap.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onClick: () => app.undo() }, icon('undo', 16), `Undo: ${u.label}`, kbd('Z')));
  };
  renderUndo();
  const timesCard = h('section', { class: 'card', 'aria-labelledby': 'times-h' },
    h('div', { class: 'card-head' }, h('h3', { id: 'times-h' }, 'Today’s times'),
      h('div', { class: 'row' }, undoWrap, h('button', { type: 'button', class: 'btn btn-sm', onClick: () => actions.editToday(app) }, icon('edit', 16), 'Edit', kbd('E')))),
    h('div', { class: 'times-row' }, chip('In', 'in'), chip('Lunch out', 'lunchOut'), chip('Lunch back', 'lunchBack'), chip('Home', 'home')),
    ts.calc.invalid ? h('p', { class: 'hint', style: { color: 'var(--danger)', marginTop: '8px' } }, `Check the times: ${ts.calc.invalid}.`) : null,
    rec && rec.notes ? h('p', { class: 'hint', style: { marginTop: '8px' } }, `Notes: ${rec.notes}`) : null,
  );

  // ---- leave buttons --------------------------------------------------------
  const leaveCard = h('section', { class: 'card', 'aria-labelledby': 'leave-h' },
    h('div', { class: 'card-head' }, h('h2', { id: 'leave-h' }, icon('plane', 18), 'Leave and travel')),
    h('div', { class: 'big-grid' },
      bigBtn({ label: ts.holidaySpan ? 'End holiday' : 'Start holiday', key: 'V', iconName: 'sunset', onClick: () => actions.toggleHoliday(app),
        sub: ts.holidaySpan ? `On leave since ${au(ts.holidaySpan.start)}` : ts.has.in ? 'Proposes tomorrow' : 'Proposes today', primary: Boolean(ts.holidaySpan) }),
      bigBtn({ label: ts.tdySpan ? 'TDY end' : 'TDY start', key: 'T', iconName: 'plane', onClick: () => actions.toggleTdy(app),
        sub: ts.tdySpan ? `Since ${au(ts.tdySpan.start)} ${ts.tdySpan.startTime || ''}` : 'Date and time, prefilled with now', primary: Boolean(ts.tdySpan) }),
      bigBtn({ label: 'Sick', key: 'S', iconName: 'thermometer', onClick: () => actions.pressSick(app), sub: 'Today, or a date range' }),
      bigBtn({ label: 'Public holiday', key: 'P', iconName: 'flag', onClick: () => actions.pressPublicHoliday(app), sub: state.holidays.length ? `${state.holidays.length} listed dates are pre-marked` : 'Mark a date' }),
    ));

  // ---- status panel ---------------------------------------------------------
  const info = phaseInfo(ts);
  const ws = d.summarize(weekStart(cfg, today), weekEnd(cfg, today));
  const period = periodFor(cfg, today);
  const ps = d.summarize(period.start, period.end);
  const daysLeft = diffDays(today, period.end);
  const adjCount = state.adjustments.length;
  const balanceStart = d.ctx.balanceStart;
  const pct = ps.std > 0 ? Math.min(100, Math.round((ps.worked / ps.std) * 100)) : 0;
  const sign = (m) => (m > 0 ? 'pos' : m < 0 ? 'neg' : 'zero');

  const elapsedEl = h('div', { class: 'hero-num', 'aria-live': 'off' });
  const elapsedSub = h('div', { class: 'hint', style: { marginTop: '6px' } });
  const clockEl = h('span', { class: 'sub num' });

  const statusCard = h('section', { class: 'card', 'aria-labelledby': 'status-h', 'aria-live': 'polite', 'aria-atomic': 'false' },
    h('div', { class: 'card-head' },
      h('div', { class: 'status-state', id: 'status-h' }, h('span', { class: `dot ${info.dot}` }), info.label),
      clockEl),
    h('div', { class: 'muted', style: { marginTop: '-6px', marginBottom: '12px' } }, info.sub),
    elapsedEl,
    elapsedSub,
    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'This week'),
        h('div', { class: 'stat-value' }, fmt(ws.worked), h('span', { class: 'muted', style: { fontSize: '.9rem', fontWeight: 500 } }, ` / ${fmt(ws.std)}`)),
        h('div', { class: `stat-sub ${sign(ws.delta)}` }, `Δ ${fmtD(ws.delta)} · ${ws.days} day${ws.days === 1 ? '' : 's'} recorded`)),
      h('div', { class: 'stat' }, h('div', { class: 'stat-label' }, 'Pay period'),
        h('div', { class: 'stat-value' }, fmt(ps.worked), h('span', { class: 'muted', style: { fontSize: '.9rem', fontWeight: 500 } }, ` / ${fmt(ps.std)}`)),
        h('div', { class: `stat-sub ${sign(ps.delta)}` }, `Δ ${fmtD(ps.delta)} · ${daysLeft === 0 ? 'last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}`),
        h('div', { class: 'stat-sub' }, `${au(period.start)} → ${au(period.end)}`),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Pay period worked versus standard' }, h('span', { style: { width: `${pct}%` } }))),
      h('div', { class: 'stat toil' },
        h('div', { style: { flex: 1 } },
          h('div', { class: 'stat-label' }, 'TOIL balance'),
          h('div', { class: `stat-value ${sign(d.balance)}` }, fmtD(d.balance)),
          h('div', { class: 'stat-sub' }, `Cumulative over/under since ${au(balanceStart)}${adjCount ? ` · ${adjCount} adjustment${adjCount === 1 ? '' : 's'} (${fmtD(d.adjustmentsTotal)})` : ''}`)),
        h('button', { type: 'button', class: 'btn btn-sm', onClick: () => actions.adjustToil(app), 'aria-label': 'Adjust TOIL balance' }, icon('edit', 16), 'Adjust')),
    ));

  // ---- pending TDY decisions -------------------------------------------------
  const pending = pendingTdyDecisions(state, d);
  const pendingCard = pending.length ? h('section', { class: 'card', 'aria-labelledby': 'pend-h' },
    h('div', { class: 'card-head' }, h('h3', { id: 'pend-h' }, icon('plane', 16), 'TDY hours to confirm'), h('span', { class: 'sub' }, 'not added to TOIL until you decide')),
    h('div', { class: 'pending-list' }, pending.map((p) => h('div', { class: 'pending' }, icon('warn', 18),
      h('div', { class: 'pending-text' }, h('strong', {}, `${fmtDateAU(p.date)} — worked ${fmt(p.calc.worked)} vs ${fmt(p.calc.std)} standard (${fmtD(p.delta)})`),
        h('div', { class: 'hint' }, p.day.notes || 'TDY day with recorded hours')),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onClick: () => actions.decideTdy(app, p, true) }, `Add ${fmtD(p.delta)} to TOIL`),
        h('button', { type: 'button', class: 'btn btn-sm', onClick: () => actions.decideTdy(app, p, false) }, 'Don’t add'))))),
  ) : null;

  root.append(top, h('div', { class: 'grid-2' }, h('div', { class: 'stack' }, dayCard, timesCard, leaveCard), h('div', { class: 'stack' }, statusCard, pendingCard)));

  // ---- live updates ---------------------------------------------------------
  const tick = () => {
    const now = new Date();
    clockEl.textContent = fmtClock(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const secs = now.getSeconds();
    const tIn = rec ? parseHHMM(rec.in) : null;
    const tLo = rec ? parseHHMM(rec.lunchOut) : null;
    const tLb = rec ? parseHHMM(rec.lunchBack) : null;
    const pair = tLo !== null && tLb !== null ? Math.max(0, tLb - tLo) : null;
    const hhmmss = (mins, s) => `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`.replace(/$/, `:${String(s).padStart(2, '0')}`);
    clear(elapsedEl);
    clear(elapsedSub);
    if (ts.phase === 'working' && tIn !== null) {
      const worked = Math.max(0, nowMin - tIn - (pair !== null ? pair : 0));
      elapsedEl.append(hhmmss(worked, secs), h('small', {}, 'elapsed today'));
      const lunch = pair !== null ? pair : cfg.defaultLunchMinutes;
      const target = tIn + ts.calc.std + lunch;
      const homeNow = Math.max(0, nowMin - tIn - lunch);
      elapsedSub.append(
        ts.calc.std ? `Standard day (${fmt(ts.calc.std)}) at ${fmtHHMM(Math.min(target, 1439))}` : 'No standard hours today',
        ` · Home now → ${fmt(homeNow)} worked`,
        pair === null ? ` (${cfg.defaultLunchMinutes} min default lunch deducted)` : '',
      );
    } else if (ts.phase === 'lunch' && tIn !== null) {
      const worked = Math.max(0, tLo - tIn);
      elapsedEl.append(fmt(worked), h('small', {}, 'before lunch'));
      elapsedSub.append(`Out for ${fmtDuration(Math.max(0, nowMin - tLo))} so far · press Back from lunch to resume`);
    } else if (ts.phase === 'done') {
      elapsedEl.append(fmt(ts.calc.worked), h('small', {}, 'worked today'));
      elapsedSub.append(`Standard ${fmt(ts.calc.std)} · Δ ${fmtD(ts.calc.delta)}${ts.calc.tdyVariance ? ' · TDY day: confirm below whether this counts toward TOIL' : ''}`);
    } else if (ts.calc.complete) {
      elapsedEl.append(fmt(ts.calc.worked), h('small', {}, 'credited today'));
      elapsedSub.append(`Standard ${fmt(ts.calc.std)} · Δ ${fmtD(ts.calc.delta)}`);
    } else {
      elapsedEl.append('0:00', h('small', {}, 'today'));
      elapsedSub.append(ts.calc.std ? `Standard day ${fmt(ts.calc.std)}` : 'No standard hours today');
    }
    renderUndo();
  };
  tick();
  return { tick };
}
