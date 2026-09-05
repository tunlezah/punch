# Punch

A single-user timesheet that lives in one Markdown file.

Punch records the working day with four big buttons (**In · Out to lunch · Back from lunch · Home**), tracks holidays, sick leave, public holidays and TDY (travel) as spans, works out hours against a configurable standard day and pay fortnight, keeps a running TOIL balance, and writes everything to `timesheet.md` on your machine. It is a static single-page app: plain HTML, CSS and JavaScript, no build step, no server, no network requests, works offline once loaded, and can be installed as a PWA.

- **Today** — the buttons, today's editable times, live elapsed time, week and pay-period totals, TOIL balance, TDY hours waiting for a decision, and recovery for a day left open.
- **Recent** — the last N weeks as editable tables (type, times, credited hours, notes), pay-period boundaries marked, week and period subtotals, the leave/travel span editor, CSV export and a one-page A4 print of a pay period.
- **History** — the whole file, read-only: configuration, leave and travel, TOIL adjustments and every pay period, with search, jump-to-date and a raw Markdown toggle.
- **Settings** — every configurable value, theme and accent, the file connection and a danger zone.
- **Help** — `?` opens a one-screen explanation with the hotkey table (also opens once on first launch).

Dates are stored in ISO form (`2026-09-05`) and shown in Australian day/month/year form everywhere in the app. Times are 24-hour local wall-clock times.

## Running it

There is nothing to build.

```sh
npm test                 # unit tests (Node ≥ 20, no dependencies)
node scripts/serve.mjs   # serve public/ at http://localhost:8080/
```

Any static file server works; open `public/index.html` through a server (module scripts and the service worker need `http(s)://`, not `file://`).

## Browser support for the file

| Browser | File handling |
|---|---|
| Chrome, Edge (current) | **Full.** Uses the File System Access API. On first run choose *Create timesheet.md* or *Open existing*. The file handle is remembered (IndexedDB); on later launches Chrome asks once for permission ("Allow access"), then the file is read and rewritten ~0.5 s after every change. The header shows *Saved HH:MM:SS*, or a warning if a write fails. Hand edits made while Punch was closed (or in the background) are picked up on launch and on window focus. |
| Firefox, Safari | **Download / import.** IndexedDB is the working store. The header shows *Unsaved changes to the file* until you press **Download timesheet.md**; **Import timesheet.md** loads a file (replace, or merge by date). Nothing is downloaded automatically. |
| Any browser | Works fully with browser storage alone ("Browser only for now"). Data never leaves the browser. |

If the browser copy and the file disagree on launch, the **file wins**; the newer browser copy is kept aside and a banner offers *Replace file with browser copy*.

## Deploying to GitLab Pages

Push the repository to GitLab. `.gitlab-ci.yml` runs the tests on every branch and, on the default branch, publishes `public/` as the Pages artifact. The only CI-time transformation is `sed` stamping the service-worker cache name (`__BUILD__` in `public/sw.js` and `public/index.html`) with the commit SHA, so every deploy invalidates the previous offline cache and users see an *A new version is ready — Reload* toast. No built artefacts are committed.

Pages serves the site at `https://<group>.gitlab.io/<project>/`; all paths in the app are relative (`./`), and `manifest.webmanifest` sets `start_url` and `scope` to `./`, so sub-path hosting works. HTTPS is required for the service worker and the File System Access API (Pages provides it).

## The Markdown file

`timesheet.md` is the canonical store. It is plain Markdown and safe to edit by hand. Newest pay period first.

```markdown
# Timesheet

<!-- Written by Punch v1. Tables below are read back by the app — keep the column layout. -->

## Config

```yaml
last_saved: 2026-09-05T09:12:00+10:00
standard_hours_per_day: 7.6
work_days: [Mon, Tue, Wed, Thu, Fri]
pay_period_anchor: 2026-08-27
pay_period_days: 14
default_lunch_minutes: 30
rounding_minutes: 0
hours_display: hmm
balance_start: 2026-07-27
recent_weeks: 4
theme: system
accent: teal
holiday_region: ACT
reminder_time:
```

## Leave and travel

| Type    | Start            | End              | Hours/day | Notes      |
|---------|------------------|------------------|-----------|------------|
| Holiday | 2026-08-17       | 2026-08-21       | 7:36      | Coast trip |
| TDY     | 2026-08-25 06:10 | 2026-08-27 19:40 | 7:36      | Canberra   |
| Holiday | 2026-10-05       |                  | 7:36      | Japan      |

## TOIL adjustments

| Date       | Adjustment | Reason                                          |
|------------|------------|-------------------------------------------------|
| 2026-07-27 | +2:15      | Opening balance carried over                    |
| 2026-08-25 | +5:24      | TDY variance accepted (worked 13:00 vs 7:36)    |

## Pay period 2026-08-27 → 2026-09-09

| Date       | Day | Type | In    | Lunch out | Lunch back | Home  | Worked | Std  | Δ     | Notes     |
|------------|-----|------|-------|-----------|------------|-------|--------|------|-------|-----------|
| 2026-09-02 | Wed | Work | 08:31 | 12:30     | 13:00      | 17:20 | 8:19   | 7:36 | +0:43 |           |
| 2026-09-03 | Thu | Sick |       |           |            |       | 7:36   | 7:36 | 0:00  | Head cold |

Period: 38:39 worked · 38:00 standard · Δ +0:39 · Balance to date: +8:35
```

See [`sample/timesheet.md`](sample/timesheet.md) for six weeks of realistic data (generated by `node scripts/make-sample.mjs`).

### Hand-editing rules

- **Edit freely:** dates, `Type`, the four times, `Notes`, everything in *Leave and travel* and *TOIL adjustments*, and the `Config` block.
- **Derived, rewritten on every save, ignored on read:** `Day`, `Worked` for Work days, `Std`, `Δ`, and the `Period:` lines. For Holiday / Sick / PublicHoliday / TDY rows without times, `Worked` *is* the credited hours and is honoured (leave it blank to mean "the standard day").
- **Adding rows:** add a line in the same column layout to any period table; the app regroups rows by the configured periods on save, so the section heading you put it under does not matter. Dates may be `2026-09-05` or `05/09/2026`; times `08:32`, `8:32` or `0832`; hours `7:36`, `+0:02` or `7.6`. Type accepts `Work`, `Holiday` (also `leave`, `annual leave`), `Sick`, `PublicHoliday` (also `public holiday`, `ph`), `TDY`, `Off`. Columns are matched by header name, so a table missing `Worked`/`Std`/`Δ` still reads fine. If a date appears twice, the later row wins.
- **Anything the parser cannot read** (a bad time, prose, an unknown section) is kept verbatim under `## Unparsed` at the end of the file — nothing is silently dropped. The History view shows these lines and lets you discard them.
- **Pipes** inside notes are written as `\|`.
- Standard hours may be given per day (`standard_hours_per_day: 7.6` or `7:36`) or per week (`standard_hours_per_week: 38`); the other is derived. Unknown `Config` keys are preserved.

### What the numbers mean

- **Worked** (Work day) = Home − In − (Lunch back − Lunch out). With no lunch pair, the default lunch is deducted instead. Home before In is flagged and counts as zero.
- **Std** = the standard day on configured working days, 0 on other days and on `Off` days.
- **Δ** = Worked − Std. Period lines sum the rows that have data.
- **Leave / TDY / Public holiday** days are credited the standard day (0 on non-working days) unless a per-day figure is set. Spans in *Leave and travel* generate these days; only days you edit individually appear as rows.
- **TDY days with actual times** use those times. Their over/under hours are **not** added to TOIL automatically — the Today view asks; accepting writes a matching row to *TOIL adjustments*, declining writes a `0:00` row so it is not asked again.
- **TOIL balance** (the running/flex balance) = cumulative Δ of counted days since `balance_start` (default: the first record) + all TOIL adjustments. It is always visible on the Today view; *Adjust* lets you add/subtract an amount or set the balance, and the correction is recorded in the file with a reason.
- **Rounding** (5 / 6 / 15 min) rounds each clock time to the nearest step for display and totals; stored times are never rounded.

## Hotkeys

Single keys, active when no field has focus and no dialog is open. Modifier combinations are never intercepted, so browser shortcuts are untouched.

| Key | Action |
|---|---|
| `I` | In |
| `L` | Out to lunch |
| `B` | Back from lunch |
| `H` | Home |
| `V` | Start / end holiday |
| `T` | TDY start / end |
| `S` | Sick |
| `P` | Public holiday |
| `Z` | Undo last action (30-second window) |
| `E` | Edit today's times |
| `1` `2` `3` `4` | Today / Recent / History / Settings |
| `D` | Cycle theme (dark → light → system) |
| `,` | Settings |
| `?` | Help |
| `Esc` | Close dialog / popup |

## Decisions where the spec was silent

- **Days generated by spans and by the public-holiday list are not written as rows.** The *Leave and travel* table and `holiday_region` are the source of truth; period totals and balances in the file include those days. To override one day, give it a row (the UI does this when you edit a span day in Recent). This keeps `parse(render(state)) ≡ state` exact and makes changing a span's hours or the holiday region take effect everywhere.
- **Credited hours equal to the standard day are stored as "default"**, so leave days follow a later change to the standard day; only per-day overrides are pinned.
- **TOIL and the running balance are the same figure.** TDY variance enters it only via an accepted adjustment (see above). Adjustments live in their own table so corrections are visible and reversible.
- **Days with no record contribute nothing** (they are not counted as −7:36). They show dimmed in Recent so they are easy to fill in. An explicit Work row with no times counts as 0 worked.
- **A day left open** (In without Home) is excluded from totals until it has a Home time; the Today view prompts on launch with In + standard day + lunch proposed.
- **`Off`** means "not a working day": standard 0, credit 0 — use it for RDOs or part-time days off. **Work on a non-working day** counts entirely as Δ.
- **Week start** in the Recent view is the working day that follows the longest run of non-working days (Monday for Mon–Fri, Sunday for Sun–Thu, Tuesday for Tue–Sat).
- **Overlapping spans:** the latest-starting span wins for a given date; a public holiday beats a span; an explicit row beats both.
- **Public holidays** are bundled for 2026 and 2027 (national plus ACT, NSW, NT, QLD, SA, TAS, VIC, WA). Provisional dates (WA King's Birthday, Victoria's Grand Final eve) are marked. Regional show days and part-day holidays are not included. The list is best-effort — check against the official gazette and override any day by giving it a record.
- **Working a public holiday:** an explicit Work row replaces the holiday credit for that day; record any extra entitlement as a TOIL adjustment.
- **Lunch with only one time** (Out without Back) falls back to the default lunch. Pressing Home during lunch sets Lunch back = Home.
- **The file always uses `h:mm`** for hours; the decimal display setting affects the UI only.
- **Sick / Public holiday via the buttons** remove recorded times on the chosen day (a converted day). Marking a range as Sick leaves days that already have times unchanged and tells you how many.
- **Times are wall-clock.** On a daylight-saving change day a 01:30–04:30 shift is 3:00 on the wall clock and is recorded as such; date arithmetic is calendar-based, so periods and weeks never gain or lose a day.
- **Reminders** fire only while Punch is open (there is no background process); they use the Notifications API when allowed and fall back to an in-app toast.
- **Clear browser cache** removes the browser copy, the remembered file handle, `localStorage` and the offline cache, then reloads to the first-run screen. The file on disk is never touched.
- **Merge on import** keeps existing days and takes the imported version of any date present in both; spans and adjustments are unioned.

## Repository layout

```
public/            the app (served as-is)
  index.html       shell; views are rendered client-side
  css/app.css      tokens (dark/light × six accents), components, print stylesheet
  js/time.js       date/time helpers (calendar arithmetic in UTC, wall-clock times)
  js/calc.js       working days, pay periods, spans, per-day hours, balance
  js/holidays.js   bundled Australian public holidays 2026–2027
  js/model.js      state shape, normalisation, pure actions
  js/markdown.js   render(state) ⇄ parse(text)
  js/storage.js    IndexedDB + File System Access + download/import
  js/sync.js       file ⇄ browser synchronisation and conflict handling
  js/store.js      store with 30-second undo
  js/ui/*.js       Today, Recent, History, Settings, Help, dialogs, button flows
  sw.js            precaching service worker
  manifest.webmanifest, icons/
tests/             node --test suites (round-trip, hours/Δ/rounding/DST, periods, spans, balance, holidays)
sample/timesheet.md
scripts/           make-sample.mjs, make-icons.mjs, serve.mjs
.gitlab-ci.yml
```

## Out of scope

Multi-user, accounts, sync, pay rates or money, project/task codes, GPS, any backend.
