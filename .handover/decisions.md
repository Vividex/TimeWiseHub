# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is TypeScript/TSX edits only. No paid API calls. No DB migrations.

## Notes (Phase 18 — Role Clarity, Business Rename, Manager Task Retrieval)
- Source of exact code: docs/superpowers/plans/2026-06-14-role-clarity-business-rename.md.
  Each checklist item maps to a Task there; implement the code VERBATIM.
- Codex handles text edits only; conductor runs build/git.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint). No test runner.
- No new npm dependencies needed for this phase.
- The internal plan key 'team' and STRIPE_TEAM_PRICE_ID are NEVER renamed — only display labels change.
- isTeamPlan() function name is NEVER renamed.
- Steps marked [CONDUCTOR] in spec.md are run by Claude, not Codex — Codex skips them by design.
- New/changed files are listed per-task in the plan. Leave everything else untouched.
