# Hands-on Onboarding Tutorial — Design

## Background

The existing tutorial (`src/components/tutorial/`) is a one-shot "spotlight tour": it dims the
screen and points at sidebar nav items (`data-tutorial="..."` targets) one at a time with a
description card, then shows a generic tips screen. It never asks the user to actually do
anything. It's also out of date — only 6 of the ~20 current nav items carry a `tutorialId`
(`SidebarNav.tsx`), and it has zero awareness of Students, Subjects, Programs, or any tutoring
feature built this session. It's gated to org members who joined in the last 30 days
(`dashboard/layout.tsx:52-56`), which — as an unintended side effect — means **solo (non-org) Pro
users never see it at all**, since `isNewMember` is hardcoded `false` when there's no
`organisation_members` row.

This replaces it with a hands-on walkthrough: the tutorial sends the user to the real page for
each step, waits for them to actually complete the action (or lets them skip), and chains real
created records (e.g. the client they just made) into the next step's target. Each business
profile gets its own step sequence; only Tutoring gets a bespoke one for now.

**Scope decided during brainstorming (2026-07-08):**
- Tutoring gets the full bespoke flow: Client → Student → Upload a file to Subjects → Program →
  Session → Schedule a call. Every other profile (9 of them) gets a generic fallback flow: Client
  → Project → Session, using that profile's own terminology. Bespoke flows for other profiles are
  explicitly deferred — most don't have differentiated features built yet.
- Step completion is auto-detected server-side (did the expected row get created?) but a manual
  "Continue" button is always present too, so nobody gets stuck on a detection gap.
- Auto-detection is scoped to "created after this tutorial run's `started_at`", not "does this
  exist at all" — this is what makes replaying safe for an account with a week of existing data;
  old rows never trigger a false-positive completion.
- Every step is individually skippable, and the whole tutorial is skippable at any point.
- Replayable at any time from Settings → Profile tab, bypassing the "only within N days of
  joining" gate that governs the *automatic* first-run trigger.
- Fixes the solo-user gap identified above as part of this work — the automatic trigger condition
  changes from "joined an org in the last 30 days" to "no tutorial state row exists yet", which
  applies identically to org and solo accounts (see Architecture → Auto-trigger below).

## Data model

Extends the existing `user_onboarding_dismissed` table (currently just `user_id`, `org_id`,
`dismissed_at not null default now()`, RLS: `user_id = auth.uid()` for all operations) rather than
introducing a new table — same row identity (one per user), just a fuller state machine.

**`supabase/schema-095-tutorial-state.sql`:**
```sql
alter table user_onboarding_dismissed
  add column profile_key text,
  add column current_step_index integer not null default 0,
  add column started_at timestamptz,
  add column context jsonb not null default '{}'::jsonb,
  alter column dismissed_at drop not null,
  alter column dismissed_at drop default;

-- Grandfather every existing user so this ships without surprising anyone already using the
-- app — only accounts created *after* this migration lack a row and are eligible for the
-- automatic Welcome trigger (see "Auto-trigger" below).
insert into user_onboarding_dismissed (user_id, org_id, dismissed_at)
select p.id, om.org_id, now()
from profiles p
left join organisation_members om on om.user_id = p.id
on conflict (user_id) do nothing;
```
No RLS changes needed — the existing `user_id = auth.uid()` policy already covers every column.

**Row semantics** (no separate `active` boolean — derived from these three fields):
- No row, or row with `started_at is null and dismissed_at is null` → tutorial hasn't started;
  `Welcome` may render (see gating below).
- `started_at is not null and dismissed_at is null` → in progress; render the tracker at
  `current_step_index`.
- `dismissed_at is not null` → hidden. Skipping (whole tutorial) and finishing both set this.
- `context` — a small jsonb bag (e.g. `{ "clientId": "...", "clientName": "..." }`) carrying IDs
  captured from completed steps forward into later steps' target links and detection queries.

## Auto-trigger (replaces the 30-day gate)

**Modify `src/app/dashboard/layout.tsx`** — delete the `isNewMember`/`thirtyDaysAgo` block
(lines 52-63) entirely. Replace with: fetch the user's `user_onboarding_dismissed` row. If none
exists, the user is eligible for the automatic Welcome trigger — this is correct for both org and
solo accounts because of the migration backfill above (everyone pre-existing already has a row).
Resolve `profile_key` via the `getWorkspaceProfileForUser` call already on line 66 (no new query).
Pass the row's fields (or defaults for "no row") into `TutorialProvider` as `initialState`.

The Settings "Restart tutorial" action (below) always works regardless of this gate — it directly
writes `started_at`, which is what actually puts the tracker on screen; the "no row yet" check
above only governs whether the automatic *Welcome* modal appears unsolicited.

## Step definitions

**`src/lib/tutorial/types.ts`** — shared types:
```typescript
export type TutorialContext = Record<string, string>

export type TutorialStep = {
  id: string
  title: string
  instructions: string
  target: (ctx: TutorialContext) => string   // href to send the user to
  fallbackTarget?: string                    // used if a required ctx key is missing
}
```

**`src/lib/tutorial/steps/tutoring.ts`** — the bespoke flow, in this order:

| # | id | target | captures into context | detection |
|---|---|---|---|---|
| 1 | `client` | `/dashboard/clients` | `clientId`, `clientName` | newest `clients` row (org/owner-scoped) with `created_at >= started_at` |
| 2 | `student` | `/dashboard/clients/${ctx.clientId}/students?new=1` (fallback `/dashboard/clients` if no `clientId`) | — | `students` row with `client_id = ctx.clientId` and `created_at >= started_at` |
| 3 | `subjects` | `/dashboard/subjects` | — | `topic_assets` row with `created_by = userId` and `created_at >= started_at` |
| 4 | `program` | `/dashboard/programs` | — | `programs` row (org/owner-scoped) with `created_at >= started_at` |
| 5 | `session` | `/dashboard/clients/${ctx.clientId}/sessions?new=1` (fallback `/dashboard/clients`) | — | `sessions` row with `client_id = ctx.clientId` and `created_at >= started_at` |
| 6 | `video_call` | `/dashboard/video` | — | `scheduled_calls` row with `created_by = userId` and `created_at >= started_at` |

Steps 2 and 5 reuse the `?new=1` deep-link convention already built this session
(`NewSessionModal`/`StudentForm`'s `defaultOpen` prop) so the create form is already open when the
user lands, rather than making them find the button again. Step 3 (Subjects) has no single deep
link — it requires picking a year group, then a subject, then creating/opening a topic — so its
instructions spell out that path in prose rather than attempting to shortcut it.

**`src/lib/tutorial/steps/generic.ts`** — fallback for the other 9 profiles:

| # | id | target | captures | detection |
|---|---|---|---|---|
| 1 | `client` | `/dashboard/clients` | `clientId`, `clientName` | same as tutoring step 1 |
| 2 | `project` | `/dashboard/projects` | — | `projects` row (org/owner-scoped) with `created_at >= started_at` |
| 3 | `session` | `/dashboard/clients/${ctx.clientId}/sessions?new=1` (fallback `/dashboard/clients`) | — | same as tutoring step 5 |

Copy uses `terminology.client`/`terminology.project`/`terminology.session` (e.g. "Members" for
Personal Training) — this is the first real consumer of the `project`/`session` terminology keys,
which the registry has defined since the workspace-profile engine shipped but nothing has read
until now.

**`src/lib/tutorial/steps/index.ts`**: `getStepsForProfile(profileKey, terminology): TutorialStep[]`
— returns the tutoring array for `'tutoring'`, the generic array (with terminology interpolated)
for everything else.

## Detection

**`src/lib/tutorial/detect.ts`** — one function per detection query above, each taking
`(supabase, { userId, orgId, startedAt, context })` and returning
`{ done: boolean; context?: TutorialContext }` (the `context` return is only populated by the
steps that capture something — client creation). All queries follow the existing codebase idiom:
`orgId ? .eq('org_id', orgId) : .eq('owner_id', userId)` for org/owner-scoped tables (clients,
programs), and a direct scoped column (`client_id`, `created_by`) for the rest, per the table above.

## API routes

- **`src/app/api/tutorial/start/route.ts`** (new, POST) — upserts
  `started_at: now(), current_step_index: 0, context: {}, dismissed_at: null, profile_key: <resolved>`.
  Called by `WelcomeModal`'s "Let's go" and by the Settings restart button.
- **`src/app/api/tutorial/advance/route.ts`** (new, POST) — body `{ stepIndex, context? }`; updates
  `current_step_index` and shallow-merges `context` into the stored jsonb. Called when a step's
  detection succeeds, when the user clicks manual Continue, and when they skip a single step.
- **`src/app/api/tutorial/check/route.ts`** (new, GET, `?stepId=...`) — loads the user's current
  row, calls the matching `detect.ts` function, returns `{ done, context? }`. Polled by the tracker
  (below) while a step is showing.
- **`src/app/api/tutorial/dismiss/route.ts`** (existing, unchanged) — sets `dismissed_at: now()`.
  Used for "Skip tutorial" at any point, and auto-called after the last step completes/is skipped.

## UI components

**`src/components/tutorial/TutorialProvider.tsx`** (rewritten) — receives `initialState` (row
fields or "no row" defaults) and `profileKey`/`terminology` as props from the server layout.
Resolves `steps = getStepsForProfile(...)` once. Exposes:
`phase: 'welcome' | 'steps' | 'complete' | 'done'`, `currentStep`, `stepIndex`, `totalSteps`,
`context`, and actions `start()`, `advanceStep(context?)`, `skipStep()`, `skipTutorial()` — each
calls the matching API route, then updates local state optimistically (no full reload needed).
While `phase === 'steps'`, runs a polling effect: checks the current step every 5s, plus
immediately on `visibilitychange`/window focus (covers the common case of the user alt-tabbing
back after doing the real-world action on another tab/page) — calling `advanceStep` automatically
the moment `done` comes back `true`.

**`src/components/tutorial/WelcomeModal.tsx`** (updated, not replaced) — same modal shell; "Let's
go" now calls `start()` instead of a local `advance()`; copy references the resolved profile's
label (e.g. "Let's get your tutoring business set up") instead of generic copy.

**`src/components/tutorial/TutorialTracker.tsx`** (new, replaces `TutorialOverlay.tsx`) — a
small persistent floating card, **bottom-left** (the existing `FloatingWidgets` FAB cluster owns
bottom-right, per `FloatingWidgets.tsx:125`, so this avoids collision). Collapsible. Shows
"Step X of Y", the step title/instructions, a primary button that does
`router.push(currentStep.target(context))`, a "Skip this step" link (calls `skipStep()`), and a
"Skip tutorial" link (calls `skipTutorial()`, with a confirm since it's the permanent one). Because
`TutorialProvider` lives in the shared `dashboard/layout.tsx`, this card persists automatically
across every client-side navigation the tutorial sends the user through — no extra plumbing needed
for that.

**`src/components/tutorial/TutorialComplete.tsx`** (new, replaces `TipsScreen.tsx`) — a brief
one-screen congratulations shown once when the last step finishes or is skipped ("Nice — you're
all set" + a short recap of what got created), with a single "Done" button that calls
`skipTutorial()` (which is really just "dismiss" at this point — reusing the same endpoint keeps
the API surface small). Generic tips content from the old `TipsScreen` is dropped, not ported —
none of it was tutoring/profile-aware and it duplicated things better covered by the walkthrough
itself.

**Deleted**: `src/components/tutorial/TutorialOverlay.tsx`, `src/lib/tutorial-steps.ts`,
`src/components/tutorial/TipsScreen.tsx` (superseded by the files above).
`SidebarNav.tsx`'s `tutorialId`/`data-tutorial` plumbing (`SidebarNav.tsx:17, 53-77, 106-116`) is
also removed — nothing spotlights nav items anymore.

## Settings — replay entry point

**`src/components/tutorial/RestartTutorialButton.tsx`** (new, client component) — a button that
calls `POST /api/tutorial/start` then `router.push('/dashboard')`. Rendered in
**`src/app/settings/page.tsx`**'s `profileTab` (alongside the other account-level cards, e.g. near
"Push notifications"), copy: "Replay the getting-started walkthrough" / "Restart tutorial". No age
gate — always available regardless of account age, per the brainstorming decision.

## Error handling / edge cases

- **Missing `context.clientId` at step 2 or 5** (user skipped the client step manually): `target()`
  falls back to `/dashboard/clients` with instructions adjusted to "pick or add a client first,
  then find their Students/Sessions tab" rather than constructing a URL with an undefined id.
- **Detection false-negative** (e.g. a student was created but the query missed it for some
  reason): the manual Continue button is always rendered alongside the auto-detected state, so the
  user is never blocked.
- **Replay with a week of existing data**: solved structurally by scoping every detection query to
  `created_at >= started_at`, which `start` resets to `now()` — old rows are invisible to
  detection regardless of how much data exists.
- **User navigates away from the app mid-tutorial and comes back days later**: state is DB-backed
  (`current_step_index`, `context`, `started_at` all persisted), so `dashboard/layout.tsx` resumes
  exactly where they left off — no separate "abandoned tutorial" handling needed.

## Out of scope (explicitly deferred)

- Bespoke hands-on flows for the other 9 profiles — they get the generic 3-step fallback for now.
- Any admin/analytics visibility into how far users get through the tutorial (e.g. a funnel view)
  — not requested, no consumer exists.
- Re-adding `tutorialId` nav-spotlighting for the new nav items (Students, Sessions, Programs,
  Subjects) — superseded by the hands-on flow, not ported.
- Updating the AI Assistant's knowledge of tutoring features — separate spec, tracked
  independently (per this session's brainstorming decomposition).

## Verification

No test runner in this project — verification is `pnpm run build` plus manual smoke testing:
1. Brand-new tutoring signup: `/onboarding` → `/setup` (industry: Tutoring) → `/dashboard` →
   Welcome modal fires → "Let's go" → tracker shows Step 1/6 (Client). Create a client → tracker
   auto-advances to Step 2/6 (Student), landing on `/dashboard/clients/{id}/students?new=1` with
   the form already open.
2. Skip a single step (e.g. Subjects) → advances to Program without requiring a `topic_assets` row.
3. Skip the whole tutorial from the tracker → it disappears; reloading the dashboard doesn't bring
   it back.
4. Complete all 6 steps → `TutorialComplete` shows once, dismissing hides it permanently.
5. Settings → "Restart tutorial" on an account with a week of existing clients/students/sessions →
   tracker restarts at Step 1 without instantly auto-completing every step from old data.
6. A non-tutoring profile (e.g. Personal Training) signup gets the 3-step generic flow with
   "Members"/"Sessions"-style terminology substituted in.
7. The existing pre-migration account (Vividex org, 5 members) — confirm the backfill means no one
   sees an unsolicited Welcome modal after this ships.
8. Solo Pro signup (no org) — confirm the Welcome modal now fires for them too (previously never
   did, per the `isNewMember` bug this fixes).
