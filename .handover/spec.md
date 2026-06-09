# Phase 14 — Client Sessions & Progress Notes

## Goal
Build sessions, session to-do lists, client templates, and progress notes under the client portal,
with calendar integration and AI assistant control.

## Source plan
`docs/superpowers/plans/2026-06-10-client-sessions-progress-notes.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx/.sql).
- **Conductor**: applies SQL migrations via Supabase MCP `apply_migration`; runs all shell (`pnpm run build`, `git`); verifies diffs; ticks boxes; commits.

## Acceptance checklist

### Task C1 — DB Migration
- [x] C1-1: Write `supabase/schema-039-client-sessions.sql` (4 tables: sessions, session_todos, client_session_templates, progress_notes + RLS)
- [x] C1-2: Apply migration in Supabase (conductor runs via Supabase MCP or SQL Editor)
- [x] C1-3: Commit schema file

### Task C2 — Client Detail Page Redesign
- [x] C2-1: Create `src/components/clients/NewSessionModal.tsx`
- [x] C2-2: Create `src/components/clients/AddProgressNote.tsx`
- [x] C2-3: Replace `src/app/dashboard/clients/[id]/page.tsx` with sessions list + progress notes feed + collapsible financials
- [x] C2-4: Build check (`pnpm run build`)
- [x] C2-5: Commit C2 files

### Task C3 — Session Detail Page
- [x] C3-1: Create `src/app/dashboard/clients/[id]/sessions/[sessionId]/page.tsx`
- [x] C3-2: Create `src/components/clients/SessionDetailClient.tsx` (inline editing, todo checkboxes, debounced notes, save-as-template)
- [x] C3-3: Build check (`pnpm run build`)
- [x] C3-4: Commit C3 files

### Task C4 — Calendar Integration
- [x] C4-1: Add `Session` type + `'session'` to CalendarItem union + `sessions` param to `buildItems` in `src/components/calendar/CalendarView.tsx`
- [x] C4-2: Add session navigation (Link wrapper) to `src/components/calendar/DayPanel.tsx`
- [x] C4-3: Add sessions query + pass to `<CalendarView>` in `src/app/dashboard/calendar/page.tsx`
- [x] C4-4: Build check (`pnpm run build`)
- [x] C4-5: Commit C4 files

### Task C5 — AI Assistant Tools
- [x] C5-1: Add `get_sessions`, `get_progress_notes` to READ_TOOLS; add 5 write tools to WRITE_TOOLS in `src/lib/assistant/tools.ts`
- [x] C5-2: Append 7 tool schemas to `TOOL_SCHEMAS` in `src/lib/assistant/tools.ts`
- [x] C5-3: Add `get_sessions` + `get_progress_notes` cases to `executeReadTool` in `src/lib/assistant/tools.ts`
- [x] C5-4: Add 5 write executor cases to `src/lib/assistant/write-executors.ts`
- [x] C5-5: Add 5 new entries to `TOOL_LABELS` in `src/components/assistant/ActionCard.tsx`
- [x] C5-6: Build check (`pnpm run build`)
- [x] C5-7: Commit C5 files

## Verification
After each item: `pnpm run build` must pass clean (runs tsc + eslint).
Final smoke: sessions on client detail page; session detail inline editing; calendar teal items; AI `get_sessions` returns data; `create_session` shows confirmation card.

## Out of scope
- Deleting sessions/notes via AI (too destructive)
- Real-time updates / subscriptions
- No new npm dependencies
- No billing/Stripe/auth changes
