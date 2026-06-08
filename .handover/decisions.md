# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript. Supabase apply_migration is free. No paid API calls expected.

## Notes (Phase 12 — team chat)
- Source of exact code: docs/superpowers/plans/2026-06-08-team-chat.md. Each checklist
  item maps to a numbered Task there; implement that task's code verbatim.
- Apply the two DB migrations using the Supabase MCP apply_migration tool.
  Migration names: chat_core (schema-036), chat_storage (schema-037). Conductor runs these.
- The Supabase MCP apply_migration may require confirmation — conductor handles it.
- Codex handles text edits only; conductor runs build/git and apply_migration.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint).
  No test runner. Final two-account manual smoke per plan Task 18.
- Do NOT add npm dependencies. Do NOT touch billing, payment, auth, or Stripe code.
- Confine changes to: supabase/schema-036-chat.sql, supabase/schema-037-chat-storage.sql,
  src/lib/chat/*, src/app/api/chat/*, src/components/chat/*, src/app/dashboard/chat/page.tsx,
  and the named modifications to src/app/dashboard/layout.tsx, src/components/DashboardShell.tsx,
  public/sw.js, src/components/AccountSettingsForm.tsx, GOALS.md. Leave everything else untouched.
- This phase ADDS new objects/policies; it does not replace existing RLS (unlike Phase 5.5b).
- Privacy-critical: the chat_messages realtime + is_chat_participant RLS must not leak
  messages to non-participants. Conductor scrutinises C1 and the final smoke for this.
