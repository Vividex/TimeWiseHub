# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript. Supabase apply_migration is free. No paid API calls expected.

## Notes (Phase 16 — Username & Nickname)
- Source of exact code: docs/superpowers/plans/2026-06-13-username-nickname.md.
  Each checklist item maps to a Task there; implement the code VERBATIM.
- Codex handles text edits only; conductor runs build/git/migration.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint). No test runner.
- The ONLY new npm dependencies allowed: `@dicebear/core` and `@dicebear/collection` (avatar builder). No others.
- Do NOT touch billing, payment, or Stripe code.
- Steps marked [CONDUCTOR] in spec.md are run by Claude, not Codex — Codex skips them by design.
- After Task 9 the build will temporarily fail (expected, fixed by Task 10). That is not a blocker.
- New/changed files are listed per-task in the plan's File map. Leave everything else untouched.
