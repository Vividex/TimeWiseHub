# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 2 (this figure covers per-turn API/build costs; the recurring Resend Pro
  subscription below is a separate, explicitly-approved ongoing cost, not drawn from this budget)
- Session-Scheduled Client Email (current phase): zero cost — pure code, no schema change, no new
  npm dependencies, reuses the existing Resend/Client-Email-Messaging infrastructure and branding
  helpers already paid for.
- Subjects Folder Navigation + Search (inserted mid-loop, C-4.5, complete): zero cost — pure code,
  no schema change, no new dependencies, reuses existing RLS/access boundaries exactly.
- Program-Subjects Content Linking (complete, C-7 through C-11): zero cost — pure code + one
  additive DB migration (one nullable FK column), no new dependencies, reuses the existing
  WorksheetAnnotator/WorksheetAnnotatorModal components and topic-access authorization pattern
  exactly.
- Desktop App Auto-Hiding Title Bar (current phase, C-1): zero cost — pure code, no schema change,
  no new dependencies (`@tauri-apps/api` already installed), Windows-only this pass.
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
- Collaborative Worksheet Annotation (current phase): zero direct cost — pure code + one additive
  DB migration (one new table, one new function, one new storage bucket + policies). Two new npm
  dependencies (`react-pdf`, `perfect-freehand`), both free/open-source (MIT), no ongoing cost —
  confirmed with the user during planning. Supabase Realtime Broadcast and Storage usage are both
  already-paid-for parts of the existing plan, same as other features. No external paid API calls.
- Tutoring Progress Reports to Parents (prior phase, complete): zero cost — pure code + one additive DB
  migration (two new nullable columns on an existing table), reuses the existing Resend email
  infrastructure already paid for, no external API calls, no new npm dependencies.
- Tutoring Topic File Uploads (prior phase, complete): zero direct cost — pure code + one additive
  DB migration (new bucket, new table) + Supabase Storage usage (file storage volume/egress on the
  existing plan, no new paid service). No AI summarization this phase (explicitly deferred), so no
  Claude API cost either.
- Tutoring Year Group/Subject/Topic Structure (prior phase, complete): zero cost — pure code + one
  additive/destructive DB migration (two new tables, drop `students.subjects`/`sessions.subject`,
  add `sessions.year_group`/`subject_id`/`topic_id`), no external API calls, no new npm
  dependencies.
- Tutoring Subject Tagging (prior phase, complete, superseded by this phase): zero cost — pure code
  + one additive/destructive DB migration (drop `students.subject`, add `students.subjects`
  backfilled from it, add `sessions.subject`), no external API calls, no new npm dependencies.
- Tutoring Per-Lesson Billing (prior phase, complete): zero cost — pure code + one additive DB
  migration (two new nullable columns, one index), no external API calls, no new npm dependencies.
- Tutoring Student Entity (prior phase, complete): zero cost — pure code + one additive DB
  migration (one new table, one new nullable column), no external API calls, no new npm
  dependencies.
- Dynamic Navigation Engine (prior phase, complete): zero cost — pure code, no schema changes, no
  external API calls, no new npm dependencies.
- Dynamic Terminology — Clients section (prior phase, complete): zero cost — pure code, no schema
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

## Notes (Session-Scheduled Client Email) [current phase]
- Source spec: docs/superpowers/specs/2026-07-09-session-scheduled-client-email-design.md
- Source plan: docs/superpowers/plans/2026-07-09-session-scheduled-client-email.md
- Direct feature request: clients should get an email when staff schedule a Programs-in-Sessions
  session for them. Scoped during brainstorming to Programs-in-Sessions only (roster shifts
  explicitly out of scope), staff-triggered only (clients don't self-book today).
- Reuses the exact branded/reply-to email machinery from Client Email Messaging
  (`invoiceLetterhead`/`invoiceLogo`, `buildReplyToAddress`, `sendEmail`) rather than inventing a
  new send path — and inherits that feature's existing paid-plan gate (`isPaidPlan`), a deliberate
  consistency choice, not an oversight.
- **Real gap caught during brainstorming, before any code was written:** recurring series don't
  create occurrences one at a time — `topUpSeries` generates the next 8 occurrences in one go at
  series-creation time, then a cron tops up more later. A naive "email on every session insert"
  hook would have sent a client 8 emails at once the moment any weekly series was booked. Fixed by
  hooking the email into the series-creation event (one email describing the day/time + cadence
  pattern) rather than the per-row session insert.
- No per-client opt-out toggle this phase — no such flag exists for clients today (only staff have
  `notification_preferences`); always sends if the client has an email and the plan is paid.
  Explicitly deferred as a future follow-up if it becomes a real need, not built speculatively.
- Codex handles text edits only; conductor runs all shell/build/git. No Supabase MCP calls needed
  this phase (no migration).

## Notes (Collaborative Worksheet Annotation) [current phase]
- Source spec: docs/superpowers/specs/2026-07-06-collaborative-worksheet-annotation-design.md
- Source plan: docs/superpowers/plans/2026-07-06-collaborative-worksheet-annotation.md
- Raised directly from the video-call PiP work: a prospective tutoring customer (currently on
  Google Meet, not yet a TimeWiseHub user) wants to co-annotate worksheets with young students
  live during a call, plus async marking afterward. Reuses the existing topic_assets (PDF/image)
  library rather than a new authoring system.
- Discrete DB objects (text_box/stroke/sticker), not a CRDT — confirmed via research that CRDTs
  solve concurrent character-level text merge, which doesn't apply to independently-owned objects.
- Live sync via Supabase Realtime **Broadcast**, not `postgres_changes` (the mechanism this
  codebase's existing chat feature uses) — Broadcast is Supabase's own documented fit for
  high-frequency events like in-progress pen strokes; `postgres_changes` is too slow/DB-heavy.
- Access control reuses the existing guest-identity pattern (`clients.guest_chat_user_id`,
  `can_post_chat()`) rather than a new mechanism — new `can_edit_worksheet()` function.
- **Real gap caught during the plan's own self-review, before any code was written:** the first
  draft only wired up a worksheet picker for the authenticated org-member (tutor) side — the guest
  (student) join path (`GuestJoinClient.tsx` / `/join/[guestToken]`) doesn't currently get the
  in-call Program reference panel either (an existing, pre-this-phase limitation), so there was no
  existing pattern to copy for "guest resolves their own linked content." Fixed by having the
  tutor's worksheet selection broadcast over a call-scoped channel; the guest's screen auto-follows
  whatever the tutor has open, using the guest's own existing chat identity (`sessionChat.userId`)
  to co-edit — no independent picker on the guest side. This directly matters for whether the core
  "both people editing at the same time" requirement is actually met — flag this specifically
  during C-6's manual smoke test, not just "did it build."
- Builtin stickers render as colored lucide-react icons (avoids sourcing/shipping bundled image
  files); custom stickers are real uploaded images in a private `worksheet-stickers` bucket with
  path-based storage RLS (`{topicAssetId}/{studentId}/{filename}`, parsed via
  `storage.foldername()`).
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP. C-6 is a 5-file bundled turn (not split) since the tutor/guest wiring is a single
  coherent change — splitting it would risk an intermediate state where one side works and the
  other silently doesn't compile against it.

## Notes (Tutoring Progress Reports to Parents) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-tutoring-progress-reports-design.md
- Source plan: docs/superpowers/plans/2026-07-05-tutoring-progress-reports.md
- Sixth deep-dive feature for tutoring. User pointed out an existing staff-only
  `progress_notes` feature (append-only client-scoped notes, fed manually or promoted from a
  session's notes/call-summary) could be appropriated rather than building a new "progress report"
  entity from scratch — this phase does exactly that: adds `student_id` (so a client with multiple
  children can be filtered/tagged per kid) and `sent_to_parent_at` (send-state tracking) to the
  existing table, no new tables.
- Sending reuses the existing `/api/clients/[id]/messages` route (sender-identity resolution,
  plan-gating, reply-to, `client_messages` insert) via a small backward-compatible extension
  (optional `subject` override, optional `noteIds` to mark sent) rather than a parallel send path.
- **Real RLS bug caught during spec self-review, before any code was written:** marking a note
  `sent_to_parent_at` cannot go through a client-side `progress_notes` update — the existing
  schema-042 RLS only allows a note's own creator or an org admin to UPDATE it, but "any org member
  can send a progress report" (this phase's explicit scope decision) means a regular member must be
  able to send and mark-sent a colleague's note too. Fixed by doing that write inside the messages
  API route using its existing service-role client, scoped by `client_id` as a lightweight defense
  against marking unrelated notes.
- Session-promoted notes auto-tag `student_id` from the session's own `student_id` (already exists
  from an earlier phase) — no new UI needed for that path, just plumbing.
- Existing notes stay untagged (`student_id = null`) — no retroactive backfill attempted or needed
  (confirmed acceptable, no real customer data yet).
- Send-to-parent is deliberately NOT gated to the tutoring profile — matches the precedent set by
  per-lesson billing (also ungated) since "select some notes and email them to the client" is
  generally useful regardless of industry.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- **Bug found + fixed during C-4 manual testing (2026-07-05):** the "Save note" button in
  `AddProgressNote` stuck on "Saving…" after a successful save, blocking a second note without a
  full page reload. Root cause: `handleSave()` only called `setSaving(false)` on the error
  branches, never on success — a pre-existing bug that predates this phase, carried forward
  unnoticed when the component was rewritten for student tagging. `router.refresh()` doesn't
  remount the client component, so the stale local state persisted. Fixed with one added
  `setSaving(false)` line on the success path.
- **Second gap found + fixed in the same session (2026-07-05), unrelated to progress reports:**
  students could be archived (via the existing Delete action) but had no way back — unlike
  Clients, which already has an "Archived (N)" section + `RestoreClientButton` on its list page.
  Fixed by mirroring that exact pattern for students: new `RestoreStudentButton`, the students
  PATCH route gains a `'name' in body` branch (field-edit vs archive-toggle, same shape as the
  clients route), and the Students page now shows an Archived section. Deliberately kept the
  existing `isOwner || isAdmin` authorization (not the clients route's admin-only restriction) for
  both branches, consistent with the earlier "Tutoring Student Entity" phase's own correctness fix
  for the same reason (a solo Pro tutor with no org must be able to manage their own students).

## Notes (Tutoring Topic File Uploads) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-tutoring-topic-file-uploads-design.md
- Source plan: docs/superpowers/plans/2026-07-05-tutoring-topic-file-uploads.md
- Fifth deep-dive feature for tutoring — the deferred half of the year/subject/topic phase (file
  uploads per topic). Modeled structurally on the existing Programs feature's `program_assets`
  pattern (private bucket, permissive storage-layer policies, real auth enforced in application
  code via the service-role client, signed URLs for reads) but deliberately simpler: no AI
  summarization (explicitly declined — real ongoing Claude API cost not worth it for this pass),
  no categories, no video/audio types.
- Any org member can upload (matches subject/topic creation itself); only the creator or an org
  admin can delete — same "creator manages own, admin manages all" shape used for
  subjects/topics/sessions throughout this whole tutoring deep-dive.
- Routes use the service-role client (needed to pair storage + DB writes atomically, rollback an
  uploaded file if the row insert fails) — this means **table RLS does not actually enforce
  authorization** for these routes, same architectural note as Programs' own `assertAdminAccess`.
  A new `getTopicAccess()` helper centralizes the explicit check every route performs.
- New Subjects/Topics browser page is scoped to file management only — subjects/topics themselves
  are still only created inline during session booking (prior phase); renaming/archiving them is
  explicitly out of scope this pass.
- **First real use of Phase 4's `NavOverrides` mechanism** (shipped inert back when the Dynamic
  Navigation Engine phase built it, explicitly flagged as "waiting for real signal"): every
  non-tutoring profile gets `hiddenHrefs: ['/dashboard/subjects']`; tutoring gets none, so it shows.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- Every task in this phase is purely additive (new files) except the nav task (append-only edits
  to an existing array/object) — no intermediate red-build risk expected, unlike the prior phase's
  consumer-file rewrite which required combining tasks.
- **Redesigned post-smoke-test (2026-07-05):** user caught a real scaling flaw in the
  as-shipped Subjects page — it listed every topic under a subject in one flat expandable list
  (subject → topic tree), which breaks down badly at realistic volume (up to 30 topics × 13 year
  groups = 390 topics under a single subject). Fixed by replacing the subject-first tree with a
  cascading year-group → subject → topic drill-down (three selects, exactly mirroring
  `NewSessionModal`'s own selection pattern), so only one `(subject_id, year_group)` pair's topics
  are ever queried/rendered at once. This also removed the page's eager per-topic file-count
  aggregation entirely (no longer needed or meaningful once topics aren't all listed together).
  Two smaller fixes landed in the same pass: the native `<input type="file">` read as ambiguous
  plain text (no visible button) — wrapped in a styled `<label>` so it renders as a real button;
  and "Foundation" was renamed to "Kindergarten" to match Australian terminology (confirmed no
  existing test data used the old value, so no backfill needed). Fixed directly rather than through
  a new spec/plan/handover cycle — small, confined to code shipped this same session, not yet
  pushed to production, matching this project's established "process scales with task size"
  convention.
- **User question, answered directly (not a code change):** whether needing industry-switching
  only for testing (not for a real single-industry customer long-term) changes how this should be
  built. Answer: no — the switchability is an inherent, essentially free side effect of the
  `workspace_profile` architecture (a plain editable column + a picker), not extra engineering
  investment; the terminology/nav adaptation benefits every real customer regardless of whether
  they can re-switch later. Flagged as a future consideration, not an architecture change: once
  there's a real paying customer, consider locking or warning on the Settings Industry picker
  post-onboarding, since switching on a live account with real Subjects/Topics/Students data would
  produce a confusing half-migrated state.

## Notes (Tutoring Year Group/Subject/Topic Structure) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-tutoring-year-subject-topic-design.md
- Source plan: docs/superpowers/plans/2026-07-05-tutoring-year-subject-topic.md
- Fourth deep-dive feature for tutoring. Directly supersedes/replaces the just-shipped free-text
  subject tags (schema-086) — confirmed explicitly, not run alongside. User's original ask was
  modeled on IXL (year groups, subjects, areas of study within subjects, course material uploads),
  requiring "a complete and comprehensive library of the Australian curriculum from Kindergarten to
  Year 12." **Flagged directly before starting:** sourcing real curriculum content is a content
  project (no ACARA API exists), not a coding task — scoped down to structure-only (year groups +
  seeded subject names + empty tutor-populated topics), with file uploads and real curriculum
  content both explicitly deferred to their own future phases.
- Year groups are a fixed code constant (`YEAR_GROUPS`), never a DB table — nothing about it varies
  per org or changes over time, unlike subjects/topics which are genuinely per-org data.
- `subjects`/`topics` RLS deliberately mirrors the existing `sessions` table's exact 3-policy shape
  (creator manages own, org admins manage all, org members view all) rather than the more
  restrictive `clients` shape — any regular tutor (not just owner/admin) can add a subject/topic
  while booking, matching how any org member can already create sessions.
- Students no longer carry their own subject list at all — the Students page instead derives a
  display from that student's own session history (dedup'd in JS, not a Postgres `distinct on` or
  view, given realistic session volumes per client).
- Subjects are lazily seeded (8 defaults) the first time an org/solo-pro's Sessions page loads with
  zero subjects for their scope — no `/setup` wizard or Settings industry-switch hook needed, one
  code path covers both "already tutoring" and "switches to tutoring later."
- **Plan revision during writing-plans self-review:** the first draft split consumer file changes
  across 3 tasks (booking flow+sessions page, then student CRUD+students page), each individually
  leaving `pnpm run build` red until the next task landed. Recognized this conflicts with the
  project's actual "build must pass clean after every change" rule, and that this codebase's
  Supabase queries aren't strictly schema-typed (no generated `Database` type used — everything
  goes through manual `as unknown as` casts), so a partial cutover's build failure couldn't be
  guaranteed rather than assumed. Fixed by merging every consumer-file change into one single task
  (8 files, one turn) — slower to review as one diff, but never leaves an intermediate broken
  state. **Pattern worth remembering:** in this codebase specifically, don't assume a half-migrated
  prop/type contract will fail `tsc` loudly — check whether the surrounding code is strictly typed
  before splitting a rename/reshape across tasks.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- **Bug found + fixed during C-3 manual testing (2026-07-05):** the Subject dropdown showed
  hundreds of duplicate "English" entries (and every other seed subject) instead of 8. Root cause:
  `ensureSeedSubjects()`'s check-then-insert (select count, insert if zero) is not atomic — some
  repeated invocation of the Sessions page (~1150 inserts of each seed subject within ~3 minutes;
  exact trigger not conclusively diagnosed, no `setInterval`/polling found in the sessions-related
  components) hit the non-atomic check enough times to pile up unbounded duplicates. Fixed with a
  real DB-level uniqueness constraint (schema-088: partial unique indexes on `subjects(org_id,
  name)` and `subjects(created_by, name) where org_id is null`, plus the same class of defensive
  constraint on `topics(subject_id, year_group, name)`) rather than trying to make the application
  logic perfectly race-free — confirmed zero topics/sessions referenced any duplicate subject yet,
  so cleanup (keep-earliest-per-scope delete) was safe. **Pattern worth remembering:** a lazy
  "seed if empty" helper with no supporting DB constraint is not actually idempotent under
  concurrent/repeated invocation — pair any such helper with a real uniqueness constraint from the
  start in future phases, don't rely on the read-check alone.

## Notes (Tutoring Subject Tagging) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-tutoring-subject-tagging-design.md
- Source plan: docs/superpowers/plans/2026-07-05-tutoring-subject-tagging.md
- Third deep-dive feature for the Tutoring workspace profile. Students already had a single
  free-text `subject` column; user confirmed two real gaps ("Both"): a student can see the same
  tutor for more than one subject, and individual sessions weren't tagged at all. Chose the
  simplest data model available: free-text tags per student (`text[]`), no shared/org-wide subject
  vocabulary, exact-string dedup only.
- Booking a session: subject dropdown scoped to the selected student's tags + an "Other…"
  free-text fallback. Choosing "Other…" and submitting both tags the session AND appends the new
  value to that student's `subjects` array — user explicitly chose this self-maintaining behavior
  ("Yes, add it to the student") over session-only tagging, so a tutor's ad hoc/improv topics
  become available for next time without a separate edit step.
- Always optional, matching the existing `student_id` pattern — no session is ever forced to have
  a subject.
- **Deliberately not touching recurring sessions:** `/api/clients/[id]/sessions/series` was
  confirmed (by reading it) to not persist `student_id` at all today, despite `NewSessionModal`
  already passing it in that request body — a pre-existing, unrelated gap. `subject` is passed
  into that same body for consistency but will be silently ignored by the route exactly like
  `studentId` is today. Only single (non-repeating) sessions actually get a subject.
- `students.subject` (single text) is dropped, not kept alongside — this is an early-stage feature
  with low real data volume, so a clean replace was chosen over a compatibility shim.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- **Open question raised post-ship, not yet decided:** user asked whether subjects should instead
  be two structured dropdowns (year group × a curated subject list) rather than free-text tags.
  Deferred — proceeded with the already-approved free-text design since it was the one path
  already spec'd/planned/migrated, and it directly fixes the "re-typing every time" complaint via
  the dropdown-of-existing-tags in booking. The structured-category idea would reopen the data
  model (already migrated to `text[]`) and needs its own brainstorm if the user wants to pursue it.

## Notes (Tutoring Per-Lesson Billing) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-tutoring-per-lesson-billing-design.md
- Source plan: docs/superpowers/plans/2026-07-05-tutoring-per-lesson-billing.md
- Second deep-dive feature for the Tutoring workspace profile. Two billing rhythms exist for
  tutoring (per-lesson and prepaid packages/credits) — user prioritized per-lesson first as the
  simpler, more commonly-needed mode ("many families find it easier to pay weekly"). Packages/
  credits deferred to a future phase.
- Key finding during exploration: the existing `/api/invoices` route already had the exact
  extension point needed (`invoice_items.time_entry_id` + marking `time_entries.invoice_id`) —
  extended it to also handle `session_id`, rather than building a parallel invoice-creation path.
  `NewInvoiceForm.tsx`'s time-entry-based flow is completely untouched.
- Pricing reuses `clients.default_rate` (hourly) × session duration, falling back to 0 when null
  (matches `NewInvoiceForm.tsx`'s own existing fallback for the same nullable field) — no new
  pricing concept invented.
- **Deliberately not gated to the tutoring profile** — billing sessions directly isn't an
  inherently tutoring-only concept (a personal trainer might equally want it). Confirmed via
  manual smoke test with the real account's non-tutoring profile.
- Flagged but not fixed: `/api/invoices` uses the service-role client with only an
  authentication check, no ownership verification on `clientId`/entry IDs — a pre-existing gap,
  not introduced or worsened by this phase's `session_id` handling.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.

## Notes (Tutoring Student Entity) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-tutoring-student-entity-design.md
- Source plan: docs/superpowers/plans/2026-07-05-tutoring-student-entity.md
- First deep-dive feature for the Tutoring workspace profile, following the roadmap's Phases 1-4
  (engine/wizard/terminology/nav). Motivated by real research (agent research into
  TutorCruncher/TutorBird/Teachworks/My Music Staff, 2026-07-05: real tutoring software models
  the paying parent ("Client") and the learner ("Student") as two separate, linked entities, not
  one relabeled entity) plus direct user confirmation that multiple children per paying family is
  common in this market, not an edge case — this tipped the decision toward building the real
  entity split now rather than treating it as premature guesswork.
- Schema audit before starting: 25 files reference `.from('clients')` directly, 9 schema files
  have `client_id` foreign keys — this is why the pass is scoped to just `students` + `sessions`,
  not every client-referencing table at once. `progress_notes`, `client_messages`, `projects`, and
  invoicing all stay keyed to `client_id`, explicitly deferred to later passes.
- `sessions.client_id` stays `not null` (auto-derived from the chosen student's `client_id`);
  `sessions.student_id` is nullable and additive — every non-tutoring session, and every session
  created before this shipped, keeps `student_id = null` and behaves exactly as before.
- Students CRUD and the "Students" tile are gated to `profile.key === 'tutoring'` directly —
  genuinely tutoring-only functionality right now, not a new generic registry capability.
- **Terminology correction after shipping (2026-07-05):** once the real Student entity existed,
  the user caught that Phase 3's `tutoring.terminology.client = 'Student'` was now actively wrong
  — a tutor would see "Students (3)" on what's really their parent/family list, with the actual
  students living one level down. Reverted `tutoring.client` to `'Client'`/`'Clients'` in
  `registry.ts` (matches the research too — TutorCruncher's own UI calls the payer "Client," not
  "Student"). `session`("Lesson")/`program`("Course")/`project`("Learning Plan") are untouched,
  unaffected by the entity split. Confirmed live before shipping.
- `/api/students/[id]`'s `DELETE` uses `isOwner || isAdmin`, deliberately NOT mirroring the
  existing `/api/clients/[id]` `DELETE` route's admin-only check (a latent gap in the older route
  that would incorrectly block a solo Pro tutor with no org from archiving their own students) —
  a considered deviation, not a blind copy.
- Recurring (repeating) sessions do not get `student_id` wired up this pass — only single sessions
  do. Flagged explicitly rather than silently under-delivering.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.

## Notes (Dynamic Navigation Engine) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-05-dynamic-navigation-engine-design.md
- Source plan: docs/superpowers/plans/2026-07-05-dynamic-navigation-engine.md
- Phase 4 of the Workspace Profile roadmap. Explicitly confirmed during brainstorming: no real
  tutoring/personal-training prospect has said which nav items to hide/reorder — user was warned
  this is speculative and chose to proceed anyway ("keep building Phase 4 anyway"). Resolved by
  building only the mechanism (mirrors Phase 1's engine-first pattern): every registry entry ships
  with no `navOverrides`, so the sidebar is byte-for-byte identical to today for every current
  profile. Actual per-profile hide/reorder decisions remain deferred until real feedback exists.
- Icons and drag-and-drop are explicitly out of scope for this whole phase, not just this pass —
  no persistence model exists for drag-and-drop (per-user? per-org? new DB column?) and nobody has
  asked for icon variation.
- `applyNavOverrides()` is a pure function, verified the same way as Phase 1's resolver: a
  throwaway `npx tsx` script (conductor-only, never committed) rather than a real test suite.
- Codex handles text edits only; conductor runs all shell/build/git. No Supabase MCP calls needed
  this phase (no migration).

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

## Notes (Hands-on Onboarding Tutorial)
- Source spec: docs/superpowers/specs/2026-07-08-hands-on-onboarding-tutorial-design.md
- Source plan: docs/superpowers/plans/2026-07-08-hands-on-onboarding-tutorial.md
- Extends user_onboarding_dismissed (not a new table) into a fuller state row — started_at,
  current_step_index, context jsonb, nullable dismissed_at, profile_key.
- Detection scoped to created_at >= started_at (never "does this exist at all") so replaying an
  account with existing data doesn't instantly auto-complete every step. Manual "Skip this step"
  always available as an escape hatch/manual-advance.
- Tutoring: Client -> Student -> Subjects upload -> Program -> Session -> Schedule a call (6
  steps). Every other profile: Client -> Project -> Session (3 steps, terminology-driven). Bespoke
  flows for the other 9 profiles explicitly deferred.
- Steps chain real IDs forward (captured clientId reused to deep-link into that client's
  Students/Sessions tab via the existing ?new=1 convention) rather than sending the user to a
  generic list page every time.
- Migration backfills every existing user with a dismissed row so nobody already using the app
  gets an unsolicited Welcome popup. Fixes a real bug found during design: solo (non-org) users
  never saw the old tutorial at all (isNewMember was hardcoded false without an org membership
  row) — the new trigger ("no tutorial row yet") applies identically to org and solo accounts.
- Settings gets a "Restart tutorial" action with no age gate.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only.
- Manual click-through smoke test requires an authenticated browser session the conductor doesn't
  have — that's the user's own final verification step, same precedent as prior desktop/video
  smoke tests in this repo.
