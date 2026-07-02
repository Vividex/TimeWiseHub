# Locale Hydration Mismatch — Explicit Locale Sweep

## Goal
Fix a real SSR/client hydration mismatch caused by `toLocaleDateString([]/toLocaleTimeString([]`
(and one bare `toLocaleDateString()`) calls that rely on the runtime's default locale, which
differs between Vercel's server and a user's browser. Root-caused via `TimesheetSection.tsx`'s
`formatWeek`, which threw the exact hydration error the user reported. The same anti-pattern
exists in 10 other places — fixing all of them in one pass per the user's explicit choice
("sweep all files") rather than waiting for each to surface as its own bug report.

## Key decisions
- Fix: replace `[]` (or a missing locale arg) with the explicit `'en-AU'` locale, matching the
  convention already used everywhere else in this codebase (e.g. `ActivityFeed.tsx`'s own
  `toLocaleDateString('en-AU', ...)` two lines below the broken call, `ExportButton.tsx`'s own
  `fmtDate`, `session`/video-call formatters, etc.).
- Only the locale argument changes — the format options object (`{ hour: '2-digit', ... }` etc.)
  is untouched in every case.
- Out of scope: the separate `next-themes` script-tag console warning (user explicitly chose to
  leave that alone) and the Time page "additional hours" bugs (separate follow-up phase after this
  one).
- No spend: pure text find-and-replace, zero external calls.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Change ONLY the locale argument on each listed line. Do not touch anything else in these files.
- After the task, list every file changed.

## Rules for conductor (Claude)
- `pnpm run build` after the turn — must pass before committing.
- No manual browser step required — this is a mechanical, low-risk text change; the build gate is
  sufficient verification (TypeScript will catch any syntax slip).

---

## C-1 — Explicit `'en-AU'` locale on all default-locale date/time formatters

*Codex edits:*
- [x] `src/components/activity/ActivityFeed.tsx:68` — in `fmtTime`, change
  `d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`
- [ ] `src/components/calendar/DayPanel.tsx:9` — in `fmtTime`, change
  `new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`
- [ ] `src/components/chat/MessageThread.tsx:205` — change
  `{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` to
  `{new Date(m.created_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}`
- [ ] `src/components/reports/ReportsClient.tsx:28` — in `fmtTime`, change
  `new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`
- [ ] `src/components/time/TimesheetSection.tsx:39` — in `formatWeek`, change
  `new Date(\`${date}T00:00:00\`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })`
  to
  `new Date(\`${date}T00:00:00\`).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })`
- [ ] `src/components/time/TimesheetDetailModal.tsx:32` — in `fmtTs`, change
  `new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`
- [ ] `src/components/time/TimesheetDetailModal.tsx:35` — in `fmtWeek`, change
  `new Date(\`${date}T00:00:00\`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })`
  to
  `new Date(\`${date}T00:00:00\`).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })`
- [ ] `src/components/time/TimerWidget.tsx:22` — in `fmtTime`, change
  `new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`
- [ ] `src/components/time/TimeEntryList.tsx:28` — in `formatTime`, change
  `new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`
- [ ] `src/components/time/ManagerTimesheetView.tsx:32` — in `formatWeek`, change
  `new Date(\`${date}T00:00:00\`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })`
  to
  `new Date(\`${date}T00:00:00\`).toLocaleDateString('en-AU', { month: 'short', day: 'numeric', year: 'numeric' })`
- [ ] `src/components/time/ExportButton.tsx:35-37` — change:
  ```typescript
  new Date(e.started_at).toLocaleDateString(),
  new Date(e.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  new Date(e.ended_at!).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  ```
  to:
  ```typescript
  new Date(e.started_at).toLocaleDateString('en-AU'),
  new Date(e.started_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
  new Date(e.ended_at!).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
  ```
- [ ] `src/components/time/AdditionalHoursPanel.tsx:18` — in `fmt`, change
  `new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` to
  `new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })`

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Spot-check the diff: confirm only locale arguments changed, nothing else. (Two files needed
  a fixup turn — `apply_patch` reindented `MessageThread.tsx` and `ExportButton.tsx` on retry after
  an initial exact-match failure; fixed in a follow-up turn, verified clean.)
- [x] Commit: `git add src/components/activity/ActivityFeed.tsx src/components/calendar/DayPanel.tsx src/components/chat/MessageThread.tsx src/components/reports/ReportsClient.tsx src/components/time/TimesheetSection.tsx src/components/time/TimesheetDetailModal.tsx src/components/time/TimerWidget.tsx src/components/time/TimeEntryList.tsx src/components/time/ManagerTimesheetView.tsx src/components/time/ExportButton.tsx src/components/time/AdditionalHoursPanel.tsx && git commit -m "fix: hydration mismatch — explicit en-AU locale on default-locale date/time formatters"`

---

## Acceptance checklist
- [x] C-1: all 11 files use explicit `'en-AU'` locale, build passes clean, diff is locale-only

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean. No manual browser step required —
this is a mechanical text substitution; TypeScript/ESLint catch any syntax mistake, and the
original bug (visible hydration flash on the Time page) can be spot-checked next time that page
loads.
