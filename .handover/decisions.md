# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript. Supabase apply_migration is free. No paid API calls expected.
- The ANTHROPIC_API_KEY is already set in the environment; the new route USES it at runtime
  but does not call it during build — no build-time spend.

## Notes (Phase 15 — Navigation & Client Drill-Down Redesign)
- Source of exact code: docs/superpowers/plans/2026-06-10-navigation-client-drilldown-redesign.md.
  Each checklist item maps to a Task there; implement the code VERBATIM.
- No DB migration this phase (no schema changes).
- Codex handles text edits only; conductor runs build/git.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint). No test runner.
- Do NOT add npm dependencies.
- Do NOT touch billing, payment, auth, or Stripe code.
- Do NOT drop the manager unassigned-task pool — it must survive into Home (Task 13).
- Where the plan says "read ProjectForm / extract panel bodies / recover the pool",
  Codex reads the referenced existing file and follows the explicit instruction; never
  silently omit a capability.
- New/changed files are listed per-task in the plan's File map. Leave everything else untouched.
