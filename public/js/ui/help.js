// help.js — the one-screen help popup (also opened on first launch).

import { h, kbd } from '../dom.js';
import { HOTKEYS } from '../hotkeys.js';
import { hasFSA } from '../storage.js';
import { openDialog } from './dialogs.js';
import { fmtDuration } from '../time.js';

export function helpContent(app) {
  const cfg = app.store.state.config;
  const std = fmtDuration(cfg.standardMinutesPerDay);
  return h('div', { class: 'help-body' },
    h('p', { class: 'muted' }, 'Punch records your working day with four buttons, tracks leave and travel, works out hours against your standard week and pay fortnight, and saves everything to one human-readable Markdown file.'),
    h('h3', {}, 'The day'),
    h('ul', {},
      h('li', {}, h('b', {}, 'In → Out to lunch → Back from lunch → Home.'), ' Each press records the current time. Buttons enable in order; the most likely next one is highlighted. Home during lunch also closes the lunch.'),
      h('li', {}, 'Tap any recorded time to correct it in place, or press ', kbd('E'), ' to edit all four. ', h('b', {}, 'Undo'), ' the last action for 30 seconds with ', kbd('Z'), '.'),
      h('li', {}, `Worked = Home − In − lunch. With no lunch pair the default lunch (${cfg.defaultLunchMinutes} min) is deducted. Δ = worked − standard day (${std} on working days, 0 otherwise).`),
      h('li', {}, 'A previous day left without Home is flagged on launch; set a time or leave it — it stays out of totals until it has one.'),
    ),
    h('h3', {}, 'Leave and travel'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Holiday'), ' opens a span (tomorrow if you have worked today). Every working day in it is credited a standard day; day buttons are disabled until End holiday.'),
      h('li', {}, h('b', {}, 'TDY'), ' opens a span with date and time. Days are credited a standard day, but you can still clock actual times and those win. Over or under hours on TDY days are ', h('b', {}, 'not'), ' added to TOIL until you confirm them in the Today view.'),
      h('li', {}, h('b', {}, 'Sick'), ' credits a standard day for a day or a range. If you have already clocked in it asks whether to convert today or start tomorrow.'),
      h('li', {}, h('b', {}, 'Public holiday'), ' credits a standard day. Pick your state or territory in Settings to load the 2026–2027 dates into the file’s public-holiday list: any listed date is pre-marked automatically unless the day has its own record, and the list itself can be edited — move a date, rename it, remove one, add a local one.'),
      h('li', {}, h('b', {}, 'Off'), ' marks a non-working day: no standard hours, no credit.'),
      h('li', {}, 'Every cell in the Recent view is editable, including the hours credited to a leave or TDY day. Spans are edited at the bottom of the Recent view.'),
    ),
    h('h3', {}, 'TOIL balance'),
    h('p', {}, 'The running balance is the cumulative Δ since the balance start date (default: your first record) plus any TOIL adjustments. Use ', h('b', {}, 'Adjust'), ' to correct it; every adjustment is written to the file with a reason so nothing is hidden.'),
    h('h3', {}, 'The Markdown file'),
    h('ul', {},
      hasFSA
        ? h('li', {}, 'This browser writes ', h('code', {}, 'timesheet.md'), ' directly, about half a second after every change. The header shows when it was last written. On launch the file is read back — the file always wins, and hand edits made while Punch was closed are picked up.')
        : h('li', {}, 'This browser (Firefox/Safari) cannot write files directly. Your data is kept in the browser; use ', h('b', {}, 'Download timesheet.md'), ' to save the file and ', h('b', {}, 'Import'), ' to load one. The header warns while the file is out of date.'),
      h('li', {}, 'The file is safe to edit by hand: change times, types and notes in the tables, add rows in the same layout, add spans to “Leave and travel”. Worked, Std, Δ and the Period lines are recalculated on every save. Lines the app cannot read are kept under “Unparsed”.'),
      h('li', {}, 'Dates in the file are ISO (2026-09-05); everywhere in the app they are shown day/month/year. Times are 24-hour local time.'),
    ),
    h('h3', {}, 'Hotkeys'),
    h('p', { class: 'hint' }, 'Single keys, active when no field has focus. Browser shortcuts are never overridden.'),
    h('table', {}, h('tbody', {}, HOTKEYS.map(([k, what]) => h('tr', {}, h('td', {}, ...k.split(' ').map((x) => kbd(x))), h('td', {}, what))))),
  );
}

export function openHelp(app) {
  if (document.querySelector('dialog[open]')) return;
  return openDialog({
    title: 'How Punch works',
    size: 'lg',
    body: helpContent(app),
    buttons: [{ label: 'Close', value: 'ok', kind: 'primary', autofocus: true }],
    noAutoFocus: true,
  });
}
