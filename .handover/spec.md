# Phase 13 — AI Assistant

## Goal
Evolve the existing help widget into a full AI agent: Anthropic tool use, read + write tools with confirmation cards, full-page view with persistent sessions, floating widget stack (AI + team chat), and browser-native voice mode.

## Source plan
`docs/superpowers/plans/2026-06-09-ai-assistant.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: applies SQL migrations via Supabase MCP `apply_migration`; runs all shell (`pnpm run build`, `git`); verifies diffs; ticks boxes; commits.

## Acceptance checklist

- [x] C1: DB migration — create `supabase/schema-038-assistant-sessions.sql` and apply via Supabase MCP (Task 1 in plan)
- [x] C2: Tool schemas + read executors — create `src/lib/assistant/tools.ts` (Task 2)
- [x] C3: Write executors — create `src/lib/assistant/write-executors.ts` (Task 3)
- [x] C4: Upgraded API route — replace `src/app/api/assistant/route.ts` with tool-use + action sentinel (Task 4)
- [x] C5: Execute route — create `src/app/api/assistant/execute/route.ts` (Task 5)
- [x] C6: ActionCard component — create `src/components/assistant/ActionCard.tsx` (Task 6)
- [x] C7: Upgraded AssistantWidget — replace `src/components/AssistantWidget.tsx` with Sparkles icon + tool use + open/onClose props (Task 7)
- [x] C8: Full-page assistant — create `src/app/dashboard/assistant/page.tsx` + `src/components/assistant/AssistantPageClient.tsx` (Task 8)
- [x] C9: FloatingWidgets + layout + nav — create `src/components/FloatingWidgets.tsx`, update `src/app/dashboard/layout.tsx` + `src/components/DashboardShell.tsx` (Task 9)
- [x] C10: TeamChatWidget — create `src/components/chat/TeamChatWidget.tsx`, replace placeholder in FloatingWidgets (Task 10)
- [x] C11: Voice hook — create `src/hooks/useVoice.ts` (Task 11)
- [ ] C12: Wire voice — update `src/components/AssistantWidget.tsx` + `src/components/assistant/AssistantPageClient.tsx` with mic/speaker controls (Task 12)

## Verification
After each item: `pnpm run build` must pass clean.
Final smoke: floating widgets stacked bottom-right; AI assistant reads tasks; write action shows confirmation card; team chat widget lists conversations; `/dashboard/assistant` full-page loads with session sidebar; voice mic/speaker controls present.

## Out of scope
- Deleting records via AI (too destructive)
- Multi-currency, SSO, white-label
- No new npm dependencies (Anthropic SDK already installed)
- No billing/Stripe/auth changes
