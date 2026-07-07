# Hands-on Onboarding Tutorial

## Goal
Replace the outdated spotlight-tour tutorial with a hands-on walkthrough that sends the user
through real pages, auto-detects step completion (scoped to the current run so replaying never
false-positives off old data), lets the user skip any step or the whole tutorial, and gives
Tutoring a bespoke 6-step flow with a 3-step generic fallback for the other 9 profiles.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-08-hands-on-onboarding-tutorial-design.md`
- Source plan: `docs/superpowers/plans/2026-07-08-hands-on-onboarding-tutorial.md`
- Extends `user_onboarding_dismissed` (not a new table) into a fuller state row: `started_at`,
  `current_step_index`, `context` jsonb, nullable `dismissed_at`, `profile_key`.
- Detection is scoped to `created_at >= started_at` — never "does this exist at all" — so
  replaying an account with a week of existing data doesn't instantly auto-complete every step.
  Manual "Skip this step" (which doubles as manual-advance) is always available as an escape hatch.
- Tutoring: Client → Student → Subjects upload → Program → Session → Schedule a call (6 steps, in
  this order, ids: `client`, `student`, `subjects`, `program`, `session`, `video_call`). Every
  other profile gets Client → Project → Session (3 steps, ids: `client`, `project`, `session`),
  copy driven by that profile's `terminology`.
- Steps 2/5 (tutoring) and step 3 (generic) reuse the `?new=1` deep-link convention already built
  this session (`NewSessionModal`/`StudentForm`'s `defaultOpen` prop) — chained using the
  `clientId` captured from the Client step's completion.
- Migration backfills every existing user with a dismissed row so nobody who's already using the
  app gets an unsolicited "Welcome" popup after this ships. New signups naturally have no row and
  are eligible for the automatic trigger.
- Fixes a real pre-existing bug found during design: solo (non-org) users never saw the old
  tutorial at all (the old `isNewMember` check was hardcoded false without an org). The new trigger
  condition ("no tutorial row yet") applies identically to org and solo accounts.
- Settings gets a "Restart tutorial" action with no age gate — always available.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, tauri, supabase) — the conductor
  handles those, including applying the database migration via Supabase MCP.
- Read a file before editing it if its structure is unknown (especially `SidebarNav.tsx` and
  `dashboard/layout.tsx`, both being surgically modified, not rewritten wholesale).
- After each task, list the files changed/created/deleted.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box and committing.
- Apply `supabase/schema-095-tutorial-state.sql` via Supabase MCP `apply_migration` (project id
  `sdwwlnnsijcadkdwsvud`) — Codex cannot do this.
- Manual click-through smoke test requires an authenticated browser session the conductor doesn't
  have — that final acceptance step is the user's own verification, same precedent as this
  project's desktop/video-call smoke tests.
- Commit each verified item separately (per the handover loop's own protocol) rather than holding
  everything for one giant commit at the end.

---

## C-1 — Database migration

*Codex edits:*
- [x] Create `supabase/schema-095-tutorial-state.sql` (plan Task 1, Step 1 — exact SQL is in the plan doc)
- [x] Report back — list files changed.

*Conductor:*
- [x] Apply via Supabase MCP `apply_migration` (name `tutorial_state`).
- [x] Verify: `select` confirms new columns exist and every current `profiles` row now has a
  matching `user_onboarding_dismissed` row with `dismissed_at` set. (7 profiles, 7 backfilled rows.)
- [x] Commit: `git add supabase/schema-095-tutorial-state.sql && git commit -m "handover: C-1 tutorial state migration"`

---

## C-2 — Tutorial step definitions (shared lib)

*Codex edits:*
- [x] Create `src/lib/tutorial/types.ts` (plan Task 2, Step 1)
- [x] Create `src/lib/tutorial/steps/tutoring.ts` (plan Task 2, Step 2 — 6 steps, exact ids/order in plan)
- [x] Create `src/lib/tutorial/steps/generic.ts` (plan Task 2, Step 3 — 3 steps, terminology-driven)
- [x] Create `src/lib/tutorial/steps/index.ts` (plan Task 2, Step 4 — `getStepsForProfile`)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — passes clean.
- [x] Commit: `git add src/lib/tutorial/types.ts src/lib/tutorial/steps && git commit -m "handover: C-2 tutorial step definitions"`

---

## C-3 — Detection + API routes

*Codex edits:*
- [ ] Create `src/lib/tutorial/detect.ts` (plan Task 3, Step 1 — exact code in plan doc)
- [ ] Create `src/app/api/tutorial/start/route.ts` (plan Task 3, Step 2)
- [ ] Create `src/app/api/tutorial/advance/route.ts` (plan Task 3, Step 3)
- [ ] Create `src/app/api/tutorial/check/route.ts` (plan Task 3, Step 4)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — passes clean.
- [ ] Commit: `git add src/lib/tutorial/detect.ts src/app/api/tutorial && git commit -m "handover: C-3 tutorial detection + API routes"`

---

## C-4 — TutorialProvider + WelcomeModal

*Codex edits:*
- [ ] Rewrite `src/components/tutorial/TutorialProvider.tsx` (plan Task 4, Step 2 — exact code in plan doc)
- [ ] Update `src/components/tutorial/WelcomeModal.tsx` (plan Task 4, Step 3)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — note this may still fail until Task 6 rewires `dashboard/layout.tsx`'s
  props to match the new `TutorialProvider` signature; if so, confirm the *only* errors are in
  `dashboard/layout.tsx` (expected, fixed in C-6) and not elsewhere.
- [ ] Commit: `git add src/components/tutorial/TutorialProvider.tsx src/components/tutorial/WelcomeModal.tsx && git commit -m "handover: C-4 TutorialProvider rewrite"`

---

## C-5 — TutorialTracker + TutorialComplete (replace TutorialOverlay + TipsScreen)

*Codex edits:*
- [ ] Create `src/components/tutorial/TutorialTracker.tsx` (plan Task 5, Step 1)
- [ ] Create `src/components/tutorial/TutorialComplete.tsx` (plan Task 5, Step 2)
- [ ] Delete `src/components/tutorial/TutorialOverlay.tsx`, `src/lib/tutorial-steps.ts`,
  `src/components/tutorial/TipsScreen.tsx` (plan Task 5, Step 3)
- [ ] Report back — list files changed/deleted.

*Conductor:*
- [ ] `pnpm run build` — `dashboard/layout.tsx` will still reference the deleted components/old
  props until C-6; confirm errors are confined there.
- [ ] Commit: `git add -u src/components/tutorial src/lib/tutorial-steps.ts && git commit -m "handover: C-5 TutorialTracker + TutorialComplete, remove old overlay/tips"`

---

## C-6 — Wire into dashboard layout + clean up nav

*Codex edits:*
- [ ] Modify `src/app/dashboard/layout.tsx` (plan Task 6, Step 2 — replace `isNewMember` block,
  new `initialState`/`profileKey` props, swap `TutorialOverlay`/`TipsScreen` for
  `TutorialTracker`/`TutorialComplete`)
- [ ] Modify `src/components/nav/SidebarNav.tsx` (plan Task 6, Step 3 — remove `tutorialId`/
  `data-tutorial`/spotlight-dimming plumbing)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean now (this is the integration point where everything
  should compile together).
- [ ] Commit: `git add src/app/dashboard/layout.tsx src/components/nav/SidebarNav.tsx && git commit -m "handover: C-6 wire tutorial into dashboard layout"`

---

## C-7 — Settings replay entry point

*Codex edits:*
- [ ] Create `src/components/tutorial/RestartTutorialButton.tsx` (plan Task 7, Step 1 — exact code in plan doc)
- [ ] Modify `src/app/settings/page.tsx` (plan Task 7, Step 2 — add card to `profileTab`)
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Commit: `git add src/components/tutorial/RestartTutorialButton.tsx src/app/settings/page.tsx && git commit -m "handover: C-7 settings restart-tutorial entry point"`

---

## Acceptance checklist
- [ ] C-1: migration applied, existing users backfilled, verified live.
- [ ] C-2: tutoring (6-step) and generic (3-step, terminology-driven) step definitions exist.
- [ ] C-3: detection dispatcher + start/advance/check API routes exist and build clean.
- [ ] C-4: TutorialProvider exposes the new phase/step/context model; WelcomeModal calls `start()`.
- [ ] C-5: TutorialTracker (bottom-left, avoids the FAB cluster) and TutorialComplete exist; old
  overlay/tips/steps files removed.
- [ ] C-6: dashboard layout wires the new provider + components; nav spotlight plumbing removed.
- [ ] C-7: Settings has a working "Restart tutorial" action.
- [ ] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test (user's own verification — see plan Task 8, Step 2 checklist) confirms the
  live flow end-to-end for a tutoring signup, a generic-profile signup, skip behavior, and replay.

## Verification
No test runner in this project — verification is `pnpm run build` (tsc + eslint) after every
turn, full clean build after C-7, plus the manual smoke checklist in
`docs/superpowers/plans/2026-07-08-hands-on-onboarding-tutorial.md` (Task 8, Step 2), which
requires the user's own authenticated browser session.
