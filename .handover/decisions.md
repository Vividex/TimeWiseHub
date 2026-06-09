# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is SQL + TypeScript. Supabase apply_migration is free. No paid API calls expected.
- The ANTHROPIC_API_KEY is already set in the environment; the new route USES it at runtime
  but does not call it during build — no build-time spend.

## Notes (Phase 13 — AI Assistant)
- Source of exact code: docs/superpowers/plans/2026-06-09-ai-assistant.md. Each checklist
  item maps to a numbered Task there; implement that task's code verbatim.
- Apply the DB migration using the Supabase MCP apply_migration tool (name: assistant_sessions).
  Conductor runs this — not Codex.
- Codex handles text edits only; conductor runs build/git and apply_migration.
- pnpm is the package manager. Verification gate = `pnpm run build` (runs tsc + eslint).
  No test runner.
- Do NOT add npm dependencies. The Anthropic SDK (@anthropic-ai/sdk) is already installed.
- Do NOT touch billing, payment, auth, or Stripe code.
- Confine changes to:
    supabase/schema-038-assistant-sessions.sql
    src/lib/assistant/tools.ts
    src/lib/assistant/write-executors.ts
    src/app/api/assistant/route.ts
    src/app/api/assistant/execute/route.ts
    src/components/assistant/ActionCard.tsx
    src/components/AssistantWidget.tsx
    src/app/dashboard/assistant/page.tsx
    src/components/assistant/AssistantPageClient.tsx
    src/components/FloatingWidgets.tsx
    src/app/dashboard/layout.tsx
    src/components/DashboardShell.tsx
    src/components/chat/TeamChatWidget.tsx
    src/hooks/useVoice.ts
    GOALS.md (final item only)
  Leave everything else untouched.
- The ChatRealtimeProvider context (useChat, useChatUnreadTotal) is already available —
  TeamChatWidget can import from @/components/chat/ChatRealtimeProvider directly.
- MessageThread and MessageComposer are already in src/components/chat/ — reuse them in
  TeamChatWidget exactly as shown in the plan.
