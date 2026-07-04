# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 2
- Room chat + client delivery (prior phase, complete): zero cost — pure code + Supabase admin API
  calls (create user, generate link), no external paid API. No Daily.co/Resend usage in this
  phase.
- Dashboard "Today" section (current phase): zero cost — pure code, reuses existing Supabase reads
  only (`scheduled_calls`, `sessions`, `calendar_events`, `tasks`), no new tables, no external API.
- In-call program reference panel (prior phase, complete): zero cost — pure code, internal
  Supabase reads only, no external API calls.
- Time page additional hours fixes (prior phase, complete): zero cost — pure code, internal
  Supabase data only.
- Locale hydration fix (prior phase, complete): zero cost — pure text substitution, no external
  calls.
- Sessions this week (prior phase, complete): zero cost — pure code, internal Supabase reads only,
  no external API calls anywhere in this feature.
- Video chat in sessions (prior phase, complete): real cost during C-6 manual testing only — one
  Daily.co room + one Resend email. User approved 2026-07-02, same accepted pattern as the
  existing video feature. Implementation tasks C-1..C-5 were pure code, zero cost.
- Programs Phase 2 (prior phase, complete): Real Claude Haiku API calls happened during its C-6
  manual smoke test only — user approved 2026-07-01, same accepted cost pattern as session-notes/
  AI assistant.

## Notes (Room Chat + Client Delivery) [complete, kept for reference]
- C-11 (manual smoke test) was completed conversationally with the user on 2026-07-04 rather than
  through the loop — the core flow (staff + guest chat, live messages, share-to-chat, Call Chat
  review section, Team Chat exclusion) was confirmed working end to end. The full itemized C-11
  checklist (guest-no-email block, same-guest-rejoin dedup, etc.) was not walked line-by-line;
  flagging honestly rather than claiming exhaustive coverage.
- Same session surfaced and fixed 5 bugs beyond the original plan, each committed separately (done
  directly by the conductor as reactive fixes during manual testing, not planned handover turns):
  (1) `GuestJoinClient.tsx` verifyOtp call mixed `email` + `token_hash` — GoTrue rejects that
  combination outright, guest chat sign-in never worked before this fix; (2) `CallRoom.tsx` had no
  top safe-area padding, hiding buttons under a phone's notch/status bar; (3) shared program files
  posted as a raw expiring URL instead of a real attachment — schema-079 added a `bucket` column
  to `chat_attachments` plus two new API routes so shared files render/download like normal
  attachments and never expire; (4) guest chat accounts (real Supabase auth users) could reach the
  internal `/dashboard` after leaving a call — fixed via an `app_metadata` gate in
  `dashboard/layout.tsx` plus signing guests out to a new `/call-ended` page; (5) session-chat
  messages were leaking into the Team Chat unread badge — fixed via schema-080 +
  `ChatRealtimeProvider.tsx`.
- Source spec: docs/superpowers/specs/2026-07-03-room-chat-client-delivery-design.md
- Source plan: docs/superpowers/plans/2026-07-03-room-chat-client-delivery.md
- Phase 2 of Programs-in-Sessions integration (Phase 1 = In-Call Program Reference Panel, below).
- Guest identity: ONE real admin-created profiles row per client (clients.guest_chat_user_id),
  reused forever — NOT Supabase anonymous auth (profiles.email is NOT NULL, blocks it), NOT a
  fresh account per call (chat_messages.sender_id -> profiles has no cascade delete, so a
  disposable account can never actually be deleted once it's sent a message).
  Sign-in: admin.generateLink({type:'magiclink'}) -> hashed_token handed to the guest's browser ->
  client-side verifyOtp({type:'email'}) — no email ever sent.
  Isolation: this profile has zero organisation_members rows, so the pervasive org-membership-gated
  RLS convention already blocks it from seeing anything else in the app.
- chat_conversations gets a new type='session' value + session_id column. Reuses
  send_chat_message RPC / /api/chat/send / chat-attachments storage / MessageComposer /
  AttachmentChip / ChatMessage type completely unmodified — only can_post_chat() needed a new
  branch (session behaves like dm: any participant may post).
- Two panels from Phase 1 (transcript, program) refactored into one shared tabbed shell
  (CallPanel) so Chat has somewhere to live without a third competing slide-in panel.
  ProgramReferencePanel is now content-only (no own header/close), gained a sessionChat prop for
  the share-to-chat action.
- Session-type conversations excluded from the normal Team Chat inbox query
  (ChatRealtimeProvider.loadConversations) — reachable only via the session page (SessionCallChat,
  read-only) and the live call.
- Share-to-chat posts a message with a link (or note text) — never copies the file into chat's own
  storage bucket.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP. The enum-value migration (schema-077) MUST be applied and committed before the
  structural migration (schema-078) that references it — separate apply_migration calls.

## Notes (In-Call Program Reference Panel) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-03-in-call-program-reference-panel-design.md
- Source plan: docs/superpowers/plans/2026-07-03-in-call-program-reference-panel.md
- Staff-only, screen-shared to "show" the client — no client-facing code this phase. Delivering
  files/links directly to a client is a separate, larger future phase, explicitly deferred (see
  memory: project-programs-in-sessions-integration).
- Guest isolation is structural: only the internal `/dashboard/video/[roomId]/page.tsx` route
  fetches `linkedProgram`; the `/join/[guestToken]` route never does, so there's no server data to
  leak even if client code were inspected.
- New `ProgramReferencePanel.tsx` does NOT reuse `CategoryTree`/`AssetGrid` (too wide for a narrow
  slide-in panel) — flat list + optional category dropdown instead.
- Program panel and the existing transcript panel share the same screen position — mutually
  exclusive via state (opening one closes the other).
- No schema changes, no new npm dependencies, no spend.

## Notes (Time Page — Additional Hours Fixes) [complete, kept for reference]
- No source spec/plan — two small, already root-caused bug fixes, implemented directly.
- C-1: `dashboard/time/page.tsx`'s top cards treated roster hours and time_entries hours as
  mutually exclusive for roster-managed orgs, silently dropping additional-hours entries. Fix:
  add them together (mirrors the pre-existing `timeEntrySeconds + rosterSeconds` pattern that used
  to live in the old dashboard "Hours this week" calc).
- C-2: `AdditionalHoursPanel.tsx`'s entry list never showed which day an entry was for, only the
  time range. Fix: new `fmtDate()` helper, `'en-AU'` locale (same convention just standardized
  across the codebase in the prior phase).

## Notes (Locale Hydration Fix) [complete, kept for reference]
- No source spec/plan — small, well-understood bug fix, root-caused directly rather than run
  through brainstorming/writing-plans (11 files, one mechanical change each).
- Root cause: `toLocaleDateString([]/toLocaleTimeString([]` (and one bare `toLocaleDateString()`)
  let the runtime pick the default locale, which differs between Vercel's server and a user's
  browser, causing React hydration mismatches. Fix: explicit `'en-AU'`, matching the convention
  already used elsewhere in this codebase.
- User explicitly chose to sweep all 11 occurrences in one pass rather than fix only the one that
  was actively erroring (`TimesheetSection.tsx`'s `formatWeek`).
- Explicitly NOT touching: the separate `next-themes` script-tag console warning (upstream/
  unmaintained library issue, confirmed via web search as a known false-positive — user chose to
  leave it alone) and the Time page "additional hours" bugs (queued as the next phase after this).

## Notes (Sessions This Week) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-02-sessions-this-week-design.md
- Source plan: docs/superpowers/plans/2026-07-02-sessions-this-week.md
- No schema changes. Shared `getWeekBounds()` helper in src/lib/week.ts replaces the inline
  Monday-start-of-week math that used to live only in dashboard/page.tsx.
- "This week" (tile + page section) = any session status, [weekStart, weekEnd). "Scheduled"
  section on the new page = status='scheduled' AND scheduled_at >= weekEnd, uncapped.
- hoursThisWeek and its supporting time_entries/roster_shifts queries are removed entirely (dead
  code once the tile changes) — not left stranded.
- No inline session-creation form on the new /dashboard/sessions page — sessions are always
  created from a specific client's context, unchanged.
- Codex handles text edits only; conductor runs all shell/build/git (no DB migration this phase).

## Notes (Video Chat in Sessions) [complete, kept for reference]
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
