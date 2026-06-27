# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 0
- All work is TypeScript/TSX/SQL text edits + shell commands on existing toolchain.
- @anthropic-ai/sdk is already installed — no new npm packages needed.
- The Claude API call inside the summarise route is a production feature, not a loop spend.
- No paid API calls during the implementation loop itself.

## Notes (Phase 26 — Session Notes)
- Source spec: docs/superpowers/specs/2026-06-27-session-notes-design.md
- Codex handles text edits only; conductor runs all shell/build/git commands and applies the DB migration via Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only.
- The Supabase `as unknown as T` cast pattern is required for FK join types — Codex must follow this convention (see CLAUDE.md).
- Migration must be applied via Supabase MCP (`apply_migration`) — not via Supabase CLI.
- Daily.co transcription events: `transcription-message` gives `{ participantId, text, timestamp }`. Speaker name via `frame.participants()[participantId]?.user_name`.
- ANTHROPIC_API_KEY is already in the Vercel env (used by existing AI assistant feature).
