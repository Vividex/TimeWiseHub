# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 2 (this figure covers per-turn API/build costs; the recurring Resend Pro
  subscription below is a separate, explicitly-approved ongoing cost, not drawn from this budget)
- Client email messaging (prior phase, code complete, C-8 not fully confirmed — see Notes): the
  "zero cost" assumption made during brainstorming turned out to be wrong. Resend's inbound
  receiving domain, as designed (`inbound.timewisehub.com.au`, a *second* domain), needs a Resend
  Pro upgrade (~$20/month) since the user's existing account is on the Free plan (1 domain, already
  used by the sending domain). User initially declined at the handover STEP 0 gate on 2026-07-04,
  then approved the $20/month after a cost/scaling discussion (2026-07-04): it's a flat
  platform-wide cost shared across every org on TimeWiseHub, not per-org/per-client, and the only
  further scaling risk is aggregate email volume exceeding Pro's 50,000/month allowance
  ($0.90/1,000 overage) — far from current usage. No SMS in this phase either way (explicitly
  deferred, its own future phase/cost approval).
- Dynamic Terminology — Clients section (current phase): zero cost — pure code, no schema
  changes, no external API calls, no new npm dependencies.
- Organisation Setup Wizard (prior phase, complete): zero cost — pure code, no schema changes
  (Phase 1's columns already cover everything needed), no external API calls, no new npm
  dependencies.
- Workspace Profile Engine (prior phase, complete): zero cost — pure code + one additive DB
  migration (two new columns × two tables), no external API calls, no new npm dependencies.
- Unread client messages (prior phase, complete): zero cost — pure code, reuses the existing
  `client_messages` table and Resend setup from the prior phase, one new column, one new
  security-definer RPC. No external API calls.
- Room chat + client delivery (prior phase, complete): zero cost — pure code + Supabase admin API
  calls (create user, generate link), no external paid API. No Daily.co/Resend usage in this
  phase.
- Dashboard "Today" section (prior phase, complete): zero cost — pure code, reuses existing
  Supabase reads only (`scheduled_calls`, `sessions`, `calendar_events`, `tasks`, `invoices`), no
  new tables, no external API.
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

## Notes (Dynamic Terminology — Clients Section) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-dynamic-terminology-clients-design.md
- Source plan: docs/superpowers/plans/2026-07-05-dynamic-terminology-clients.md
- Phase 3 of the Workspace Profile roadmap. The roadmap doc's Phase 3 in full ("Dynamic
  Terminology... refactor existing UI to consume the provider") is a 2,609-occurrence, 326-file
  effort (confirmed via audit) — this phase deliberately converts only the Clients section as a
  first vertical slice, not the full sweep. Sidebar nav labels are explicitly out of scope
  (roadmap's own Phase 4 owns that).
- `Terminology` changed shape from `Record<TerminologyKey, string>` to
  `Record<TerminologyKey, { singular: string; plural: string }>` — explicit plurals rather than
  guess-pluralizing at call sites. Safe change confirmed via audit: nothing outside
  `src/lib/workspace-profiles/` destructured the old shape.
- Two files not identified during brainstorming were found while reading the actual code:
  `clients/[id]/sessions/page.tsx` (the real parent of `NewSessionModal`, not `clients/[id]/page.tsx`
  as first assumed) and `EditClientButton.tsx` (pass-through wrapper around `EditClientModal`) —
  both folded into scope without a separate brainstorm/spec cycle since they're structurally
  necessary for the already-approved design to actually work.
- C-4's manual smoke test requires temporarily changing the real Vividex org's Industry via
  Settings (to "Tutoring & Education", to see "Student"/"Students" appear) then switching it back
  — must not leave the real account's industry changed after the phase completes.
- Codex handles text edits only; conductor runs all shell/build/git. No Supabase MCP calls needed
  this phase (no migration).
- **Found + fixed during C-4 manual testing (2026-07-05):** `DashboardShell.tsx`'s page-title
  header (top bar on every dashboard page) had its own hardcoded `PAGE_TITLES`/`getTitle()` lookup
  showing "Clients"/"Client" — missed by the original audit since it derives text from the URL
  pathname, not a literal string inside a Clients-section file. Fixed directly: `dashboard/layout.tsx`
  resolves `getWorkspaceProfileForUser` once and passes `clientLabel` down to `DashboardShell`.
  **Pattern worth remembering for future terminology-conversion phases:** any app-shell/layout
  component that derives page titles or labels from the route path (not literal per-page strings)
  is easy to miss during a file-by-file audit — check `DashboardShell.tsx` and similar shared
  layout components explicitly when scoping future terminology phases (Sessions, Programs,
  Projects), not just the section's own files.

## Notes (Organisation Setup Wizard) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-organisation-setup-wizard-design.md
- Source plan: docs/superpowers/plans/2026-07-05-organisation-setup-wizard.md
- Phase 2 of the Workspace Profile roadmap. An audit confirmed business hours, employee count,
  org-level currency, org-level date format, and org-level timezone all have zero current consumer
  anywhere in the app — deferred, not part of this phase. Only industry is genuinely new; org name
  and logo already have working homes (existing `/onboarding` page; `logo_url` already editable in
  Settings for both org and solo Pro).
- User explicitly chose a real multi-step wizard shell (not a single screen) despite there being
  only one real question today — deliberate, so future fields can slot in without restructuring.
  Fleshed out per user request with: a welcome step, an explicit "Not sure / Other" option (not
  buried — satisfied by preserving the registry's insertion order, `generic` is already first),
  and the choice stays editable later via Settings rather than being a wizard-only lock-in.
- Gate only ever applies to org owner/admin or solo Pro users — `organisations` UPDATE is
  RLS-restricted to owner/admin, so an employee redirected to `/setup` would just hit a permission
  error. Employees are never gated regardless of their org's `setup_completed` state.
- An org member's personal `profiles.workspace_profile` is never actually read by the resolver
  (org membership wins first) — so the Settings Industry picker in `AccountSettingsForm` is hidden
  entirely for org members (`showWorkspaceProfile = !membership?.org_id`), not just
  de-emphasized, to avoid a UI field that edits dead data.
- Completion copy deliberately doesn't oversell Phase 3 (dynamic terminology) since it doesn't
  exist yet — says the choice "shapes future features," not that anything visibly changes today.
- No DB migration this phase — Phase 1's schema already covers everything needed.
- Codex handles text edits only; conductor runs all shell/build/git. No Supabase MCP calls needed
  this phase (no migration).
- **Bug found + fixed during C-3 manual testing (2026-07-05):** `router.push(X); router.refresh()`
  in the same tick (a pattern already present in the pre-existing `/onboarding` page, harmless
  there since nothing on `/dashboard` depended on freshly-mutated data) raced against this phase's
  new conditional redirect on `/dashboard` (which now reads `setup_completed` right as it's being
  written by the wizard's Finish action) — produced a real `ERR_TOO_MANY_REDIRECTS` in the browser
  even though the DB write itself was correct both times (confirmed via SQL). Fixed by switching
  both `SetupWizard.tsx`'s Finish handler and `/onboarding`'s two buttons to a hard navigation
  (`window.location.href`) instead of push+refresh — guarantees a fresh request with no client
  router-cache involvement. **Pattern worth remembering:** any future phase that adds a conditional
  redirect gating a destination route should treat `push+refresh` immediately following a mutation
  of the very field that gate reads as a race risk, not a safe combo — prefer a hard navigation at
  that specific transition point.

## Notes (Workspace Profile Engine) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-workspace-profile-engine-design.md
- Source plan: docs/superpowers/plans/2026-07-05-workspace-profile-engine.md
- Phase 1 of a larger roadmap (`docs/superpowers/specs/TimeWiseHub_Development_Specification.docx`
  — moved here from `public/` where it was accidentally web-servable, never committed while there).
  Scope for the whole roadmap, decided during brainstorming: one product/brand (TimeWiseHub) for
  now, no separate branded products or industry landing pages (roadmap doc's Phase 7 + multi-brand
  endgame explicitly deferred). Driven by two real prospects (tutoring, personal training), not
  speculative — hence only those two profiles plus `generic` get real terminology; the other 7
  categories from the doc are stubbed to generic terminology until real demand exists.
  This document specs only Phase 1 (schema + registry + resolver, no UI changes). Phases 2-6
  (setup wizard, dynamic terminology in the UI, dynamic navigation, dashboard personalisation,
  dynamic tutorial) are each their own future brainstorm/spec/plan/handover cycle.
- User's explicit framing: "as uninvasive as possible... go slow, think carefully, design
  intentionally. we can always add later." Confirmed via audit that zero new RLS policies are
  needed (existing `organisations`/`profiles` UPDATE policies already cover any new column) and
  every existing row defaults to values that preserve today's behaviour exactly.
- `workspace_profile` is plain `text`, not a Postgres enum — the code registry
  (`src/lib/workspace-profiles/`) is the only source of truth for valid keys, matching how
  `NAV_GROUPS`/`TUTORIAL_STEPS` are already hardcoded TS, not DB-driven.
- Works for solo Pro users too (no organisation) — columns on both `organisations` and `profiles`,
  resolver checks org membership first, falls back to the user's own profile row. Matches the
  existing nullable-org_id dual-ownership pattern from `clients`/`client_messages`.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP. C-3's functional verification is a throwaway `npx tsx` script (scratchpad only,
  never committed, not a project dependency) since nothing in the existing UI calls the resolver
  yet — no test runner in this project either way.

## Notes (Client Email Messaging) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-04-client-email-messaging-design.md
- Source plan: docs/superpowers/plans/2026-07-04-client-email-messaging.md
- Raised as direct customer feedback: funnel all client communication through the app without the
  client needing an account. Scoped during brainstorming to: email only (SMS deferred, needs a new
  paid Twilio provider), one thread per client (not per session/invoice), new ad-hoc messages only
  (not retrofitting existing automated emails like invoice sends/reminders — separate follow-up).
- New `client_messages` table, no changes to existing `chat_*` infrastructure — deliberately NOT
  reusing the room-chat model, which requires an authenticated participant; a client here never
  touches the app at all.
- Reply routing: a per-client address `client-<clientId>@<RESEND_INBOUND_DOMAIN>` set as the
  `replyTo` on outbound sends (via the existing `sendEmail()` helper, unmodified). Resend's
  `email.received` webhook payload is metadata-only (no body) — the actual text requires a
  separate authenticated call to Resend's receiving-email API using the `email_id` from the
  webhook.
- Webhook signature verification uses Node's built-in `crypto` (Standard Webhooks spec: HMAC-SHA256
  over `${id}.${timestamp}.${rawBody}`, secret is `whsec_`-prefixed then base64-decoded) —
  deliberately not a new `svix`/`resend` npm dependency, matching this codebase's existing
  raw-fetch-only approach to Resend (`src/lib/email-notifications.ts` never used the `resend` SDK
  either).
- Task 7 (Resend receiving domain, DNS, webhook creation, signing secret) is manual and can only be
  done by the user — happens in parallel with Codex's C-1..C-6 turns, not blocking them. C-8 (the
  real send→reply round trip) can't be verified until C-7 is fully done and deployed, since
  webhooks need a public HTTPS URL.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- **Post-ship debugging (2026-07-04):** first live test showed the outbound email arriving from
  `noreply@timewisehub.com.au` despite inviting a reply — fixed by adding an optional `fromEmail`
  override to `sendEmail()` and a new `RESEND_MESSAGING_FROM_EMAIL=reply@timewisehub.com.au`
  (same already-verified sending domain, not the inbound receiving domain — that would need its
  own SPF/DKIM setup, unlike the MX-only records receiving needs). Then the reply itself never
  arrived — root-caused via Vercel logs + diagnostic instrumentation to `RESEND_WEBHOOK_SECRET`
  never actually being set in Vercel (only `.env.local` had it) — user added it, redeployed, fixed.
  **Update (2026-07-05): C-8 now confirmed working.** Two more bugs surfaced testing the fix:
  (a) the receiving-email API 401'd because `RESEND_API_KEY` is a `sending_access`-restricted key
  — reading a received email needs `full_access`, so a separate `RESEND_RECEIVING_API_KEY` was
  added rather than widening the send key's permissions app-wide; (b) that new key was pasted
  incorrectly into Vercel the first time ("API key is invalid") — regenerated and re-pasted
  correctly. After all three fixes, a real reply was confirmed landing in `client_messages`. C-8
  is genuinely done now. Known follow-up, not yet scoped: replies via Outlook include the entire
  quoted reply chain (`From:/Sent:/To:/Subject:` block + original message) in the stored body, not
  just the new text — flagged by the user, decision pending (small npm library vs hand-rolled
  regex heuristic), deliberately deferred until after the Unread Client Messages phase below.

## Notes (Unread Client Messages) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-04-unread-client-messages-design.md
- Source plan: docs/superpowers/plans/2026-07-04-unread-client-messages.md
- Raised directly by the user after confirming the notification-only visibility gap in the prior
  phase ("you shouldn't have to go looking for messages").
- Shared org-wide read state (not per-user) — confirmed during brainstorming, simpler and matches
  how `client_messages` itself already treats any org member as having equal access.
- New `get_unread_client_messages()` RPC takes no parameters, derives everything from `auth.uid()`
  — mirrors `get_chat_unread()`'s security pattern exactly, so it can never be called with a
  spoofed org/owner id to see another business's unread messages.
- Marking read uses the service-role client (not the caller's own session) because `clients`'
  UPDATE policy only covers owner/admin roles, while any org member can legitimately view a
  client's Messages page and should be able to mark it read — this is documented explicitly as a
  Global Constraint in the plan, not an oversight.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- Task 5 (manual verification) depended on the prior phase's C-8 — now confirmed working
  (2026-07-05, see note above), no longer a blocker.

## Notes (Dashboard "Today" Section) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-04-dashboard-today-section-design.md
- Source plan: docs/superpowers/plans/2026-07-04-dashboard-today-section.md
- No schema changes. New src/lib/today.ts (Sydney-aware day boundary helper — the existing
  server-local-timezone math was invisible across a 7-day window but wrong for a large fraction
  of the day once scoped to exactly today).
- C-4 manual verification was completed conversationally with the user on 2026-07-04, same
  pattern as the prior phase's C-11 — core flow confirmed live, full itemized sub-checklist not
  walked line-by-line.
- Two fixes/additions found during live testing, done directly by the conductor (not full Codex
  handover turns, small well-understood changes):
  (1) A session with its own linked video call (`scheduled_calls.session_id`, from the earlier
  "video chat in sessions" phase) was appearing twice — once as a session item, once as a
  standalone meeting. Fixed by embedding the linked call into the sessions query and filtering it
  out of the meetings list; the session row now shows both Join and View.
  (2) User asked for pending invoice approvals to also appear in this list rather than as their
  own separate dashboard section. Extracted the standalone `PendingApprovals` component's query
  into `src/lib/pending-approvals.ts`, deleted the component, added an approvals block to
  `DashboardUpcoming.tsx`. No pending-approval invoices existed in the DB to visually confirm at
  the time — the query logic is an unmodified extraction of the previously-working component.

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
