# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- No new npm packages this phase. No paid API calls during the implementation loop.

## Notes (Programs Phase 4 — Link a Program to a Session)
- Source spec: docs/superpowers/specs/2026-07-01-programs-phase4-session-link-design.md
- Source plan: docs/superpowers/plans/2026-07-01-programs-phase4-session-link.md
- No new npm packages, no DB RLS changes — one nullable `program_id` column on `sessions`.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only.
- Session mutations go through the direct browser Supabase client, matching the existing
  SessionDetailClient.tsx pattern — no new API route, no new client-side role gating (RLS-only,
  consistent with how Delete Session/todo edits already work in that file).
- CategoryTree/AssetGrid are reused unmodified with canManage={false} for the read-only drawer.
- Program picker filters GET /api/programs results client-side to org_id === session.org_id.
