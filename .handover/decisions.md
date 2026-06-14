# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is TypeScript/TSX/SQL text edits only. No paid API calls.
- Supabase MCP `apply_migration` is free (uses existing project quota).

## Notes (Phase 19 — Avatar Removal + Legal Pages)
- Source of exact code: docs/superpowers/plans/2026-06-14-avatar-removal-and-legal-pages.md.
  Each checklist item maps to a Task there; implement the code VERBATIM.
- Codex handles text edits only; conductor runs build/git/MCP.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint). No test runner.
- DB migration: conductor applies via Supabase MCP after Codex creates the SQL file.
- `git rm` for AvatarBuilder.tsx is a conductor step (shell command).
- `pnpm remove @dicebear/core @dicebear/collection` is a conductor step.
- Steps marked [CONDUCTOR] in spec.md are run by Claude, not Codex — Codex skips them by design.
- New/changed files are listed per-task in the plan. Leave everything else untouched.
