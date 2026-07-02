# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 2
- Video chat in sessions (current phase): real cost during C-6 manual testing only — one Daily.co
  room + one Resend email. User approved 2026-07-02, same accepted pattern as the existing video
  feature. Implementation tasks C-1..C-5 are pure code, zero cost.
- Programs Phase 2 (prior phase, complete): Real Claude Haiku API calls happened during its C-6
  manual smoke test only — user approved 2026-07-01, same accepted cost pattern as session-notes/
  AI assistant.

## Notes (Video Chat in Sessions)
- Source spec: docs/superpowers/specs/2026-07-02-video-chat-in-sessions-design.md
- Source plan: docs/superpowers/plans/2026-07-02-video-chat-in-sessions.md
- scheduled_calls.session_id (nullable FK, on delete set null) + reminder_1hour_sent boolean.
- New route mirrors POST /api/video/schedule almost exactly (same Daily.co call, same invite
  email template/sender), auto-filled from the session, always exactly one invitee (the client).
- Same isTeamPlan(sub) Business-plan gate as the existing schedule route.
- No client email on file -> scheduling blocked with a clear message, no call created.
- 1-hour reminder is a third block on the existing /api/notifications/upcoming cron (55-65 min
  window) — no new cron, reuses existing push/email branching exactly.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration.

## Notes (Programs Phase 2 — AI Summarisation) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-01-programs-phase2-ai-summarisation-design.md
- Source plan: docs/superpowers/plans/2026-07-01-programs-phase2-ai-summarisation.md
- Only note/image/pdf get summarised; everything else stays ai_status='skipped' unchanged.
- Reuses existing Anthropic client/model exactly (claude-haiku-4-5-20251001, ANTHROPIC_API_KEY
  already in env) — no new npm dependency, image/document content blocks natively supported by
  installed SDK ^0.100.1.
- Fire-and-forget trigger from AssetUploadZone.tsx after eligible uploads — genuine separate HTTP
  request, not an in-process fire-and-forget inside another serverless function.
- Codex handles text edits only; conductor runs all shell/build/git.

## Notes (Recurring Sessions) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-01-recurring-sessions-design.md
- Source plan: docs/superpowers/plans/2026-07-01-recurring-sessions.md
- One new table session_series + sessions.series_id (nullable FK, mirrors program_id pattern).
- Buffer fixed at 8 upcoming occurrences per active series; intervals weekly/fortnightly/monthly
  only; series run indefinitely until explicitly cancelled.
- Cancelling deletes status='scheduled' rows in the series EXCEPT the session the user clicked
  "Stop recurring" from (passed as keepSessionId) — completed sessions and the originating
  session are both untouched. Revised from the original "delete all scheduled" design after
  manual testing showed cancelling from a session deleted that very session, 404-ing the page.
- A session only ever starts one series in its lifetime (no "Make recurring" after cancellation).
- Deliberate exception: recurring-series operations go through new server-side API routes (using
  the service client), unlike plain session creation which stays client-side (NewSessionModal.tsx
  unchanged for "Does not repeat") — justified because the daily cron needs the exact same
  generation logic server-side.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only.

## Notes (Programs Phase 3 — Template Builder) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-01-programs-phase3-templates-design.md
- Source plan: docs/superpowers/plans/2026-07-01-programs-phase3-templates.md
- No new npm packages, no new tables — one boolean column `programs.is_template`.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only.
- Templates are edited via the existing ProgramExplorer — no new authoring UI.
- Duplicate endpoint copies category tree + note/link assets only; never copies file-based assets
  (avoids Storage duplication cost and a shared-storage_path delete hazard).
- Duplicating requires only view access to the source program (owner or org member).
- GET /api/programs defaults to is_template=false when no query param given — Phase 4's
  session-link picker and the dashboard's existing programs list must be unaffected.

## Notes (Programs Phase 4 — Link a Program to a Session) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-01-programs-phase4-session-link-design.md
- Source plan: docs/superpowers/plans/2026-07-01-programs-phase4-session-link.md
- Session mutations go through the direct browser Supabase client, matching the existing
  SessionDetailClient.tsx pattern — no new API route, no new client-side role gating (RLS-only,
  consistent with how Delete Session/todo edits already work in that file).
- CategoryTree/AssetGrid are reused unmodified with canManage={false} for the read-only drawer.
- Program picker filters GET /api/programs results client-side to org_id === session.org_id.
