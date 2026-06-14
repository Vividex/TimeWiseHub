# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is TypeScript/TSX/SQL text edits only. No paid API calls.
- Supabase MCP `apply_migration` is free (uses existing project quota).

## Notes (Phase 20 — Roster-Driven Timesheets + Recurring Roster + Pay Week Config)
- Source of exact code: docs/superpowers/plans/2026-06-14-roster-driven-timesheets.md.
  Each checklist item maps to a Task there; implement the code VERBATIM.
- Migration numbers in the plan were corrected: 050→051, 051→052, 052→053 (schema-050 is taken by Phase 19).
- Codex handles text edits only; conductor runs build/git/MCP.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint). No test runner.
- RLS is pre-built into the SQL files — do not add extra policies.
- `day_of_week` uses 0–6 JS `getUTCDay()` convention (not ISO 1–7). DO NOT change this.
- The cron secret DB setup (C17-2) must happen BEFORE applying schema-053 migration.
  Conductor will run: `alter database postgres set app.cron_secret = '<value>'; select pg_reload_conf();`
- Steps marked [CONDUCTOR] in spec.md are run by Claude, not Codex — Codex skips them by design.
- New/changed files are listed per-task in the plan. Leave everything else untouched.
- Tasks 3–11 are all committed together in C12-1 (one big build + commit after all are done).
- Tasks 13–15 are committed together in C16-1.
