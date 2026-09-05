// dialogs.js — promise-based <dialog> helpers. Dates are edited with native
// date inputs (shown in the browser's locale, stored as ISO); the label next
// to each input spells out the Australian rendering so nothing is ambiguous.

import { h, clear, icon, timeInput } from '../dom.js';
import { fmtDateAU, isISODate, parseDuration, fmtDelta, fmtDuration, normHHMM } from '../time.js';

export function dialogOpen() {
  return Boolean(document.querySelector('dialog[open]'));
}

/**
 * Open a modal dialog.
 * opts: { title, body: Node|string|(form)=>Node, buttons: [{label, value, kind, autofocus}],
 *         validate(form) → string|null, size: 'sm'|'md'|'lg', wide }
 * Resolves with { value, form } or null when dismissed.
 */
export function openDialog(opts) {
  return new Promise((resolve) => {
    const buttons = opts.buttons || [
      { label: 'Cancel', value: 'cancel', kind: 'ghost' },
      { label: 'OK', value: 'ok', kind: 'primary', autofocus: true },
    ];
    const err = h('p', { class: 'dlg-error', role: 'alert', hidden: true });
    const form = h('form', { method: 'dialog', class: 'dlg-form', novalidate: true });
    const body = typeof opts.body === 'function' ? opts.body(form) : opts.body;
    const dlg = h('dialog', { class: `dlg dlg-${opts.size || 'md'}`, 'aria-labelledby': 'dlg-title' });
    let result = null;
    const finish = (value) => {
      result = value === 'cancel' || value === '' || value == null ? null : { value, form };
      if (dlg.contains(document.activeElement) && document.activeElement.blur) document.activeElement.blur();
      dlg.close();
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitter = e.submitter;
      const value = submitter && submitter.value !== undefined && submitter.value !== '' ? submitter.value : 'ok';
      const btn = buttons.find((b) => b.value === value);
      if (btn && btn.kind === 'ghost') { finish(null); return; }
      if (opts.validate) {
        const msg = opts.validate(form, value);
        if (msg) { err.textContent = msg; err.hidden = false; return; }
      }
      finish(value);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg && !opts.sticky) finish(null); });
    form.append(
      h('header', { class: 'dlg-head' },
        h('h2', { id: 'dlg-title' }, opts.title),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onClick: () => finish(null) }, icon('close')),
      ),
      h('div', { class: 'dlg-body' }, body, err),
      h('footer', { class: 'dlg-foot' },
        buttons.map((b) => h('button', {
          type: 'submit', value: b.value, class: `btn btn-${b.kind || 'default'}`, autofocus: Boolean(b.autofocus),
        }, b.label)),
      ),
    );
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    dlg.showModal();
    const first = form.querySelector('input:not([type=hidden]), select, textarea');
    if (first && !opts.noAutoFocus) { first.focus(); if (first.select) try { first.select(); } catch { /* ignore */ } }
  });
}

export async function confirmDialog({ title, message, okLabel = 'OK', cancelLabel = 'Cancel', danger = false, extra = null }) {
  const r = await openDialog({
    title,
    body: h('div', {}, typeof message === 'string' ? h('p', {}, message) : message, extra),
    buttons: [
      { label: cancelLabel, value: 'cancel', kind: 'ghost' },
      { label: okLabel, value: 'ok', kind: danger ? 'danger' : 'primary', autofocus: true },
    ],
    noAutoFocus: true,
  });
  return Boolean(r);
}

/** Three-way choice. Returns the chosen value or null. */
export async function choiceDialog({ title, message, choices }) {
  const r = await openDialog({
    title,
    body: typeof message === 'string' ? h('p', {}, message) : message,
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, ...choices.map((c) => ({ label: c.label, value: c.value, kind: c.kind || 'default' }))],
    noAutoFocus: true,
  });
  return r ? r.value : null;
}

/** A labelled field row. */
export function field(label, input, hint) {
  const id = input.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  input.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    input,
    hint ? h('div', { class: 'hint' }, hint) : null,
  );
}

/** Date input with a live Australian-format readout. */
export function dateField(label, name, value, opts = {}) {
  const input = h('input', { type: 'date', name, value: value || '', required: true, min: opts.min, max: opts.max });
  const readout = h('div', { class: 'hint hint-live', 'aria-live': 'polite' }, value ? fmtDateAU(value) : 'Pick a date');
  input.addEventListener('input', () => { readout.textContent = isISODate(input.value) ? fmtDateAU(input.value) : 'Pick a date'; });
  const wrap = field(label, input, readout);
  return { input, wrap };
}

export function timeField(label, name, value, opts = {}) {
  const input = timeInput({ name, value: value || '', required: Boolean(opts.required) });
  return { input, wrap: field(label, input, opts.hint || '24-hour, e.g. 08:32') };
}

export function textField(label, name, value, opts = {}) {
  const input = h('input', { type: 'text', name, value: value || '', placeholder: opts.placeholder || '', maxlength: 200, autocomplete: 'off' });
  return { input, wrap: field(label, input, opts.hint) };
}

/** Prompt for a single date. Resolves ISO or null. */
export async function promptDate({ title, message, label = 'Date', date, notes = null, okLabel = 'Confirm', min, max }) {
  const d = dateField(label, 'date', date, { min, max });
  const n = notes !== null ? textField('Notes', 'notes', notes, { placeholder: 'Optional' }) : null;
  const r = await openDialog({
    title,
    body: h('div', {}, message ? h('p', { class: 'dlg-msg' }, message) : null, d.wrap, n ? n.wrap : null),
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, { label: okLabel, value: 'ok', kind: 'primary' }],
    validate: (form) => (isISODate(form.elements.date.value) ? null : 'Enter a valid date.'),
  });
  if (!r) return null;
  return { date: r.form.elements.date.value, notes: n ? r.form.elements.notes.value : '' };
}

/** Prompt for a date and a time. */
export async function promptDateTime({ title, message, date, time, notes = null, okLabel = 'Confirm' }) {
  const d = dateField('Date', 'date', date);
  const t = timeField('Time (24-hour)', 'time', time, { required: true });
  const n = notes !== null ? textField('Notes', 'notes', notes, { placeholder: 'e.g. Melbourne' }) : null;
  const r = await openDialog({
    title,
    body: h('div', {}, message ? h('p', { class: 'dlg-msg' }, message) : null, h('div', { class: 'field-row' }, d.wrap, t.wrap), n ? n.wrap : null),
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, { label: okLabel, value: 'ok', kind: 'primary' }],
    validate: (form) => {
      if (!isISODate(form.elements.date.value)) return 'Enter a valid date.';
      if (!normHHMM(form.elements.time.value)) return 'Enter a time as HH:MM.';
      return null;
    },
  });
  if (!r) return null;
  return { date: r.form.elements.date.value, time: normHHMM(r.form.elements.time.value), notes: n ? r.form.elements.notes.value : '' };
}

/** Prompt for a date range (single day when end = start). */
export async function promptRange({ title, message, start, end, notes = '', okLabel = 'Confirm' }) {
  const s = dateField('From', 'start', start);
  const e = dateField('To (same day for one day)', 'end', end || start);
  const n = textField('Notes', 'notes', notes, { placeholder: 'Optional' });
  s.input.addEventListener('input', () => { if (e.input.value < s.input.value) { e.input.value = s.input.value; e.input.dispatchEvent(new Event('input')); } });
  const r = await openDialog({
    title,
    body: h('div', {}, message ? h('p', { class: 'dlg-msg' }, message) : null, h('div', { class: 'field-row' }, s.wrap, e.wrap), n.wrap),
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, { label: okLabel, value: 'ok', kind: 'primary' }],
    validate: (form) => {
      if (!isISODate(form.elements.start.value) || !isISODate(form.elements.end.value)) return 'Enter valid dates.';
      if (form.elements.end.value < form.elements.start.value) return 'The end date is before the start date.';
      return null;
    },
  });
  if (!r) return null;
  return { start: r.form.elements.start.value, end: r.form.elements.end.value, notes: r.form.elements.notes.value };
}

/** Prompt for a TOIL adjustment. Resolves { date, minutes, reason } or null. */
export async function promptAdjustment({ currentBalance, hoursDisplay, today, date, minutes, reason }) {
  const mode = h('select', { name: 'mode' },
    h('option', { value: 'add' }, 'Add or subtract an amount'),
    h('option', { value: 'set' }, 'Set the balance to a value'),
  );
  const amount = h('input', { type: 'text', name: 'amount', value: minutes != null ? fmtDelta(minutes) : '', placeholder: '+1:30 or -0:45', autocomplete: 'off', inputmode: 'text' });
  const d = dateField('Effective date', 'date', date || today);
  const rsn = textField('Reason', 'reason', reason || '', { placeholder: 'e.g. Correction after payroll audit' });
  const preview = h('div', { class: 'hint hint-live' });
  const update = () => {
    const v = parseDuration(amount.value);
    if (v === null) { preview.textContent = 'Enter hours as h:mm (a leading + or − is fine) or as decimal hours.'; return; }
    const newBal = mode.value === 'set' ? v : currentBalance + v;
    preview.textContent = `Balance ${fmtDelta(currentBalance, hoursDisplay)} → ${fmtDelta(newBal, hoursDisplay)} (adjustment ${fmtDelta(mode.value === 'set' ? v - currentBalance : v, hoursDisplay)})`;
  };
  amount.addEventListener('input', update);
  mode.addEventListener('change', update);
  update();
  const r = await openDialog({
    title: 'Adjust TOIL balance',
    body: h('div', {},
      h('p', { class: 'dlg-msg' }, `Current TOIL balance: ${fmtDelta(currentBalance, hoursDisplay)}. Adjustments are written to the “TOIL adjustments” table in the file so the correction is visible and reversible.`),
      field('What to do', mode),
      field('Amount', amount, preview),
      d.wrap,
      rsn.wrap,
    ),
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, { label: 'Save adjustment', value: 'ok', kind: 'primary' }],
    validate: (form) => {
      if (parseDuration(form.elements.amount.value) === null) return 'Enter the amount as h:mm or decimal hours.';
      if (!isISODate(form.elements.date.value)) return 'Enter a valid date.';
      return null;
    },
  });
  if (!r) return null;
  const v = parseDuration(amount.value);
  const mins = mode.value === 'set' ? v - currentBalance : v;
  return { date: d.input.value, minutes: mins, reason: rsn.input.value || (mode.value === 'set' ? `Balance set to ${fmtDelta(v)}` : 'Manual adjustment') };
}

/** Edit the four clock times of a day. Resolves patch or null. */
export async function promptTimes({ title, rec, hint }) {
  const mk = (label, name) => timeField(label, name, rec[name]);
  const fIn = mk('In', 'in');
  const fLo = mk('Out to lunch', 'lunchOut');
  const fLb = mk('Back from lunch', 'lunchBack');
  const fHome = mk('Home', 'home');
  const notes = textField('Notes', 'notes', rec.notes, { placeholder: 'Optional' });
  const r = await openDialog({
    title,
    body: h('div', {},
      hint ? h('p', { class: 'dlg-msg' }, hint) : null,
      h('div', { class: 'field-row' }, fIn.wrap, fLo.wrap),
      h('div', { class: 'field-row' }, fLb.wrap, fHome.wrap),
      notes.wrap,
      h('p', { class: 'hint' }, 'Leave a field empty to clear it. Times are 24-hour local time.'),
    ),
    buttons: [{ label: 'Cancel', value: 'cancel', kind: 'ghost' }, { label: 'Save', value: 'ok', kind: 'primary' }],
    validate: (form) => {
      const lo = form.elements.lunchOut.value;
      const lb = form.elements.lunchBack.value;
      if (lb && !lo) return 'Back from lunch needs an Out to lunch time.';
      return null;
    },
  });
  if (!r) return null;
  return {
    in: normHHMM(fIn.input.value), lunchOut: normHHMM(fLo.input.value), lunchBack: normHHMM(fLb.input.value), home: normHHMM(fHome.input.value), notes: notes.input.value,
  };
}

export { fmtDuration, clear };
