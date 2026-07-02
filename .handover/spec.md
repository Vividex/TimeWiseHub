# Time Page — Additional Hours Fixes

## Goal
Fix two bugs on the Time page (`/dashboard/time`) for roster-managed (Business plan) orgs:
1. The top summary cards (`TimeSummary`) only show rostered-shift hours and silently drop any
   "additional hours" logged via `AdditionalHoursPanel`.
2. The "Additional hours this week" list shows only a time range, never the date the hours were
   worked, making entries from different days indistinguishable.

## Key decisions
- Root cause 1: `src/app/dashboard/time/page.tsx:97-98` treats roster hours and `time_entries`
  hours as mutually exclusive alternatives (`rosterManaged ? rosterSeconds : entrySeconds`) instead
  of additive. For roster-managed orgs, `TimeSection.tsx` hides the timer/manual-entry UI entirely
  and renders only `AdditionalHoursPanel` — so every `time_entries` row for those users already
  represents hours worked *on top of* their roster, not an alternative to it. This exactly mirrors
  the old dashboard "Hours this week" calc (`timeEntrySeconds + rosterSeconds`, removed in the
  Sessions This Week phase since that tile no longer needs it) — same addition, different call
  site.
- Fix 1: change both lines to add roster and entry seconds together when `rosterManaged`.
- Root cause 2: `AdditionalHoursPanel.tsx`'s `fmt()` helper only calls `toLocaleTimeString` — no
  date is ever rendered in the list, regardless of which day an entry falls on.
- Fix 2: add a `fmtDate()` helper (matching the `'en-AU'` locale convention used throughout this
  codebase, including the just-fixed `fmt()` in this same file) and prepend the date to each list
  row, before the existing time range.
- No source spec/plan — both are small, well-understood, already root-caused bug fixes; going
  straight to implementation rather than running brainstorming/writing-plans for a two-line and a
  four-line change.
- No spend: pure code, internal Supabase data only.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Change ONLY what's specified per task. Do not touch unrelated code.
- After each task, list the files changed.

## Rules for conductor (Claude)
- `pnpm run build` after each turn — must pass before committing.
- C-3 needs a manual browser check (roster-managed org, log some additional hours, confirm the
  top cards include them and the list shows dates) before ticking it done.

---

## C-1 — Top summary cards include additional hours for roster-managed orgs

*Codex edits:*
- [x] Read `src/app/dashboard/time/page.tsx` first, then change:
  ```typescript
  const todaySeconds = rosterManaged ? rosterTodaySeconds : entryTodaySeconds
  const weekSeconds = rosterManaged ? rosterWeekSeconds : entryWeekSeconds
  ```
  to:
  ```typescript
  const todaySeconds = rosterManaged ? rosterTodaySeconds + entryTodaySeconds : entryTodaySeconds
  const weekSeconds = rosterManaged ? rosterWeekSeconds + entryWeekSeconds : entryWeekSeconds
  ```
  Nothing else in this file changes — `rosterTodaySeconds`, `entryTodaySeconds`,
  `rosterWeekSeconds`, and `entryWeekSeconds` are all already computed a few lines above this.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/dashboard/time/page.tsx && git commit -m "fix: time page — top summary cards now include additional hours for roster-managed orgs"`

---

## C-2 — Additional hours list shows the date worked

*Codex edits:*
- [x] Read `src/components/time/AdditionalHoursPanel.tsx` first, then:
  - Add a new helper directly after the existing `fmt` function (around line 17-19):
    ```typescript
    function fmtDate(iso: string) {
      return new Date(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    }
    ```
  - In the entry list render (around line 194-198), change:
    ```typescript
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {fmt(e.started_at)}–{fmt(e.ended_at)}
      {e.duration_seconds ? ` · ${fmtDuration(e.duration_seconds)}` : ''}
      {e.description ? ` · ${e.description}` : ''}
    </p>
    ```
    to:
    ```typescript
    <p className="text-xs text-slate-500 dark:text-slate-400">
      {fmtDate(e.started_at)} · {fmt(e.started_at)}–{fmt(e.ended_at)}
      {e.duration_seconds ? ` · ${fmtDuration(e.duration_seconds)}` : ''}
      {e.description ? ` · ${e.description}` : ''}
    </p>
    ```
  Nothing else in this file changes.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/time/AdditionalHoursPanel.tsx && git commit -m "fix: time page — additional hours list shows the date worked"`

---

## C-3 — Manual verification

*Conductor + user:*
- [ ] `pnpm run build` — final clean check.
- [ ] Manual browser check (roster-managed/Business-plan org, no test runner):
  1. Log an additional-hours entry via `AdditionalHoursPanel` on `/dashboard/time`.
  2. Confirm the top "Today"/"This week" summary cards increase to include it (on top of any
     rostered-shift hours already counted).
  3. Confirm the "Additional hours this week" list shows the date (e.g. "Mon 29 Jun") alongside
     the existing time range for each entry.
- [ ] Report pass/fail; fix inline if something's off before finishing.

---

## Acceptance checklist
- [x] C-1: top summary cards additively include roster + additional hours for roster-managed orgs
- [x] C-2: additional-hours list shows the date worked
- [ ] C-3: manual verification passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. Manual browser
check required for C-3 (no test runner in this project) — needs a roster-managed org to see the
affected code path.
