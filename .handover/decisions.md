# Standing decisions
# The loop obeys these without pausing. Spending money is the only gated action:
# anything not authorized below causes a clean pause (not a frozen prompt).

## Spending
- spend-budget-usd: 2 (this figure covers per-turn API/build costs; the recurring Resend Pro
  subscription below is a separate, explicitly-approved ongoing cost, not drawn from this budget)
- Unified Landing Page (current phase): zero cost — pure code + a `next.config.ts` redirect and a
  `sitemap.ts` edit, no schema change, no new npm dependencies, no external API calls, no infra
  changes.
- FCM/Native Push Full Feature (prior phase, code complete, manual follow-up still pending with the
  user — see its own memory entry): zero direct cost — pure code + one additive DB
  migration (new table, no changes to existing tables), one new npm dependency (`firebase-admin`,
  free/open-source), reuses the already-approved-free Firebase project and plugin from the spike
  phase. FCM sending itself has no cost at this volume, same as confirmed for the spike.
- FCM/Native Push Validation Spike (prior phase, complete): zero direct cost — pure code + a new free-tier
  Firebase project (Cloud Messaging has no cost at this volume; no Admin SDK/paid API calls in this
  spike, Firebase Console's own "send test message" tool is used instead), one new native Rust/JS
  plugin dependency (`tauri-plugin-notifications` + `@choochmeque/tauri-plugin-notifications-api`,
  both open-source), no other new npm dependencies besides `@tauri-apps/plugin-os` (official Tauri
  plugin, free).
- SWMS/JSA In-App Reader Page (prior phase, complete): zero cost — pure code, no schema change (reuses the
  existing `project_swms_documents` table/columns as-is), no new npm dependencies, no external API
  calls.
- Multi-category JSA (prior phase, complete): zero cost — pure code, no schema change (existing free-text
  `category` column reused), no new npm dependencies, no external API calls.
- Project-to-Job Terminology (current phase): zero cost — pure code, no schema change (the
  `project` terminology slot already existed in the registry/types), no new npm dependencies, no
  external API calls.
- SWMS Form Builder (current phase): zero cost — pure code + one additive DB migration
  (`category`/`content`/`source` on `project_swms_documents`, `licence_class` on
  `certifications`, plus a storage RLS fix). No new npm dependencies — `@react-pdf/renderer` is
  already installed and paid for as part of the existing plan. No external API calls (research for
  the 18 category templates happened during plan-writing via WebSearch/WebFetch, not a paid
  runtime dependency).
- SWMS + Licence Tracking (prior phase, complete): zero cost — pure code + one additive DB migration (RLS
  on an existing empty table, two new tables, one new storage bucket, storage RLS on an existing
  empty bucket), no new npm dependencies, no external API calls.
- Client Sites (prior phase, complete): zero cost — pure code + one additive DB migration (one new table,
  two new nullable FK columns on existing tables), no new npm dependencies, no external API calls.
- Video Call Whiteboard (prior phase, complete): zero cost — pure code + one additive DB migration
  (one new table, one new function, one new private storage bucket), no new npm dependencies
  (`perfect-freehand` already installed for Worksheet Annotation, no `react-pdf` needed since
  there's no document to render).
- Account Deactivation (prior phase, complete): zero cost — pure code + one additive DB migration
  (one new table, two new nullable columns), no new npm dependencies, reuses the existing
  Resend/sendEmail infrastructure already paid for. One new env var
  (`OPERATOR_NOTIFICATION_EMAIL`) to set in Vercel — free, just a config value, not a spend.
- Incident Reports (prior phase, complete): zero cost — pure code + one additive DB migration
  (two new tables, one new SECURITY DEFINER function, one new private storage bucket),
  no new npm dependencies, no external API calls.
- Vehicle Tracking v2 (complete, prior phase): real ongoing cost, approved 2026-07-11 —
  CarRegistrationAPI.com rego lookup, ~$0.30 AUD/lookup, purchased in prepaid blocks of
  ≥100 (~$30 AUD minimum spend), user-signup + user-purchased, not drawn from the
  spend-budget-usd figure above (that covers per-turn API/build costs, not user-facing
  paid third-party services). Code ships and builds regardless of whether the key is
  live — the lookup button just returns a graceful error until `CAR_REGO_API_KEY` is
  set. Everything else this phase (notes table, nav move, driven-by column, required
  receipts) is zero cost — pure code + additive/destructive DB migrations, no new npm
  dependencies.
- Vehicle Tracking v1 (prior phase, complete): zero cost — pure code + one additive DB
  migration (two new tables, one new nullable FK column, one new function, one new
  SECURITY DEFINER RPC), no new npm dependencies, no external API calls.
- Session-Scheduled Client Email (prior phase, complete): zero cost — pure code, no schema change,
  no new npm dependencies, reuses the existing Resend/Client-Email-Messaging infrastructure and
  branding helpers already paid for.
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

## Notes (FCM/Native Push Validation Spike) [complete, kept for reference]
- **Both items (P-1, P-2) complete with real, verified device results (2026-07-20).** This phase
  existed specifically to de-risk an uncertain technical approach before committing to a full
  feature design — both real questions it was built to answer got definitive answers:
  - **P-1 (desktop): negative.** `pnpm tauri:dev` + devtools console on the real Tauri desktop app
    confirmed `typeof Notification === 'undefined'` and `typeof navigator.serviceWorker ===
    'undefined'` in the WebView2 environment. Standard web push cannot work on desktop Tauri at
    all — not a stale-build issue, not a platform-check bug, a genuine engine limitation. Desktop
    needs the same native-plugin treatment as Android for the follow-up feature, not a two-line
    fix. The narrowed android/ios-only gate (from Task 1's code) is kept regardless — still more
    correct than the old blanket-Tauri exclusion, just not sufficient alone.
  - **P-2 (Android): positive, full success.** After fixing a real capability/ACL gap found
    on-device (`Command plugin:notifications|is_permission_granted not allowed by ACL` —
    `capabilities/android.json` needed its own `remote` block, since capabilities without one only
    apply to bundled/local content and this app's window loads the remote timewisehub.com.au URL;
    `default.json` already had one, which is why Task 1's OS-detection permission worked fine),
    confirmed on a real installed Android build: FCM delivers correctly in all three app states
    (foreground — correctly silent/JS-only, since nothing told the plugin to show a banner while
    already open; background — system notification appears; fully closed — system notification
    appears). Tapping the notification from a fully-closed cold start launches the app and fires
    `onNotificationClicked` with the real custom-data payload intact
    (`{"data":{"testRoute":"/dashboard"},"id":-1}`) — the plugin's actual working tap-to-deep-link
    mechanism.
  - **Real research correction, found only by inspecting the plugin's actual shipped `.d.ts`
    during build verification, not from its README:** the design-stage research (AI-summarized
    GitHub README fetches) concluded this plugin had no distinct "notification tapped" event
    separate from action-button taps — the real shipped TypeScript API has a dedicated
    `onNotificationClicked(data: { id, data })` listener the README never surfaced clearly. Also
    caught a real type error the plan's own drafted code had: `PluginListener`'s cleanup method is
    `.unregister()`, not `.unlisten()` as first written. Both fixed directly by the conductor
    during `pnpm run build` verification, not re-dispatched to Codex (plan/research defects, not
    file-content mismatches).
  - Codex hit the Windows sandbox subprocess limitation once (P-2's first dispatch,
    `CreateProcessAsUserW failed: 5`, before it could even read the turn instruction) —
    self-recovered on the immediate identical retry, zero content discrepancies across both tasks'
    file transcriptions.
- Source spec: docs/superpowers/specs/2026-07-20-fcm-push-spike-design.md
- Source plan: docs/superpowers/plans/2026-07-20-fcm-push-spike.md
- Direct follow-up to queued backlog: "web push won't work in Tauri Android WebView; FCM needed
  for background/closed-app notifications." User chose to expand scope mid-brainstorm to cover
  desktop Tauri too, since it turned out to have the exact same "push completely disabled" gap as
  Android (a blanket `'__TAURI_INTERNALS__'` exclusion covered both, discovered via code reading
  before any design work started).
- **This spike existed because of a real, specific risk surfaced by research, not caution for its
  own sake:** the leading plugin candidate's README (AI-summarized fetch) appeared to lack the
  tap-to-deep-link event this whole feature needs, and every candidate plugin in this space was
  small/young — building a full schema/send-logic/UI architecture on that unverified assumption
  risked the exact "worked in theory, broke on the real Android build" pattern this project has
  hit before with Tauri. The spike resolved it directly with real evidence instead of continued
  speculation, and the actual shipped `.d.ts` turned out to be more capable than its own README
  documented.
- **What this unblocks:** the follow-up full-feature spec can now be designed with confidence
  around `tauri-plugin-notifications` (Choochmeque) for BOTH Android and desktop (rather than a
  mixed web-push/native split), including real tap-to-deep-link via `onNotificationClicked`. Not
  yet designed: the device-token schema (current `push_subscriptions` table is web-push-shaped —
  endpoint/p256dh/auth — incompatible with FCM's single-token model), server-side dual-send logic
  (`src/lib/push.ts` needs to fan out to FCM alongside existing web push, since browser tabs still
  use web push unaffected by any of this), and wiring every existing notification call site
  (`notifySwmsAwaitingSignature`, chat, etc.) to send through both paths depending on registered
  device type.
- The temporary debug scaffolding (`FcmTokenDebug.tsx`, its call site in `settings/page.tsx`, the
  amber "Spike debug" UI) is still live in the app — explicitly flagged in this phase's own spec as
  not a shipped feature. Should be removed (or hard-gated to a real dev-only condition) as part of
  the follow-up full-feature work, not left indefinitely.
- No database migration this phase. Codex handled text edits only; conductor ran all shell/build/
  git — plus two direct fixes for real defects found during device testing that weren't file-
  content mismatches (the ACL/remote-block gap, the `.unregister()` type error).

## Notes (SWMS/JSA In-App Reader Page) [complete, kept for reference]
- **All 3 implementation items (R-1 through R-3) complete and verified (2026-07-19).** Every turn
  was verified directly by the conductor (Read the actual new/changed files + `git diff` +
  `pnpm run build`), not taken on Codex's report alone. Codex transcribed all 10 files across the
  3 tasks with zero content discrepancies — the only real defect this phase was in the conductor's
  own plan draft, caught by `pnpm run build` after R-1: the `normalizeSwmsContent` helper's first
  draft typed its internal cast as `raw as (SwmsAuthoredContent & { category?: JsaHazard })`,
  which `tsc` rejects — intersecting the union's `swms` branch (`category: HrcwCategory`,
  required) with an added `{ category?: JsaHazard }` collapses that branch to `never`, which then
  poisons the `docType === 'jsa'` narrowing later in the function. Fixed directly by the conductor
  (not re-dispatched — a plan/design defect, not a file-content mismatch): dropped to an
  `any`-based runtime check, matching the exact reasoning the original inline check (which this
  helper replaced) already used — legacy DB rows don't conform to the current type by definition,
  that's the whole reason the function exists. The plan file was updated to match reality with an
  explanatory note, so a future re-read of the plan doesn't repeat the same mistake. Full
  `pnpm run build` passes clean end-to-end after every turn; confirmed the new route
  `/dashboard/clients/[id]/projects/[projectId]/swms/[documentId]` appears in the build's route
  table. Remaining: the manual smoke test (open an authored SWMS/JSA from the Dashboard widget,
  confirm content renders and Sign/Edit/Delete/Download PDF all work; open an uploaded document
  and confirm "Open document" + Sign both work; confirm the project list no longer shows an inline
  Sign button; confirm a pre-multi-category JSA, if one exists, still views/edits/PDFs correctly)
  requires the user's own authenticated sessions across roles — same precedent as every prior
  phase.
- Source spec: docs/superpowers/specs/2026-07-19-swms-jsa-reader-page-design.md
- Source plan: docs/superpowers/plans/2026-07-19-swms-jsa-reader-page.md
- Direct follow-up to a bug report: "when a jsa is created. it lands on my dashboard which is
  good. i click on it and it opens up the project screen and the jsa is all the way down the
  bottom. i also cant open it to read it. clicking does nothing, clicking view returns a web page
  not available." The immediate crash (an em dash in `doc.name` breaking the `Content-Disposition`
  header's Latin-1/ByteString encoding) was found via real Vercel production runtime error logs
  and fixed separately, same day, before this phase started — this phase is the larger follow-up
  feature request ("clicking it from the dashboard should take you directly to the jsa or swms
  read file with the ability to sign down the bottom of that"), not a re-fix of that crash.
- **Real architecture precedent confirmed before designing, per the user's own direct question**
  ("is there a problem with the system currently in use to view invoices and quotes etc?"):
  investigation confirmed invoices/quotes already use a real in-app HTML detail page
  (`/dashboard/invoices/[id]/page.tsx`) as the primary view, with a separate `/print` route and
  the `@react-pdf/renderer` component wired to exactly one consumer — a download-only
  `/api/invoices/[id]/pdf` route reached via a "Print / PDF" link. SWMS/JSA had been PDF-only this
  whole time (the entire viewing mechanism was one `NextResponse` from a react-pdf render, no HTML
  fallback) — this phase brings it in line with the already-proven invoice pattern rather than
  inventing something new.
- **Real gap found via code tracing, not the original bug report, surfaced to the user before
  building anything:** the PDF route had no backward-compat conversion for pre-multi-category JSA
  documents (only the edit form's loader did) — meaning View was likely ALREADY broken again for
  any JSA authored before the Multi-Category JSA phase shipped, independent of the em-dash bug.
  Folded into this phase as Task 1 rather than opened as a separate phase, since the new reader
  page would otherwise have inherited the exact same crash risk.
- **Real platform risk flagged before finalizing the design:** an inline `<iframe>` embed for
  uploaded (non-authored) documents was the original design, but Android WebView (used by the
  Tauri Android build) generally has no built-in PDF renderer — an iframe pointed at a PDF signed
  URL commonly renders blank there rather than erroring visibly. User chose to drop the iframe in
  favour of an "Open document" link (same signed-URL-in-new-tab behaviour as before) plus the Sign
  section on the same page, rather than risk an untestable-without-a-real-device regression.
- **Deliberate behaviour change, confirmed with the user before implementing:** the project list's
  (`ProjectSwmsPanel.tsx`) inline "I've read and understood this" acknowledge button is REMOVED,
  not kept alongside the new page. Signing now only happens on the document page — consolidates
  what were two acknowledge code paths (list + page) into one, and matches the original bug
  report's own phrasing ("...with the ability to sign down the bottom of that").
- No database migration — reuses the existing `project_swms_documents` table/columns as-is.
- Codex handles text edits only; conductor runs all shell/build/git. No migration this phase, so
  no conductor-only DB item.

## Notes (Multi-Category JSA) [complete, kept for reference]
- **The single implementation item (MJ-1, 9 files) complete and verified (2026-07-19).** Every
  file was verified directly by the conductor (`git diff` against the plan + `pnpm run build`),
  not taken on Codex's report alone — every file matched the plan's exact code with zero
  discrepancies. `pnpm run build` passed clean on the first attempt (unlike the Project-to-Job
  Terminology phase, which had three real plan errors) — the difference this time was writing the
  plan with full-file replacements for the three heavily-restructured files
  (`SwmsBuilderForm.tsx`, the POST route, `SwmsDocumentPdf.tsx`) rather than Find/Replace against
  remembered content, removing the "did I misremember which file had this text" failure mode
  entirely for the riskiest files. Codex hit the Windows sandbox subprocess limitation once
  (`CreateProcessAsUserW failed: 5`), self-recovered on the very next identical retry.
- Source spec: docs/superpowers/specs/2026-07-19-multi-category-jsa-design.md
- Source plan: docs/superpowers/plans/2026-07-19-multi-category-jsa.md
- Direct follow-up to the same 2026-07-18 batch feedback that produced Site Sign-In and the
  Crew-Groups Picker: "jsa should be able to select multiple categories per jsa... should be able
  to check each one you want on the jsa with the option to expand the view to see the more in
  depth details." This was the last of the three items from that original message.
- **Real scope clarification during brainstorming:** the user's own words scoped this to JSA only
  ("jsa should be able to select multiple categories"), confirmed directly rather than assumed —
  SWMS keeps its single-category dropdown and licence-class cross-check entirely unchanged, since
  HRCW work types are legislated discrete categories and mixing them would complicate that check
  for no requested benefit.
- **Real design-fork resolved via a clarifying question:** "the option to expand the view to see
  the more in depth details" was genuinely ambiguous between (a) a preview-before-checking
  affordance in the category picker, or (b) collapsible grouping of the already-merged rows. User
  picked (b), which set the whole data-model direction (rows needed a `category` tag for grouping
  to be possible at all) — asked before writing the spec rather than guessed.
- Unchecking a category deletes its rows (including any edits) — a deliberate trade-off stated
  plainly in the spec/plan and surfaced in the UI itself ("Removing a category deletes its rows
  below"), not something to silently soften during implementation.
- No database migration — `project_swms_documents.category` (existing free-text column, already
  used only for display lookups, never filtered on by any query) stores a comma-joined list of
  hazard keys for multi-category JSA. A new shared `resolveSwmsCategoryLabel()` helper
  (`src/lib/swms-category-label.ts`) centralizes the split/label-lookup/join logic used by the two
  flat-label display sites (document list, Dashboard "Today" card); the PDF needed the raw keys
  directly for row-grouping, so it kept its own `HRCW_CATEGORY_LABELS`/`JSA_HAZARD_LABELS`
  lookups rather than using the shared helper.
- Backward compatibility: editing a pre-existing single-category JSA normalizes its old `category`
  field into a one-item `categories` array on load, and — since the entire historical document was
  unambiguously for that one category — retroactively tags every one of its rows with it too, so
  the document behaves consistently in the new grouped/removable-by-category model rather than
  landing entirely in the ungrouped "Additional steps" section.
- Codex handles text edits only; conductor runs all shell/build/git. No migration this phase, so
  no conductor-only DB item.

## Notes (Project-to-Job Terminology) [complete, kept for reference]
- **All 10 implementation items (JT-1 through JT-10) complete and verified (2026-07-19).** Every
  turn was verified directly by the conductor (`git diff` against the plan + `pnpm run build`),
  not taken on Codex's report alone. This was the highest-defect-rate plan of any phase this
  session — three real, distinct research errors surfaced during execution, all caught by Codex
  correctly refusing to guess (its established good pattern all session) rather than silently
  deviating, plus one gap the final grep sweep itself caught:
  1. **JT-4**: the plan only updated `swms/[documentId]/pdf/route.ts`'s `SwmsDocumentPdf` call
     site, missing that `swms/route.ts` (the actual document-creation POST, not just the read-only
     PDF endpoint) also constructs the same component with the same newly-required prop — a build
     break, fixed directly.
  2. **JT-7 and JT-8**: the plan's `NewInvoiceForm.tsx` Find block (JT-7) and
     `ScheduleCallDialog.tsx` Find block (JT-8) were both accidentally written with text that
     actually belongs to *different* files — a single research-time conflation between several
     near-identical "Project (optional)" picker patterns across the codebase during the plan's
     original batched-grep research pass, not two independent mistakes. Both files do have real
     user-facing "project" text, just not the text the plan specified. Codex correctly reported
     the mismatch rather than guessing (JT-8 held off on ALL four files in that turn rather than
     leave a partial/broken prop chain); the conductor applied the correct edits directly in both
     cases after re-reading the actual files.
  3. **JT-10's own Step 7 final grep sweep** (part of the plan by design) caught a genuine gap:
     `SwmsBuilderForm.tsx` was never in the original 44-file discovery scan at all and had two
     literal "this project" strings — fixed directly, confirming the sweep step earns its place in
     future large terminology-style phases.
  Also self-caught before dispatch: JT-2's plan draft assumed `SidebarNav`/`MobileSidebar` needed
  a new prop; direct inspection during plan-writing found there is no "Projects" nav link in this
  app at all (Projects are reached via a client's own tab), so that assumption was corrected
  before the turn was ever dispatched, not after a broken build. Two files flagged in the spec's
  "Project detail sub-panels" area (`ProjectSwmsPanel.tsx`, `ProjectCrewPanel.tsx`,
  `ProjectExpensesPanel.tsx`, `DocumentPanel.tsx`, `ProjectTaskGrid.tsx`, `ArchiveButton.tsx`)
  turned out to contain zero literal "Project" text on direct inspection — correctly excluded
  from every task rather than padded with no-op edits.
  Full `pnpm run build` passes clean end-to-end after every turn. Remaining: the manual smoke test
  (construction/trades org shows "Job"/"Jobs" everywhere; real estate org shows "Listing"/
  "Listings"; an unaffected profile is unchanged) requires the user's own authenticated sessions
  across multiple workspace profiles — same precedent as every prior phase.
- Source spec: docs/superpowers/specs/2026-07-19-project-to-job-terminology-design.md
- Source plan: docs/superpowers/plans/2026-07-19-project-to-job-terminology.md
- Direct follow-up to the same user message that started Project-Site Linking: "also for all
  construction/trade/field businesses i would like to change 'project' for 'job'." User explicitly
  sequenced this to come after site-linking ("Site→project link first"), so it queued for a full
  session before being picked up.
- **Real pre-existing finding, confirmed before any design work**: the `TerminologyKey` type and
  `WORKSPACE_PROFILES` registry already had a `project` slot — Tutoring already mapped it to
  "Learning Plan," Personal Training to "Package" — but it was consumed in exactly one file
  (`src/lib/tutorial/steps/generic.ts`) across the whole codebase. This phase's wiring work
  silently activates those two already-configured-but-dead values as a side effect, not just the
  four newly-added profiles.
- **Two real dead-code findings from the plan's own research, deliberately untouched**:
  `ProjectCard.tsx`/`ProjectsGrid.tsx` and `TasksHub.tsx` are never imported anywhere in the live
  app (`/dashboard/tasks` is a plain `redirect('/dashboard')` stub) — confirmed via grep before
  excluding them, not assumed.
- Scope explicitly excludes the AI assistant's own reasoning/system-prompt text, notification
  emails, the help page, and public marketing pages — user chose "Core UI only" when asked how far
  this pass should reach, after being shown the full breadth (44 files across several distinct
  layers) up front.
- Real estate gets its own word ("Listing"/"Listings") rather than sharing "Job" with the other
  three profiles — user's own choice when offered the option, matching the existing
  per-profile-terminology precedent (Tutoring/Personal Training already have their own words for
  this same slot).
- Codex handles text edits only; conductor runs all shell/build/git. No migration this phase — the
  `project` terminology slot already existed, no conductor-only DB item.

## Notes (Project-Site Linking) [complete, kept for reference]
- **Both implementation items (PS-1, PS-2) complete and verified (2026-07-19).** Every turn was
  verified directly by the conductor (Read the actual diffs + `pnpm run build`), not taken on
  Codex's report alone — every file matched the plan's exact code with zero discrepancies either
  turn. Codex hit the known Windows `workspace-write` sandbox subprocess limitation
  (`CreateProcessAsUserW failed: 5`) on PS-2's first shell call; recovered on its own the same call
  via its internal (non-shell) file tool, no retry needed. Full `pnpm run build` passes clean
  end-to-end. Remaining: the manual smoke test (create a project with a site, confirm it saves;
  assign a site to an existing project via the new retrofit control, confirm it persists; confirm
  the whole site UI is absent for a non-multi-site workspace profile) requires the user's own
  authenticated session — same precedent as every prior phase.
- Source spec: docs/superpowers/specs/2026-07-19-project-site-linking-design.md
- Source plan: docs/superpowers/plans/2026-07-19-project-site-linking.md
- Direct follow-up request: "we need to consolidate projects and sites, because i sign in to the
  site, but theres currently no system linking project to site other than client id." `site_id`
  already existed on `projects` (added during the Site Sign-In migration) but nothing in the UI
  ever set it — this phase gave it two real entry points (creation-time picker, retrofit control on
  the detail page) rather than adding a migration.
- No database migration this phase — reused the existing `projects.site_id` column outright.
- Confirmed via research before designing: there is no general project-edit form anywhere in this
  codebase (only Archive/Delete controls) — shaped the design toward a small standalone
  `ProjectSiteControl` component rather than building a full edit form just for this one field.
- Both surfaces (creation picker, retrofit control) are client-scoped (only shows sites belonging
  to the project's own client), optional, and gated to `supportsMultiSite` workspace profiles —
  same flag Client Sites introduced, not a new one.
- A separate, larger request bundled in the same user message — renaming "Project" to "Job" for
  construction/trades/field-service workspace profiles, auditing every button/nav/tile/back-link
  that hardcodes the word — was explicitly sequenced by the user to come after this phase ("Site→
  project link first"). Investigated but not yet spec'd: the `TerminologyKey`/`WORKSPACE_PROFILES`
  registry already has a `project` terminology slot, but it's consumed in exactly one file
  (`src/lib/tutorial/steps/generic.ts`) — the actual UI hardcodes the literal word throughout, so
  this would be a genuine find-and-convert audit, not a registry value change.
- Codex handles text edits only; conductor runs all shell/build/git. No migration this phase, so no
  conductor-only DB item.

## Notes (SWMS Form Builder) [complete, kept for reference]
- **All 7 implementation items (C-1 through C-7) complete and verified (2026-07-18).** Every turn
  was verified directly by the conductor (Read the actual files/diffs + `pnpm run build`), not
  taken on Codex's report alone. Two real issues were found and fixed this way: (1) a
  plan-sequencing gap — extending `SwmsDocument` to require `category`/`source` in C-2 broke the
  already-shipped project detail page's SWMS mapping, which wasn't due to update until C-6;
  fixed by pulling that specific sub-step forward into C-2 rather than leaving an intermediate
  broken build, matching this project's standing precedent against exactly that. (2) a real type
  bug in C-4 — `getWorkspaceProfileForUser`'s `supportsSwms` is `boolean | undefined`, but
  `TeamGrid`'s new `showLicenceClass` prop required plain `boolean`; fixed with `!!supportsSwms`
  at the call site. No other discrepancies found across the remaining items — every file matched
  the plan's exact code. Codex hit the known Windows `workspace-write` sandbox subprocess
  limitation (`CreateProcessAsUserW failed: 5`) on the first call of most turns; recovered on its
  own every time this phase (no repeat-blocked turns, unlike some prior phases), except C-2's
  large template-file turn, which hit a genuine blocker and correctly reported it rather than
  guess — a focused retry (types file already done, don't touch) completed it. Full
  `pnpm run build` passes clean end-to-end, including confirming `/api/projects/[projectId]/swms`
  and `/dashboard/clients/[id]/projects/[projectId]/swms/new` both appear in the build's route
  table. Remaining: the manual smoke test (build a SWMS from a template, confirm the PDF matches
  what was entered, confirm the licence warning behaves correctly with/without a matching crew
  certification, confirm edit-before-ack vs edit-after-ack lifecycle, confirm a tutoring-profile
  org's certification form shows no licence-class field) requires the user's own authenticated
  session — same precedent as every prior phase.
- Source spec: docs/superpowers/specs/2026-07-18-swms-form-builder-design.md
- Source plan: docs/superpowers/plans/2026-07-18-swms-form-builder.md
- Direct follow-up request right after the SWMS + Licence Tracking phase shipped: "should we have
  digitised a swms form? user fills out all the info then it auto uploads it into a pdf." Confirmed
  during brainstorming that a real, already-proven PDF-generation pattern exists in this codebase
  (`@react-pdf/renderer`, used for `InvoiceDocument.tsx`/`PayslipDocument.tsx`) — not a new
  dependency, and directly reusable.
- Coexists with the existing upload path rather than replacing it (subcontractor-supplied or
  externally-authored SWMS still get uploaded as files).
- Template content for all 18 legislated High Risk Construction Work (HRCW) categories was
  dispatched as real research (three parallel batches — two via background Agent dispatch, one
  done directly after the third agent hit a session-limit failure), sourced against Safe Work
  Australia and state WorkSafe/SafeWork guidance with inline citations, not invented from training
  knowledge — matches the standing project pattern of dispatching real research for
  domain-critical/compliance-adjacent content rather than guessing.
- **Real finding from that research, surfaced to the user before finalizing the design:** most of
  the 18 categories do NOT map to a High Risk Work Licence (HRWL) at all — only tilt-up/precast
  concrete and (partially) powered mobile plant do cleanly. The rest need a completely separate,
  often state-varying credential (state electrical licence, gasfitting licence, demolition
  licence, Class A/B asbestos removal licence, shotfirer's licence, ARCtick refrigerant handling
  licence, traffic controller ticket) — none of which live in the 29-code HRWL scheme. User chose
  the simpler, more honest fix over building a broader multi-scheme cross-check system: keep
  `licence_class` scoped to real HRWL codes only (cleanly matchable), show an informational note
  (not a false automated match) for every other category.
- **Real pre-existing gap found during this same research, fixed as part of this phase's
  migration:** the `employee-docs` storage upload policy (from the SWMS + Licence Tracking phase)
  only allowed owner/admin, while `certifications`' own INSERT policy (schema-046) allows
  owner/admin/manager — a manager could add a certification row but silently fail to upload its
  document. Flagged and folded into this phase's migration rather than opened as a separate
  phase, since it's a one-line policy fix directly adjacent to code this phase already touches.
- User chose the higher-scope option at two points during brainstorming, both against the
  recommended (smaller) option: (1) pre-built templates per category rather than a blank form to
  start, (2) all 18 legislated categories researched now rather than a smaller ~6-category starter
  set. Both were explicitly flagged for their real cost (template content needs genuine sourcing,
  not invention) before the user confirmed.
- Edit lifecycle: free in-place edit before any crew acknowledgment exists (nothing's been relied
  on yet); once acknowledged, further edits create a new document row rather than mutating the
  acknowledged one — the old document stays visible, acknowledgments don't carry over. Note that
  `ProjectSwmsPanel` already allows deleting any SWMS document outright (a pre-existing, more
  permissive precedent from the prior phase) — this phase doesn't relitigate that.
- The 18-category template module (`src/lib/swms-templates.ts`) is a static TypeScript file, not
  a database table — reference content maintained by the codebase, not tenant data, so changes go
  through real code review like any other reference constant in this repo.
- **Real plan-sequencing gap found during C-2's build verification:** extending `SwmsDocument` to
  require `category`/`source` (Task 2) broke the existing project detail page's SWMS
  fetch/mapping, which wasn't due to be updated until Task 6, Step 1 — an intermediate broken
  build between C-2 and C-6. Fixed by pulling that specific, already-fully-specified sub-step
  forward into C-2 rather than leaving the build red until C-6, matching this project's standing
  precedent (see Vehicle Tracking v1's C-2/C-4 bundling note below) that a task split should never
  leave an intermediate broken build.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP. C-1 (migration) is conductor-only.

## Notes (SWMS + Licence Tracking) [complete, kept for reference]
- **All 8 implementation items (C-1 through C-8) complete and verified
  (2026-07-18).** Every turn was verified directly by the conductor (Read the
  actual files/diffs + `pnpm run build`), not taken on Codex's report alone —
  every file matched the plan's exact code with zero discrepancies this
  phase (no bugs caught/fixed, unlike several prior phases). Two assumptions
  baked into the plan (`getWorkspaceProfileForUser` actually existing at the
  claimed path; `/api/team/certifications` already accepting
  `document_path`) were independently re-confirmed live before each relevant
  dispatch rather than trusted from the plan text alone. Full
  `pnpm run build` passes clean end-to-end across all three modified
  server pages/components and the two new panel components. Remaining: the
  manual smoke test (crew add/remove, SWMS upload/view/acknowledge/delete,
  RLS non-crew-visibility check, tutoring-profile confirms neither section
  renders, certification document upload/view, Dashboard expiry card
  appearing/disappearing) requires the user's own authenticated sessions
  across a trades/construction-profile org and a tutoring-profile org — same
  precedent as every prior phase.
- Codex hit the known Windows `workspace-write` sandbox subprocess limitation
  (`CreateProcessAsUserW failed: 5`) on its first shell call in all three of
  C-6/C-7/C-8's turns — recovered on its own via its internal (non-shell)
  file tool every time, no retries needed this phase.
- Source spec: docs/superpowers/specs/2026-07-18-swms-licence-tracking-design.md
- Source plan: docs/superpowers/plans/2026-07-18-swms-licence-tracking.md
- Direct follow-up to the Trades & Field Services deep-dive: three parallel research agents
  (competitor construction software, on-site worker daily needs, AU construction compliance)
  independently converged on SWMS + high-risk-work licence tracking as the single strongest
  cross-validated gap — two of the three named it their top pick from completely different
  research angles.
- **Real course-correction during brainstorming, before any code was written:** the user clarified
  Sessions was purpose-built to bridge tutoring/PT's single-lesson-appointment model and was never
  meant to fit construction — "jobs" map to the existing `projects`+`tasks` tables instead. This
  reframed the entire feature away from an initial (wrong) assumption that SWMS acknowledgment
  would need to be scoped to a session's single `created_by` person.
- **Real gap caught via direct research, not assumption:** licence tracking already existed almost
  entirely as the generic `certifications` table/UI (add/list/delete, per-member expired/expiring
  badges, an org-wide `CertExpiryPanel`) — checked the actual schema and component tree before
  proposing anything, avoiding building a duplicate parallel system. The user then explicitly
  scoped this phase down to a small polish pass (document upload + Dashboard surfacing) rather than
  the fuller "scheduling-time warnings" option also offered.
- **Real gap caught via direct research:** `project_members` exists in the schema and
  `project_documents`' own RLS already references it, but zero application code populates or reads
  it — confirmed via a live grep before assuming crew management could be skipped. Building a small
  Crew UI was treated as necessary scaffolding for SWMS access (explicitly agreed with the user,
  not silently expanded scope).
- SWMS access is crew-wide (any `project_members` row on the project can view/acknowledge, not just
  the project owner/admin) per the user's explicit requirement ("every employee needs to be able to
  access swms") — clarified during brainstorming to mean "anyone on the project's crew," not a
  company-wide library across every project.
- Acknowledgment is tracked, not a hard gate — matches the Incident Reports precedent (a permanent
  compliance record, not a workflow blocker). Avoids edge cases like a SWMS added after a task is
  already in progress.
- Gated to `trades_field_services` + `builder_construction` only via a new `supportsSwms` flag; the
  underlying `projects`/`tasks` tables stay fully generic and ungated for every other profile.
  Certifications itself stays ungated — it's a pre-existing, industry-agnostic feature.
- **Real correction caught during plan-writing, before any code was written:** a draft of the
  Dashboard certifications-due card assumed `certifications.user_id` could be embedded via
  `profiles!certifications_user_id_fkey`, following the pattern used elsewhere in this codebase for
  `organisation_members.user_id`. A live query against the actual FK constraints showed
  `certifications.user_id` references `auth.users` directly — no such embeddable relationship
  exists, so that query would have failed outright. Fixed by resolving display names from
  `mappedMembers`, a list this exact page already computes for an unrelated purpose (the manager
  task pool), rather than guessing at a fallback in the plan itself.
- New `project-swms` storage bucket, RLS-scoped by path-prefix project ownership (mirrors the
  existing `project-documents` bucket's own path-prefix pattern exactly). Certifications reuses the
  pre-existing but completely unused (zero policies, zero code) `employee-docs` bucket rather than
  creating a new one.
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP. C-1 (migration) is conductor-only.

## Notes (Client Sites) [complete, kept for reference]
- **All 9 implementation items (C-1 through C-9) complete and verified
  (2026-07-16).** Every turn was verified directly by the conductor (Read
  the actual files + `pnpm run build`), not taken on Codex's report alone —
  every file matched the plan's exact code with zero discrepancies, except
  one deliberate, correct adaptation: C-9's dispatch described the
  read-only "Location" `<dl>` block by its literal text, not knowing it
  actually lives inside a separate `ReadOnlyReport` sub-component (missed
  during the plan's own file research, which only partially read
  `IncidentReportDetailClient.tsx`) — Codex correctly identified the real
  component boundary and threaded `clientName`/`siteLabel` through as new
  props to `ReadOnlyReport` and its call site, rather than misplacing the
  code inline. Full `pnpm run build` passes clean end-to-end, including
  confirming `/api/client-sites/[id]`, `/dashboard/clients/[id]/sites`, and
  the new incident-report fields all appear correctly in the build's route
  table/type-checked payloads. **Codex hit the Windows `workspace-write`
  sandbox subprocess limitation (`CreateProcessAsUserW failed: 5`) on
  nearly every turn's own verification reads** — six of nine turns
  recovered via its internal (non-shell) file-read tool on the same
  attempt; C-8 blocked twice in a row (its internal fallback didn't kick in
  either time) and correctly reported the blocker rather than guess at the
  task, recovering on a third retry. This matches the documented
  CLAUDE.md/decisions.md precedent for this environment — retrying the
  identical dispatch is the correct response, not escalating Codex's
  sandbox or pausing prematurely. Remaining: the manual smoke test (create
  sites for a trades-profile client, book a session against one, file+edit
  an incident report with a client/site, confirm the tutoring-profile
  client page shows no Sites tile at all) requires the user's own
  authenticated session — same precedent as every prior phase.
- Source spec: docs/superpowers/specs/2026-07-15-client-sites-design.md
- Source plan: docs/superpowers/plans/2026-07-15-client-sites.md
- Trades & Field Services deep-dive (parallel to the earlier tutoring deep-dive). User picked
  "Trades & Field Services" over Personal Training when asked which industry to deep-dive next
  (both were candidates per the original Workspace Profile roadmap decision). Motivation was
  explicitly exploratory ("would be good to get another one closed off"), not a specific new
  prospect — Vehicle Tracking/Incident Reports/Account Deactivation already shipped this same week
  are trades-shaped features, but ungated and with generic terminology; this phase asked "what's
  actually still missing" rather than assuming the vertical was already done.
- Competitive research pass (ServiceM8, Tradify, Fergus, general 2026 field-service-management
  sources) surfaced: quotes-with-digital-acceptance, job costing, multi-site customers, digital
  sign-off. User picked multi-site customers over the recommended quotes-with-acceptance option.
- Gated to exactly `trades_field_services`, `builder_construction`, `cleaning_maintenance`,
  `real_estate` via a new `supportsMultiSite` workspace-profile flag — not universal (tutoring
  explicitly doesn't need it) and not exclusively trades (other property-visiting profiles do).
- `clients.address` is deliberately untouched — stays the billing/default address, no migration of
  existing rows. Sites are purely additive.
- **Deliberately reopens a prior explicit scope decision**: Incident Reports
  (`2026-07-13-incident-reports-design.md`) originally excluded any client/job link on purpose
  ("this is not a general-purpose incident log"). Raised directly to the user before proceeding
  (not silently overridden) — user confirmed reopening it. Adds optional `client_id`/`site_id`
  there; the rest of that feature (workplace-safety-only fields, no delete, ungated to all
  Team-plan orgs) is unchanged.
- **Real gap caught during research, before writing the plan:** `incident_reports` has no
  `client_id` at all today, which the design brainstorm surfaced only after checking the live
  schema (not from memory/assumption) — the initial plan for "link incident reports to sites"
  would have been wrong without that check.
- **Real pre-existing bug noted, explicitly not fixed this phase:** the recurring-session path
  (`POST /api/clients/[id]/sessions/series`) already silently drops `studentId`/`subjectId`/
  `topicId` — its handler only destructures `{ title, scheduledAt, durationMinutes,
  recurrenceInterval }` even though `NewSessionModal` sends the rest. `site_id` follows the same
  precedent (wired into the non-recurring insert only) rather than expanding this phase's scope to
  fix a pre-existing, unrelated gap.
- **Self-review catch, before any code was written:** the plan's `ClientSitePicker` component is
  shared between the new-incident-report form (clientId starts `''`) and the incident-report edit
  view (clientId starts from `report.client_id`, siteId from `report.site_id`). The first draft's
  `useEffect` unconditionally reset `siteId` to `''` whenever `clientId` was set — harmless in the
  create form, but would have silently wiped a saved site selection the instant the edit view
  mounted. Fixed with an `isFirstRun` ref guard so the reset only fires on genuine client changes,
  not on mount.
- All CRUD is direct `supabase.from(...)` calls in `'use client'` components, matching this
  codebase's existing convention (confirmed via research: there is no lib-layer CRUD wrapper
  pattern anywhere in this repo, e.g. `src/lib/vehicles.ts` is pure status-calculation helpers,
  not a data-access layer). `client_sites` RLS and the `/api/client-sites/[id]` route both mirror
  the existing `students` table's pattern exactly (owner-manage / org-view / org-admin-manage;
  `/api/students/[id]/route.ts`'s field-edit-vs-archive-toggle branching).
- Codex handles text edits only; conductor runs all shell/build/git and the DB migration via
  Supabase MCP. C-1 (migration) is conductor-only.

## Notes (Video Call Whiteboard) [complete, kept for reference]
- **All 8 implementation items (C-1 through C-8) complete and verified
  (2026-07-15).** Every turn was verified directly by the conductor (Read
  the actual files/diffs + `pnpm run build`), not taken on Codex's report
  alone — every file matched the plan's exact code with zero discrepancies
  this phase, including the large, novel `WhiteboardCanvas.tsx` eraser logic
  (C-4), which was explicitly dispatched with an instruction to transcribe
  verbatim rather than re-derive, and confirmed line-by-line against the
  plan afterward given how much technical risk it carried. Full
  `pnpm run build` passes clean end-to-end. Remaining: the manual smoke test
  (two-browser live sync for pen/text/sticker, the drag-to-erase split
  behaviour specifically, persistence across leave/rejoin, a fresh board on
  a different session, plan-gating across both a Pro/Team and a Free tutor
  and their respective guests) requires the user's own authenticated and
  guest sessions — same precedent as every prior phase.
- **Post-ship fixes (2026-07-15), found via the user's own live testing:**
  (1) real bug — `handlePointerUp` and `runToNewStroke` normalized stroke
  points as a raw canvas-fraction delta (`x - minX`) instead of a true 0-1
  fraction of the stroke's own bounding box (`(x - minX) / width`), while
  the renderer assumed the latter (`o.x + x * o.width`) — a saved stroke
  rendered shrunk by its own width/height a second time, appearing tiny
  near its own top-left corner instead of where it was drawn. Fixed in both
  places. **This exact same normalization pattern existed in the original
  `WorksheetAnnotator.tsx`'s `handlePointerUp`** (copied faithfully from
  there during planning) — flagged to the user, who confirmed fixing it
  there too; same fix applied to that file. **Not retroactive**: any pen
  strokes already saved on existing worksheets before this fix have the bad
  math baked into their stored `points` data and will keep rendering
  tiny/misplaced — only newly-drawn strokes after this fix are correct. No
  backfill migration was written (no test data at meaningful volume yet,
  and reconstructing "what was actually drawn" from already-corrupted
  points isn't generally possible). (2) UI: switched the whiteboard from
  the dark chrome
  `WorksheetAnnotator` uses (appropriate there since it's viewing a
  scanned/PDF page) to a light theme throughout — a blank whiteboard reads
  as a literal white page, not a document viewer. (3) UX: `PEN_WIDTHS`
  changed from `[2, 4, 7]` to `[2, 7, 14]` for clearer visual separation
  between presets, and the width-selector dots now preview the actual
  selected pen colour instead of a fixed white dot (which would've been
  invisible against the new light toolbar anyway).
- **Second round of post-ship fixes (2026-07-15), same day:** (1) the light
  theme above only changed `WhiteboardCanvas.tsx`'s own content — the
  shared `WorksheetFullScreen` wrapper (outer background + header bar) was
  still hardcoded `bg-slate-950`/dark, which is what the user was actually
  still seeing as "still black." Added a `theme?: 'dark' | 'light'` prop to
  `WorksheetFullScreen` (default `'dark'`, so both existing worksheet call
  sites are unaffected), whiteboard's call site in `CallRoom.tsx` now passes
  `theme="light"`. (2) real bug — the eraser fired on every `pointermove`
  regardless of whether the pointer button was held, so just moving the
  mouse across the canvas toward the spot you meant to erase deleted
  anything it passed over. Fixed by gating the actual hit-testing
  (`handleEraserMove`) behind a new `isErasingRef`, set on
  `pointerdown`/cleared on `pointerup` — the eraser's aim-preview circle
  (`updateEraserCursor`, split out from the old combined function) still
  follows the cursor on every hover for visual aiming, it just no longer
  erases until the button is actually down, matching how the pen tool
  already only draws while `drawingPoints` is non-empty. (3) UX: a selected
  text box had no keyboard way to exit edit mode — only clicking elsewhere
  on the canvas deselected it. Added an Enter-key handler on the textarea:
  plain Enter commits and exits to the read-only display (the debounced
  persist already in `handleTextChange` isn't disrupted by deselecting,
  since it's keyed off the object id, not selection state); Shift+Enter
  still inserts a literal newline for multi-line text.
- Source spec: docs/superpowers/specs/2026-07-15-video-call-whiteboard-design.md
- Source plan: docs/superpowers/plans/2026-07-15-video-call-whiteboard.md
- Direct feature request: a freeform whiteboard in video sessions, "similar
  to Scribbleboard." Disambiguated during brainstorming (one question at a
  time, not assumed): tutoring-only alongside the existing Worksheet
  Annotation feature, not a general-purpose tool for every call; content
  persists tied to the session (fresh blank canvas per session, not shared
  across a student's whole history).
- Explored the existing Worksheet Annotation feature in full before
  designing anything — almost the entire architecture (discrete text_box/
  stroke/sticker rows, Broadcast-for-live + table-for-persistence, RLS
  shape, `perfect-freehand`) transfers directly. The two real differences:
  scoping key (`session_id` vs `(topic_asset_id, student_id)` — sessions
  already carry `org_id`/`created_by` directly, so the new access function
  is simpler, no topics→subjects hop needed) and no document/page background
  at all (blank fixed canvas, no `react-pdf`).
- Toolset iterated live with the user: started from "match Worksheet exactly"
  → user asked for more pen colours, adjustable thickness, and specifically
  **true drag-to-erase** (not click-to-delete) — clarified concretely what
  "splits at the eraser point" means (contiguous surviving point-runs become
  separate stroke rows) before locking it in, since it's real algorithmic
  complexity, not just a UI toggle. Considered and rejected a canvas/pixel-
  based eraser (would mean abandoning the discrete-object sync model
  entirely) in favour of extending the existing per-row architecture.
- **Mid-brainstorm addition:** user asked for the whiteboard to be "visible
  but gated from free tier users" after the rest of the design was already
  approved — folded in as its own section rather than skipped. Real
  complication surfaced immediately: a guest student viewer has no
  subscription of their own, so the gate has to resolve from the **session
  owner's** plan (`sessions.created_by → getSubscription → isPaidPlan`), not
  the current viewer's `user.id` — otherwise a guest would always see it
  locked regardless of their tutor's actual plan. UI-layer gate only, not
  RLS — same documented limitation as the account-deactivation page gate,
  chosen deliberately over a much larger RLS retrofit for a "locked out of
  the product" goal, not a "cryptographically enforced" one.
- **Real refactor surfaced during plan-writing, not the spec stage:**
  `WorksheetFullScreen.tsx` hardcodes the header text "Worksheet" — reusing
  it as-is for the whiteboard would have shown the wrong label. Fixed by
  adding a required `title` prop and updating all three call sites (two
  pre-existing, one new) rather than defaulting it silently. Similarly,
  `StickerPalette.tsx` hardcoded `topicAssetId`/`studentId` into its upload
  path — generalized to `bucket`/`buildUploadPath` props, verified the new
  worksheet call site produces byte-identical storage paths to before (pure
  refactor, no behavior change).
- **Self-review catch:** the spec's eraser description illustrated the
  "zero/one/two surviving runs" cases, but a real drag can cross a curled
  stroke more than twice in one gesture. The plan's actual
  `contiguousSurvivingRuns`/`completeErase` code handles an arbitrary number
  of runs generally, not just two — noted explicitly so it reads as an
  intentional generalization of the spec, not a contradiction of it.
- Codex handles text edits only; conductor runs all shell/build/git and the
  DB migration via Supabase MCP.

## Notes (Account Deactivation) [complete, kept for reference]
- **All 6 implementation items (C-1 through C-6) complete and verified
  (2026-07-14).** Every turn was verified directly by the conductor (Read
  the actual files + `pnpm run build`), not taken on Codex's report alone —
  every file matched the plan's exact code with zero discrepancies this
  phase (no bugs caught/fixed, unlike the prior two phases). Full
  `pnpm run build` passes clean end-to-end; `/api/account/deactivate`,
  `/api/account/reactivate`, and `/account-deactivated` all confirmed present
  in the build's route table. `OPERATOR_NOTIFICATION_EMAIL` set in Vercel
  production (`admin@vividex.au`) before C-3 shipped. Remaining: the manual
  smoke test (deactivate as owner on free plan end-to-end including the
  notification email, confirm other org members are locked out of both
  `/dashboard` and `/settings`, reactivate, confirm data intact) requires the
  user's own authenticated sessions across multiple roles — same precedent
  as every prior phase.
- **Post-ship follow-up (2026-07-14):** user asked whether cancelling Stripe
  but not deactivating leaves someone with ongoing free access to paid
  features. Confirmed via `src/app/api/stripe/webhook/route.ts`: Stripe's
  default cancellation is cancel-at-period-end, so `status` stays `'active'`
  (with `cancel_at_period_end: true`) until the paid period actually lapses
  and `customer.subscription.deleted` fires — by design, not a hole (they
  only keep what they already paid for). This did surface a real UX gap
  though: the Danger Zone's `isPaidPlan(subscription)` block doesn't
  distinguish "still paying, hasn't cancelled" from "already cancelled,
  waiting out the period," so the same "cancel first" message showed even
  right after someone cancelled. User chose to keep the hard block until the
  period actually ends (rather than let cancel_at_period_end alone unlock
  deactivation) but wanted the message corrected. Fixed: `DangerZoneDeactivate`
  now takes `cancelAtPeriodEnd`/`periodEndDate` props (from the same
  already-fetched `subscription` object) and shows "You've already
  cancelled — your access continues until <date>" instead, no Billing link
  in that state since there's nothing further to do there. Small, scoped fix
  — done directly, not through the handover loop.
- **Second post-ship follow-up, same day:** user then asked whether the
  "Go to Billing →" link in the still-paying branch was actually misleading,
  since `/dashboard/billing` itself has no visible "cancel" control — the
  real cancel action only exists inside Stripe's own hosted Customer Portal,
  reached by clicking that page's separate "Manage subscription" button
  (`ManageButton` in `src/components/billing/BillingClient.tsx`, which calls
  `/api/stripe/portal` and redirects off-site). Confirmed by reading both
  files — correct, landing on `/dashboard/billing` and telling someone to
  "cancel" was a dead end if they didn't spot that button. Fixed by having
  the Danger Zone call `/api/stripe/portal` directly (same request the
  existing `ManageButton` makes) and redirect straight to the Stripe portal
  in one click, rather than routing through `/dashboard/billing` at all.
- Source spec: docs/superpowers/specs/2026-07-14-account-deactivation-design.md
- Source plan: docs/superpowers/plans/2026-07-14-account-deactivation.md
- Direct feature request, follow-up to the gap flagged during Incident Reports
  brainstorming ("do customers have a way to deactivate their accounts" — no
  such capability existed anywhere). "Unsubscribe" was genuinely ambiguous
  (Stripe cancellation already exists; leave-org and email-preferences are
  different, smaller features) — disambiguated via one clarifying question
  before any design work; user confirmed full account closure plus
  exit-data collection plus an operator notification email (small customer
  count today, wants to know immediately when someone leaves).
- Deliberately declined during brainstorming: auto-cancelling an active
  Stripe subscription on deactivation. User asked directly whether it should
  auto-cancel ("don't want to make it too easy to leave, but that feels more
  like how bigger orgs do it") — recommended keeping deactivation blocked
  behind a separate, deliberate Billing-portal cancellation step instead,
  reasoning that mature SaaS products commonly add this exact friction for
  retention, it isn't just an unsophisticated shortcut. User accepted.
- Soft-deactivate only, never hard-delete — AU businesses generally need to
  retain financial records (invoices, expenses) for ~5 years (ATO); a real
  "delete everything" request is explicitly a separate future decision.
- **Real RLS gap caught during planning, before any code was written:** the
  existing `organisations` UPDATE policy ("Owners and admins can update
  organisation settings") allows admins, not just owners — a plain
  client-side `.update({deactivated_at})` would have silently let an org
  admin deactivate (or reactivate) the whole org, violating the spec's
  explicit "owner-only, not even admins" requirement. Fixed by routing both
  writes through service-role API routes with an explicit
  `role === 'owner'` check first, mirroring the exact pattern already used by
  `src/app/api/team/role/route.ts` for the same class of problem (owner-only
  role changes). The `account_deactivations` table's own RLS policies use
  `has_org_role(org_id, ARRAY['owner'::member_role])` correctly, but exist
  only as defense in depth — the app's actual writes bypass them via the
  service-role client.
- **Real UX/logic conflict caught during planning, before any code was
  written:** the approved spec's flow said "sign the user out" immediately
  before redirecting to `/account-deactivated`, but that page also needs to
  show a Reactivate button only to the owner — impossible to determine once
  already signed out. Resolved by dropping the explicit sign-out: the
  `deactivated_at` page-gate alone already fully blocks re-entry to the
  product on every subsequent page load regardless of session state, so
  sign-out added no real security, only broke the reactivate-button UX.
  Added a manual "Sign out" link to `/account-deactivated` so nothing is
  lost. Documented explicitly in the plan as a deviation, not a silent
  change.
- Codex handles text edits only; conductor runs all shell/build/git and the
  DB migration via Supabase MCP.

## Notes (Incident Reports) [complete, kept for reference]
- **All 6 implementation items (C-1 through C-6) complete and verified
  (2026-07-13).** Every turn was verified directly by the conductor (Read the
  actual files + `pnpm run build`), not taken on Codex's report alone — one
  real bug was found and fixed this way: C-3's new-report form inserted the
  raw `datetime-local` input string (no timezone) directly into the
  `timestamptz` `occurred_at` column instead of converting it via
  `new Date(...).toISOString()` first — for a compliance record where exact
  incident timing matters, this would have silently stored the wrong time.
  Fixed directly by the conductor; the fix was then explicitly flagged in
  C-4's dispatch instructions and Codex correctly carried the same pattern
  forward in the detail page's edit/close forms, with no repeat of the bug.
  C-5's `DashboardShell.tsx` rename (`isInvoicePrint` → `isPrintRoute`) was
  double-checked specifically for regression risk to the existing invoice
  print page — confirmed both print routes coexist correctly in the build's
  route table. No other discrepancies found across the remaining items. Full
  `pnpm run build` passes clean end-to-end. Remaining: the manual smoke test
  (crew isolation, employee/witness read-only access, closed-report
  immutability via a direct RLS attempt, confirming no delete capability
  exists anywhere) requires the user's own authenticated sessions across
  multiple roles — same precedent as every prior phase.
- Source spec: docs/superpowers/specs/2026-07-13-incident-reports-design.md
- Source plan: docs/superpowers/plans/2026-07-13-incident-reports.md
- Direct feature request, raised alongside a separate factual question ("do
  customers have a way to deactivate their accounts") that was investigated
  directly rather than brainstormed — answer: no such capability exists
  anywhere in the codebase today (no UI, no API, no schema flag, no leave-org
  flow; Stripe cancellation only downgrades to free tier). That's a real gap,
  flagged as its own future brainstorm, not folded into this phase.
- Scoped to workplace safety incidents only (injury / near-miss / hazard) —
  explicitly not a general incident log. Property/vehicle-damage and
  client-complaint incident types were offered as alternatives and declined.
- Filing/editing/closing is owner/admin/manager only; employees get read-only
  access to reports where they're the `employee_id` or a witness, never
  create/edit/close. No delete capability anywhere, not even for the owner —
  treated as a permanent compliance/legal record, a deliberate call over the
  owner-only-hard-delete precedent Vehicle Tracking set.
- Crew-scoped manager visibility reuses the exact `can_access_vehicle()`
  shape via a new `can_access_incident_report()` function — same pattern, new
  entity.
- Printable via a plain print-styled route (same kind as the existing invoice
  print page), not real PDF generation — no new dependency. Explicitly
  confirmed with the user as the preferred approach over generating actual
  PDF files server-side.
- **Real gap caught during the plan's own self-review, before any code was
  written:** (1) Task 6's Dashboard-widget wiring was first drafted assuming
  `vehiclesRes` gates its query with an `isManager && orgId` ternary — reading
  the actual file showed it queries unconditionally and relies entirely on
  RLS for scoping. Fixed the plan to match that real pattern rather than the
  wrong assumption. (2) The nav-entry step was originally bundled into the
  types-only task, which would have shipped a live sidebar link to a 404 page
  for one handover turn before the list page landed — the exact ordering
  mistake Vehicle Tracking v1 hit and fixed by bundling nav+page together (see
  that phase's notes below). Fixed by moving the nav edit into the same task
  as the list page.
- Codex handles text edits only; conductor runs all shell/build/git and the
  DB migration via Supabase MCP.

## Notes (Vehicle Tracking v2) [complete, kept for reference]
- **All 6 implementation items (C-1 through C-6) complete and verified (2026-07-12).**
  Every turn was verified directly by the conductor (Read the actual files +
  `pnpm run build`), not taken on Codex's report alone — one real, small deviation
  was found and fixed this way: C-2's plan only specified changing the vehicle
  detail back-link, but missed that `archiveVehicle()` in the same file still
  `router.push('/dashboard/expenses')`d after archiving — a stale redirect now that
  Vehicles has its own route (a plan-authoring gap, not a Codex mistake). Fixed
  directly by the conductor. No other discrepancies found across the remaining 5
  items. Full `pnpm run build` passes clean end-to-end. Remaining: the manual smoke
  test (crew isolation, real rego lookup once the user adds `CAR_REGO_API_KEY`,
  receipt requirement, driven-by display) requires the user's own authenticated
  sessions and real API credentials the conductor doesn't have — same precedent as
  every prior phase — plus the user still needs to sign up for CarRegistrationAPI.com,
  purchase the initial ≥100-lookup credit block (~$30 AUD), and add the key to Vercel.
- Source spec: docs/superpowers/specs/2026-07-11-vehicle-tracking-v2-design.md
- Source plan: docs/superpowers/plans/2026-07-11-vehicle-tracking-v2.md
- Direct follow-up request right after v1 shipped: notes should be independently
  saved (not one overwritable field), Vehicles should move to its own nav page under
  Money instead of living inside Expenses, and rego lookup should auto-fill vehicle
  details from just the registration number "like insurance companies/Service NSW/
  Repco do it."
- Researched the rego-lookup feasibility question directly (WebSearch/WebFetch)
  before committing to a design — real AU vehicle data is regulated (state road
  authorities, accessed only through licensed resellers), so there's no free public
  endpoint at any provider, but CarRegistrationAPI.com (white-labelling regcheck.org.uk)
  is a genuine, cheap, small-business-appropriate option: ~$0.30 AUD/lookup, all 8
  states/territories, no enterprise sales process — unlike the NEVDIS-broker tier
  (InfoAgent/MotorWeb/VehicleID, opaque "contact us" pricing) or PPSR searches ($6/each,
  a different product — finance/write-off/stolen checks, not vehicle details).
  **Correction surfaced mid-conversation, before the user approved spend:** initial
  framing was "30c/lookup" — actual pricing is prepaid blocks of ≥100 lookups
  (~$30 AUD minimum), not true pay-as-you-go from the first use. Flagged explicitly
  before the user's go-ahead, not glossed over.
- Exact request/response field names for the AU-specific service couldn't be fully
  confirmed even after fetching the provider's own PDF doc (partially unreadable
  extraction) — implemented against the well-documented general regcheck.org.uk JSON
  pattern with defensive field-name parsing, explicitly flagged in both the plan and
  the route's own code comment as needing verification once the user has real
  credentials (not a stub — real, working best-effort code).
- User requested "professional" fleet-page polish after the design was already
  approved but before the plan was finalized — dispatched two parallel research
  agents (Fleetio/Samsara/Motive/Simply Fleet/AUTOsist docs) on vehicle expense
  approval patterns and single-driver-vs-shared-vehicle patterns specifically, per
  explicit user instruction to "send out sub agents." Both came back validating the
  already-approved design (crew-scoped any-manager-approves; single current assignee,
  no reservation system) as appropriate for this business's scale — real fleet
  products' more elaborate patterns (per-vehicle designated approvers, dollar-tiered
  approval limits, pool-vehicle reservation/kiosk systems) are consistently aimed at
  large fleets/government/university scale, not a trades business with a handful to
  dozens of vehicles. Two cheap, consistently-observed patterns were adopted as a
  result — required receipts on vehicle expenses, optional driver-on-the-day
  attribution on odometer logs — deliberately scoped narrowly (see the spec's §4 and
  the plan's Task 5) to avoid the two most obvious ways to over-generalize this: (1)
  extending "required receipt" to `BusinessExpensesView`'s general form, which has no
  receipt UI at all for any expense type and would need separate work; (2) adding
  "driven by" to the shared `expenses` table, where `user_id` already has an
  established, different meaning ("who submitted this") used across the whole app.
  A dollar-threshold auto-approval tier — the single strongest pattern in the
  approval research — was explicitly declined by the user (no real spend data yet to
  pick a sensible number), correctly left out rather than guessed at.
- **Real bugs caught during the plan's own self-review, before any code was
  written:** (1) the already-shipped `VehicleDetailClient.tsx` has its own
  `notes`/`setNotes` state bound to the old single-text `vehicles.notes` column
  (textarea, read-only display, save payload) — the new notes-log feature would have
  silently collided with it under the same variable name; the plan now explicitly
  requires removing the old code first. (2) the `Vehicle` TypeScript type was never
  updated for the `state`/`notes` column changes at all — would have been a real
  compile break. (3) a draft of the rego-lookup Refresh handler referenced a
  nonexistent `next_service_due_km` field from the lookup API response — self-caught
  and removed before the plan was finalized.
- Codex handles text edits only; conductor runs all shell/build/git, the `git mv`
  route relocation, and both DB migrations via Supabase MCP.

## Notes (Vehicle Tracking v1) [complete, kept for reference]
- Source spec: docs/superpowers/specs/2026-07-11-vehicle-tracking-design.md
- Source plan: docs/superpowers/plans/2026-07-11-vehicle-tracking.md
- Direct feature request: track company vehicles (rego, servicing, receipts, km,
  employee assignment) feeding into Business Expenses; raised alongside "should
  paychecks feed business expenses too" — investigated and resolved without new code:
  payroll already summed into the Finance page's P&L/pie chart via a separate
  `pay_statements` join, it was just showing $0 because no team member had an hourly
  rate set. User set everyone to $50/hr mid-session; backdated 3 real weekly pay runs
  from actually-logged (previously unapproved/submitted) timesheet hours at that rate
  — not synthetic numbers — confirmed by direct SQL, not through the app UI (no
  credentials for the real admin account in this session).
- New crew-scoped visibility model (`can_access_vehicle()`): owner/admin always;
  manager scoped to their own crew's members (falls back to org-wide for
  unassigned/non-crew vehicles); anyone can view/log km/log expenses for a vehicle
  assigned to themselves regardless of role, but never edit it. First time this
  codebase scopes anything by crew — `crew_members`/`crews.manager_id` previously had
  no visibility restriction anywhere (any org member could already view any crew).
- Vehicle costs are literally `is_business` expense rows with a `vehicle_id` tag — no
  separate ledger, so they automatically show up in the existing Business Expenses
  list, approval flow, and the Finance page's category pie chart with zero extra code.
- **Real correction caught during plan-writing, before any code was written:** the
  approved spec said "`ExpenseForm` gains a vehicle picker" — checking the actual
  component revealed `ExpenseForm.tsx` never sets `is_business` at all (personal
  expenses only); the real business-expense creation form is inline inside
  `BusinessExpensesView.tsx`. Fixed by targeting the correct component in the plan: a
  vehicle dropdown on `BusinessExpensesView`'s form, plus the vehicle detail page gets
  its own separate, small expense-logging form (since an assigned employee — who needs
  to log vehicle expenses per the approved design — is never shown
  `BusinessExpensesView` at all, that component is manager+-gated).
- Odometer readings update the vehicle's denormalized `current_odometer_km` through a
  SECURITY DEFINER RPC (`log_vehicle_odometer`), not a raw table UPDATE — the assigned
  employee is deliberately not granted `vehicles` UPDATE by RLS (editing stays
  manager+-only), so the RPC is their one narrow, purpose-built write path found while
  translating the approved design into concrete RLS policies.
- Archive (soft-delete) is the only retirement UI this pass; a DB-level admin/owner
  hard-delete RLS policy exists for completeness but no UI button calls it yet
  (deliberate trim, noted in both the plan and this file, not a silent omission).
- 30-day / 500km "due soon" thresholds are shared constants (`src/lib/vehicles.ts`)
  used by both the vehicle detail badges and the dashboard "Today" widget extension, so
  the two can never disagree.
- Codex handles text edits only; conductor runs all shell/build/git and the DB
  migration via Supabase MCP. Plan Task 2 (Expenses page) and Task 4 (Business
  Expenses vehicle picker) are bundled into one handover item (C-2) since splitting
  them leaves an intermediate broken build.
- **All 4 implementation items (C-1 through C-4) complete and verified (2026-07-11).**
  Codex hit the known Windows `workspace-write` sandbox subprocess limitation
  (`CreateProcessAsUserW failed: 5`) partway through C-2 and briefly during C-4's
  setup — its own shell-based re-verification reads failed both times, but its file
  edits (internal editor, not shell) went through regardless and it reported the
  limitation honestly rather than claiming full verification. C-3 and the rest of C-4
  ran clean with no sandbox issues. Every turn was verified directly by the conductor
  (Read the actual files + `pnpm run build`), not taken on Codex's report alone — two
  real, small deviations were found and fixed this way:
  (1) C-2: `expenses/page.tsx` showed the Vehicles section to any team-plan org member
  instead of gating it to manager+ or someone with a visible vehicle, contradicting
  the approved spec's "employee with no assigned vehicle sees nothing" — RLS itself
  was always correct, this was a display-condition bug only.
  (2) C-4: neither expense-block's `isLast` border check accounted for
  `vehiclesDue.length`, so the row before the new vehicle rows would render without a
  divider whenever vehicle-due items exist but approvals/unread/timed items are all
  empty — my own C-4 dispatch instruction only flagged the *approvals* block as
  needing no border change, not these two, which is the actual root cause of the miss.
  Both fixed directly by the conductor as small, well-understood corrections, not full
  Codex turns. Full `pnpm run build` passes clean end-to-end. Remaining: the manual
  smoke test (crew isolation both directions, assigned-employee-only visibility,
  dashboard Today due-items) requires the user's own authenticated sessions for real
  team members — same precedent as every prior phase, the conductor has no
  credentials for the real `admin@vividex.au` account.

## Notes (Session-Scheduled Client Email) [complete, kept for reference]
- **Post-ship debugging (2026-07-10):** first live test showed no email arriving for a recurring
  series booking, even though the one-off booking's email arrived fine seconds earlier for the
  same client. Root-caused via `systematic-debugging`: confirmed via direct SQL
  (`session_series`/`sessions` joined to `clients`) that both sends used the identical client and
  identical recipient email — ruled out a wrong-recipient bug. Confirmed via the user's Resend
  dashboard that the API call was accepted for both sends. The actual status (once it updated)
  was `delivery_delayed`, not a silent failure — Microsoft/Outlook.com deferred the message
  (reputation-based soft defer, common for a sending domain without deep history with a specific
  recipient, especially after several test sends to the same address in quick succession). No
  code change was made — this is confirmed external/environmental, not an application bug. Worth
  remembering for any future outbound-email feature: an `outlook.com`/`hotmail.com` recipient
  during testing may show inconsistent delivery even when the code path is verified correct: check
  Resend's per-email status field (not just the list view, which may lag) before assuming a bug.
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

## Notes (JSA Document Type + Reusable Signatures)
- Source spec: docs/superpowers/specs/2026-07-18-jsa-form-builder-design.md
- Source plan: docs/superpowers/plans/2026-07-18-jsa-and-signatures.md
- Zero cost — pure code + two additive DB migrations (doc_type column on
  project_swms_documents; profiles.signature_path + a new private signatures storage bucket with
  owner-only RLS). No new npm dependencies — signature capture is a hand-rolled <canvas>
  component, same pattern already proven by WhiteboardCanvas.tsx/LogoUpload.tsx. No external API
  calls at runtime (the 11 JSA hazard templates were researched during plan-writing via three
  parallel background research agents against SafeWork Australia/state regulator sources, not a
  paid runtime dependency).
- Two independently-shippable parts: Part A (JSA document type, items A-1..A-8) can ship and be
  used standalone; Part B (reusable signatures, items B-1..B-6) layers on top and touches SWMS too
  (retroactively adds a sign-off area the shipped SWMS PDF never had).
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only; conductor
  runs all shell/build/git and both DB migrations via Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Manual smoke tests (building a JSA, drawing/saving a signature, the acknowledgment-signature
  flow, viewing a signed PDF) require an authenticated browser session the conductor doesn't have
  — user follow-up, same precedent as every prior phase.

## Phase complete: JSA Document Type + Reusable Signatures (14/14 items, all verified)
All items A-1 through A-8 (Part A, JSA document type) and B-1 through B-6 (Part B, reusable
signatures) done, verified via git diff against the plan, and committed individually. One real
bug found and fixed during verification, not present in the plan: `NextResponse(buffer, ...)` in
the new on-demand PDF route doesn't type-check against Buffer -- fixed with
`new NextResponse(new Uint8Array(buffer), ...)`. Full `pnpm run build` passes clean end to end;
the new PDF route confirmed present in the build's route table. Manual smoke (building a JSA,
drawing a signature, the acknowledgment-signature flow, viewing a signed PDF) deferred to the
user -- same precedent as every prior phase.

## Notes (Site Sign-In)
- Source spec: docs/superpowers/specs/2026-07-19-site-sign-in-design.md
- Source plan: docs/superpowers/plans/2026-07-19-site-sign-in.md
- Zero cost — pure code + one additive DB migration (projects.site_id, site_sign_ins table +
  RLS, supplemental OR-clause on 3 existing SWMS/JSA policies). No new npm dependencies. No
  external API calls at runtime.
- Access-gate feature only, deliberately not attendance/payroll -- confirmed directly with the
  user during brainstorming before any design work started.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only; conductor
  runs all shell/build/git and the one DB migration via Supabase MCP.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Manual smoke tests (sign-in widget, notification delivery) require an authenticated browser
  session the conductor doesn't have -- user follow-up, same precedent as every prior phase.

## Phase complete: Site Sign-In (5/5 items, all verified)
All items SS-1 through SS-5 done, verified via git diff against the plan, and committed
individually. One real gap found during verification, not present in the plan: the Dashboard
Today item's border/separator logic only updated the immediately-preceding category
(timedItems), missing the six categories before it -- would have shown a missing divider on a
day with pending SWMS/JSA signatures but no meetings/sessions/events. Codex correctly flagged
this as a documented risk rather than silently deviating from the plan; fixed directly as
conductor by threading the same condition through all six remaining categories. Full
`pnpm run build` passes clean end to end. Manual smoke (sign-in widget, notification delivery)
deferred to the user -- same precedent as every prior phase.

## Notes (Project-Site Linking)
- Source spec: docs/superpowers/specs/2026-07-19-project-site-linking-design.md
- Source plan: docs/superpowers/plans/2026-07-19-project-site-linking.md
- Zero cost -- pure code, no migration (projects.site_id already exists from the Site Sign-In
  phase). No new npm dependencies. No external API calls.
- Deliberately narrow retrofit control rather than a general project-edit form, since no such
  form exists in this codebase today and building one is out of scope for this phase.
- Windows: Codex workspace-write sandbox cannot spawn subprocesses. Text edits only; conductor
  runs all shell/build/git.
- pnpm is the package manager. Verification gate = `pnpm run build`.
- Manual smoke (site picker at creation, retrofit control) requires an authenticated browser
  session the conductor doesn't have -- user follow-up, same precedent as every prior phase.
