# Hands-on Onboarding Tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the outdated spotlight-tour tutorial with a hands-on walkthrough that sends the
user through real pages, auto-detects step completion (scoped to the current run so replaying
never false-positives off old data), lets the user skip any step or the whole tutorial, and gives
Tutoring a bespoke 6-step flow with a 3-step generic fallback for the other 9 profiles.

**Architecture:** Extends `user_onboarding_dismissed` into a fuller state row (`started_at`,
`current_step_index`, `context` jsonb, nullable `dismissed_at`). Step content is data-driven per
profile (`src/lib/tutorial/steps/*.ts`). A floating tracker card (persisted in the shared dashboard
layout) sends the user to each step's target page and polls a detection API; the API scopes every
"did this happen" query to `created_at >= started_at` so replaying an account with existing data
doesn't instantly auto-complete every step.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase
(`@supabase/ssr`). No new npm dependencies.

## Global Constraints

- Verification gate: `pnpm run build` (next build = tsc + eslint) must pass clean — no test runner
  in this project.
- Source spec: `docs/superpowers/specs/2026-07-08-hands-on-onboarding-tutorial-design.md`
- Codex: text edits only. Does NOT run shell commands, apply migrations, or touch Supabase — the
  conductor handles all of that.
- Windows: Codex's `workspace-write` sandbox cannot spawn subprocesses — text edits only anyway,
  consistent with prior handover runs in this repo.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/schema-095-tutorial-state.sql`

- [ ] **Step 1 (Codex): write the migration file**

```sql
-- ============================================================
-- TimeWiseHub — Schema 095: Hands-on onboarding tutorial state
-- Extends user_onboarding_dismissed (previously just a dismissal
-- flag) into a fuller state row tracking step progress. Same row
-- identity (one per user), RLS unchanged (user_id = auth.uid()
-- already covers every column). Run via Supabase MCP
-- apply_migration (name: tutorial_state)
-- ============================================================

alter table user_onboarding_dismissed
  add column profile_key text,
  add column current_step_index integer not null default 0,
  add column started_at timestamptz,
  add column context jsonb not null default '{}'::jsonb,
  alter column dismissed_at drop not null,
  alter column dismissed_at drop default;

-- Grandfather every existing user so this ships without an unsolicited "Welcome"
-- popup for anyone already using the app — only accounts created after this
-- migration lack a row and are eligible for the automatic Welcome trigger.
insert into user_onboarding_dismissed (user_id, org_id, dismissed_at)
select p.id, om.org_id, now()
from profiles p
left join organisation_members om on om.user_id = p.id
on conflict (user_id) do nothing;
```

- [ ] **Step 2 (Conductor): apply the migration**

Apply via Supabase MCP `apply_migration` (project id `sdwwlnnsijcadkdwsvud`, name
`tutorial_state`), then verify with a `select` that the new columns exist and that every current
user in `profiles` now has a row in `user_onboarding_dismissed`.

---

### Task 2: Tutorial step definitions (shared lib)

**Files:**
- Create: `src/lib/tutorial/types.ts`
- Create: `src/lib/tutorial/steps/tutoring.ts`
- Create: `src/lib/tutorial/steps/generic.ts`
- Create: `src/lib/tutorial/steps/index.ts`

**Interfaces:**
- Produces: `TutorialContext` (`Record<string, string>`), `TutorialStep` (`{ id, title,
  instructions, target(ctx), fallbackTarget? }`), `getStepsForProfile(profileKey, terminology):
  TutorialStep[]` — consumed by `TutorialProvider` (Task 4) and `detect.ts` (Task 3, keyed by
  `step.id`).

- [ ] **Step 1: `src/lib/tutorial/types.ts`**

```typescript
export type TutorialContext = Record<string, string>

export type TutorialStep = {
  id: string
  title: string
  instructions: string
  target: (ctx: TutorialContext) => string
  fallbackTarget?: string
}
```

- [ ] **Step 2: `src/lib/tutorial/steps/tutoring.ts`**

Export `TUTORING_STEPS: TutorialStep[]`, six steps in this exact order (ids matter — `detect.ts`
and the API routes key off them):

1. `id: 'client'` — title "Add your first client", target `() => '/dashboard/clients'`,
   instructions explaining the client create form is right there on the page.
2. `id: 'student'` — title "Add a student", target
   `ctx => ctx.clientId ? `/dashboard/clients/${ctx.clientId}/students?new=1` : '/dashboard/clients'`,
   `fallbackTarget: '/dashboard/clients'`, instructions: if they haven't picked a client yet, go
   pick or add one first, then open that client's Students tab.
3. `id: 'subjects'` — title "Upload a worksheet to Subjects", target
   `() => '/dashboard/subjects'`, instructions spelling out the hop: pick a year group → pick a
   subject → open or create a topic → drag a file into the upload zone there.
4. `id: 'program'` — title "Set up a program", target `() => '/dashboard/programs'`, instructions
   mentioning the "New program" button on that page.
5. `id: 'session'` — title "Create a session", target
   `ctx => ctx.clientId ? `/dashboard/clients/${ctx.clientId}/sessions?new=1` : '/dashboard/clients'`,
   `fallbackTarget: '/dashboard/clients'`, instructions reusing the client from step 1.
6. `id: 'video_call'` — title "Schedule a call", target `() => '/dashboard/video'`, instructions
   mentioning the "Schedule a call" button there.

- [ ] **Step 3: `src/lib/tutorial/steps/generic.ts`**

Export `getGenericSteps(terminology: Terminology): TutorialStep[]` (a function, not a static array,
since copy needs the resolved terminology), three steps:

1. `id: 'client'` — title `` `Add your first ${terminology.client.singular.toLowerCase()}` ``,
   target `() => '/dashboard/clients'`.
2. `id: 'project'` — title `` `Set up a ${terminology.project.singular.toLowerCase()}` ``, target
   `() => '/dashboard/projects'`.
3. `id: 'session'` — title `` `Create a ${terminology.session.singular.toLowerCase()}` ``, target
   `ctx => ctx.clientId ? `/dashboard/clients/${ctx.clientId}/sessions?new=1` : '/dashboard/clients'`,
   `fallbackTarget: '/dashboard/clients'`.

Import `Terminology` from `@/lib/workspace-profiles/types`.

- [ ] **Step 4: `src/lib/tutorial/steps/index.ts`**

```typescript
import type { Terminology } from '@/lib/workspace-profiles/types'
import { TUTORING_STEPS } from './tutoring'
import { getGenericSteps } from './generic'
import type { TutorialStep } from '../types'

export function getStepsForProfile(profileKey: string, terminology: Terminology): TutorialStep[] {
  return profileKey === 'tutoring' ? TUTORING_STEPS : getGenericSteps(terminology)
}
```

---

### Task 3: Detection + API routes

**Files:**
- Create: `src/lib/tutorial/detect.ts`
- Create: `src/app/api/tutorial/start/route.ts`
- Create: `src/app/api/tutorial/advance/route.ts`
- Create: `src/app/api/tutorial/check/route.ts`
- Read (no change needed): `src/app/api/tutorial/dismiss/route.ts`

**Interfaces:**
- `detect.ts` produces `checkStep(supabase, stepId, { userId, orgId, startedAt, context }):
  Promise<{ done: boolean; context?: TutorialContext }>` — a single dispatcher function (switch on
  `stepId`), not one export per step, so `check/route.ts` has one call site.

- [ ] **Step 1: `src/lib/tutorial/detect.ts`**

One `case` per step id across both profiles (`client`, `student`, `subjects`, `program`, `session`,
`video_call`, `project` — `session` is shared by both flows, same query). Follow the existing
codebase idiom for org/owner-scoped tables:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TutorialContext } from './types'

type DetectArgs = {
  userId: string
  orgId: string | null
  startedAt: string
  context: TutorialContext
}

export async function checkStep(
  supabase: SupabaseClient,
  stepId: string,
  args: DetectArgs
): Promise<{ done: boolean; context?: TutorialContext }> {
  const { userId, orgId, startedAt, context } = args

  switch (stepId) {
    case 'client': {
      const query = orgId
        ? supabase.from('clients').select('id, name').or(`owner_id.eq.${userId},org_id.eq.${orgId}`)
        : supabase.from('clients').select('id, name').eq('owner_id', userId)
      const { data } = await query.gte('created_at', startedAt).order('created_at', { ascending: false }).limit(1)
      const row = data?.[0]
      return row ? { done: true, context: { clientId: row.id, clientName: row.name } } : { done: false }
    }
    case 'student': {
      if (!context.clientId) return { done: false }
      const { count } = await supabase.from('students').select('id', { count: 'exact', head: true })
        .eq('client_id', context.clientId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'subjects': {
      const { count } = await supabase.from('topic_assets').select('id', { count: 'exact', head: true })
        .eq('created_by', userId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'program': {
      const query = orgId
        ? supabase.from('programs').select('id', { count: 'exact', head: true }).or(`owner_id.eq.${userId},org_id.eq.${orgId}`)
        : supabase.from('programs').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
      const { count } = await query.gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'project': {
      const query = orgId
        ? supabase.from('projects').select('id', { count: 'exact', head: true }).or(`owner_id.eq.${userId},org_id.eq.${orgId}`)
        : supabase.from('projects').select('id', { count: 'exact', head: true }).eq('owner_id', userId)
      const { count } = await query.gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'session': {
      if (!context.clientId) return { done: false }
      const { count } = await supabase.from('sessions').select('id', { count: 'exact', head: true })
        .eq('client_id', context.clientId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    case 'video_call': {
      const { count } = await supabase.from('scheduled_calls').select('id', { count: 'exact', head: true })
        .eq('created_by', userId).gte('created_at', startedAt)
      return { done: (count ?? 0) > 0 }
    }
    default:
      return { done: false }
  }
}
```

(Read the file first if any table/column names have since changed — this mirrors the spec's
Detection section exactly, cross-check against `supabase/schema-*.sql` if in doubt.)

- [ ] **Step 2: `src/app/api/tutorial/start/route.ts`** (POST)

Auth via `createClient()` from `@/lib/supabase-server`, resolve `orgId` via
`organisation_members`, resolve `profileKey` via `getWorkspaceProfileForUser` (import from
`@/lib/workspace-profiles/resolve`). Upsert into `user_onboarding_dismissed`:
`{ user_id, org_id, started_at: new Date().toISOString(), current_step_index: 0, context: {},
dismissed_at: null, profile_key: profileKey }`. Return `{ ok: true }` (mirror
`dismiss/route.ts`'s existing error-handling shape).

- [ ] **Step 3: `src/app/api/tutorial/advance/route.ts`** (POST)

Body: `{ stepIndex: number; context?: Record<string, string> }`. Auth, then read the current row's
`context`, shallow-merge the body's `context` into it, and update
`{ current_step_index: stepIndex, context: mergedContext }` for that `user_id`. Return
`{ ok: true }`.

- [ ] **Step 4: `src/app/api/tutorial/check/route.ts`** (GET, `?stepId=...`)

Auth, load the caller's `user_onboarding_dismissed` row (`org_id`, `started_at`, `context`) — if
`started_at` is null, return `{ done: false }` (nothing to check yet). Otherwise call
`checkStep(supabase, stepId, { userId, orgId, startedAt: row.started_at, context: row.context })`
from `detect.ts` and return its result as JSON.

---

### Task 4: TutorialProvider + WelcomeModal

**Files:**
- Modify: `src/components/tutorial/TutorialProvider.tsx` (full rewrite)
- Modify: `src/components/tutorial/WelcomeModal.tsx`

**Interfaces:**
- `TutorialProvider` props: `{ children, initialState: { dismissed: boolean; startedAt: string |
  null; stepIndex: number; context: TutorialContext }, profileKey: string, terminology:
  Terminology }`.
- Context value: `{ phase: 'welcome' | 'steps' | 'complete' | 'done', currentStep: TutorialStep |
  null, stepIndex: number, totalSteps: number, context: TutorialContext, start: () => void,
  advanceStep: (context?: TutorialContext) => void, skipStep: () => void, skipTutorial: () => void
  }` — consumed by `WelcomeModal`, `TutorialTracker`, `TutorialComplete` (Task 5).

- [ ] **Step 1: Read the current file first** (`src/components/tutorial/TutorialProvider.tsx`,
  `src/lib/tutorial-steps.ts` for the `UserRole` type it currently imports — that import goes away)

- [ ] **Step 2: Rewrite `TutorialProvider.tsx`**

```typescript
'use client'
import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react'
import { getStepsForProfile } from '@/lib/tutorial/steps'
import type { TutorialStep, TutorialContext as StepContext } from '@/lib/tutorial/types'
import type { Terminology } from '@/lib/workspace-profiles/types'

type Phase = 'welcome' | 'steps' | 'complete' | 'done'

type TutorialContextValue = {
  phase: Phase
  currentStep: TutorialStep | null
  stepIndex: number
  totalSteps: number
  context: StepContext
  start: () => void
  advanceStep: (ctx?: StepContext) => void
  skipStep: () => void
  skipTutorial: () => void
}

const TutorialContext = createContext<TutorialContextValue>({
  phase: 'done', currentStep: null, stepIndex: 0, totalSteps: 0, context: {},
  start: () => {}, advanceStep: () => {}, skipStep: () => {}, skipTutorial: () => {},
})

export function useTutorial() { return useContext(TutorialContext) }

type InitialState = {
  dismissed: boolean
  startedAt: string | null
  stepIndex: number
  context: StepContext
}

export default function TutorialProvider({
  children, initialState, profileKey, terminology,
}: {
  children: ReactNode
  initialState: InitialState
  profileKey: string
  terminology: Terminology
}) {
  const steps = getStepsForProfile(profileKey, terminology)
  const initialPhase: Phase = initialState.dismissed
    ? 'done'
    : initialState.startedAt
      ? (initialState.stepIndex >= steps.length ? 'complete' : 'steps')
      : 'welcome'

  const [phase, setPhase] = useState<Phase>(initialPhase)
  const [stepIndex, setStepIndex] = useState(initialState.stepIndex)
  const [context, setContext] = useState<StepContext>(initialState.context)

  const start = useCallback(() => {
    fetch('/api/tutorial/start', { method: 'POST' })
    setStepIndex(0)
    setContext({})
    setPhase('steps')
  }, [])

  const advanceStep = useCallback((ctxUpdate?: StepContext) => {
    setStepIndex(i => {
      const next = i + 1
      const mergedContext = ctxUpdate ? { ...context, ...ctxUpdate } : context
      if (ctxUpdate) setContext(mergedContext)
      fetch('/api/tutorial/advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stepIndex: next, context: ctxUpdate }),
      })
      if (next >= steps.length) setPhase('complete')
      return next
    })
  }, [context, steps.length])

  const skipStep = useCallback(() => { advanceStep() }, [advanceStep])

  const skipTutorial = useCallback(() => {
    fetch('/api/tutorial/dismiss', { method: 'POST' })
    setPhase('done')
  }, [])

  const currentStep = phase === 'steps' ? steps[stepIndex] ?? null : null

  // Poll detection while a step is showing: every 5s, plus immediately on window focus/visibility
  // (covers the common case of the user tabbing back after doing the real-world action elsewhere).
  const checkingRef = useRef(false)
  useEffect(() => {
    if (phase !== 'steps' || !currentStep) return

    async function check() {
      if (checkingRef.current) return
      checkingRef.current = true
      try {
        const res = await fetch(`/api/tutorial/check?stepId=${currentStep!.id}`)
        if (res.ok) {
          const data = await res.json() as { done: boolean; context?: StepContext }
          if (data.done) advanceStep(data.context)
        }
      } finally {
        checkingRef.current = false
      }
    }

    const interval = setInterval(check, 5000)
    function onVisible() { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [phase, currentStep, advanceStep])

  return (
    <TutorialContext.Provider value={{
      phase, currentStep, stepIndex, totalSteps: steps.length, context,
      start, advanceStep, skipStep, skipTutorial,
    }}>
      {children}
    </TutorialContext.Provider>
  )
}
```

- [ ] **Step 3: Update `WelcomeModal.tsx`**

Read it first. Keep the same modal shell/styling. Change: the primary button ("Let's go" or
equivalent) calls `start()` from `useTutorial()` instead of whatever `advance()` call it makes
today; the "Skip for now" button calls `skipTutorial()` instead of `skip()`. Only render when
`phase === 'welcome'` (same gating pattern as before, just reading the renamed phase value). Update
copy to be a touch more specific if easy (e.g. reference the workspace profile), but this is not
required — do not invent new profile-aware copy requiring new props if it's not already threaded
through; keep this step mechanical.

---

### Task 5: TutorialTracker + TutorialComplete (replace TutorialOverlay + TipsScreen)

**Files:**
- Create: `src/components/tutorial/TutorialTracker.tsx`
- Create: `src/components/tutorial/TutorialComplete.tsx`
- Delete: `src/components/tutorial/TutorialOverlay.tsx`
- Delete: `src/lib/tutorial-steps.ts`
- Delete: `src/components/tutorial/TipsScreen.tsx`

**Interfaces:**
- Both new components take no props — read everything from `useTutorial()`.

- [ ] **Step 1: `src/components/tutorial/TutorialTracker.tsx`**

Renders only when `phase === 'steps' && currentStep`. A small floating card,
**bottom-left** (`fixed bottom-5 left-5 z-50` — the existing `FloatingWidgets` FAB cluster owns
`fixed right-5`, per `src/components/FloatingWidgets.tsx:125`, so bottom-left avoids collision).
Collapsible (a chevron toggle is enough — a `useState` boolean, not persisted). Shows "Step
{stepIndex + 1} of {totalSteps}", `currentStep.title`, `currentStep.instructions`, a primary button
using `useRouter().push(currentStep.target(context))` labelled something like "Take me there", a
"Skip this step" text button calling `skipStep()`, and a "Skip tutorial" text button calling
`skipTutorial()` (a plain `window.confirm` before calling it is acceptable — this is the permanent
one). Match the app's existing card styling (`rounded-2xl border border-gray-100 bg-white
shadow-sm dark:border-slate-800 dark:bg-slate-900`, per the convention used throughout
`src/components/dashboard/*`).

- [ ] **Step 2: `src/components/tutorial/TutorialComplete.tsx`**

Renders only when `phase === 'complete'`. A brief modal/card: "Nice — you're all set!" plus one
line, and a single button labelled "Done" calling `skipTutorial()` (this is intentionally the same
dismiss call — there's no separate "completed" vs "skipped" state to track, per the spec's Out of
Scope section).

- [ ] **Step 3: Delete the three superseded files**

`git rm` (or plain delete, conductor stages it) `src/components/tutorial/TutorialOverlay.tsx`,
`src/lib/tutorial-steps.ts`, `src/components/tutorial/TipsScreen.tsx`. Confirm nothing else still
imports them (`dashboard/layout.tsx` is updated in Task 6 to stop doing so).

---

### Task 6: Wire into the dashboard layout + clean up nav

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/components/nav/SidebarNav.tsx`

- [ ] **Step 1: Read both files first**

- [ ] **Step 2: `dashboard/layout.tsx`**

Delete the `isNewMember`/`thirtyDaysAgo` block (the lines computing `isNewMember` and the
`initialDismissed` derivation that depends on it). Replace with: fetch the user's
`user_onboarding_dismissed` row (`select('org_id, dismissed_at, started_at, current_step_index,
context')`, `.eq('user_id', user.id).maybeSingle()`). Build `initialState` for
`TutorialProvider`:

```typescript
const { data: tutorialRow } = await supabase
  .from('user_onboarding_dismissed')
  .select('dismissed_at, started_at, current_step_index, context')
  .eq('user_id', user.id)
  .maybeSingle()

const initialState = {
  dismissed: tutorialRow ? tutorialRow.dismissed_at !== null : false,
  startedAt: tutorialRow?.started_at ?? null,
  stepIndex: tutorialRow?.current_step_index ?? 0,
  context: (tutorialRow?.context as Record<string, string>) ?? {},
}
```

Note: a brand-new user with no row at all gets `dismissed: false, startedAt: null` — exactly the
"eligible for Welcome" case, since the migration backfill (Task 1) guarantees every pre-existing
user already has a row with `dismissed_at` set.

`getWorkspaceProfileForUser` is already called on the existing line resolving `terminology`/
`navOverrides` — capture its `key` too (destructure the full config, not just
`{ terminology, navOverrides }`) and pass it as `profileKey` to `TutorialProvider`.

Update the JSX: replace
```tsx
<TutorialProvider initialDismissed={initialDismissed} role={role}>
```
with
```tsx
<TutorialProvider initialState={initialState} profileKey={workspaceProfile.key} terminology={terminology}>
```
and replace the `<TutorialOverlay />` + `<TipsScreen />` render with `<TutorialTracker />` +
`<TutorialComplete />` (keep `<WelcomeModal />` as-is, just re-ordered/kept where it was). Remove
the now-unused `UserRole` import from `@/lib/tutorial-steps` and the `role` variable if nothing
else in this file still needs it (check — `role` is also used for the `setup_completed` gate a few
lines below; keep it if so, just drop the tutorial-specific usage).

- [ ] **Step 3: `SidebarNav.tsx`**

Remove the `tutorialId` field from the `NavItem` type, remove it from every entry in `NAV_GROUPS`
that has it (`home`, `clients`, `time`, `roster` × 2, `assistant`, `chat`), and remove the
`data-tutorial={item.tutorialId}` attribute plus any `isBlocked`/`isSpotlit` dimming logic that
existed only to support the old spotlight overlay. Read the file fully first — this logic is
intertwined with the render loop, so be precise about what's tutorial-specific versus normal nav
rendering.

---

### Task 7: Settings — replay entry point

**Files:**
- Create: `src/components/tutorial/RestartTutorialButton.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: `RestartTutorialButton.tsx`**

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RestartTutorialButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    await fetch('/api/tutorial/start', { method: 'POST' })
    router.push('/dashboard')
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
    >
      {loading ? 'Restarting…' : 'Restart tutorial'}
    </button>
  )
}
```

- [ ] **Step 2: `settings/page.tsx`**

Read it first. Add a new card to `profileTab` (matching the existing card style —
`rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800
dark:bg-slate-900`), heading "Getting-started walkthrough", one line of body copy ("Replay the
hands-on tutorial that walks you through setting up your first client, session, and more."), and
`<RestartTutorialButton />`. Place it near the other account-level cards (e.g. after "Push
notifications", before `AccountSettingsForm`).

---

### Task 8: Build, verify, commit

- [ ] **Step 1 (Conductor): `pnpm run build`** — must pass clean (tsc + eslint). Fix anything Codex
  missed before proceeding.
- [ ] **Step 2 (Conductor): manual smoke test** — this requires an authenticated browser session
  (login credentials the conductor doesn't have), so this is the user's own verification step,
  same precedent as prior desktop/video smoke tests in this repo. Checklist to hand to the user:
  1. Brand-new tutoring signup → setup wizard → Welcome modal fires → "Let's go" → tracker shows
     Step 1/6 → create a client → tracker auto-advances to Step 2/6 landing on
     `/dashboard/clients/{id}/students?new=1` with the form open.
  2. Skip a step, skip the whole tutorial, confirm both work and persist across reload.
  3. Complete all 6 steps → `TutorialComplete` shows once, then disappears for good.
  4. Settings → "Restart tutorial" on an account with existing data → tracker restarts at Step 1
     without instantly completing every step.
  5. A non-tutoring profile signup gets the 3-step generic flow with correct terminology.
- [ ] **Step 3 (Conductor): commit** — stage everything from Tasks 1-7 and commit
  (`git add supabase/schema-095-tutorial-state.sql src/lib/tutorial src/app/api/tutorial
  src/components/tutorial src/app/dashboard/layout.tsx src/components/nav/SidebarNav.tsx
  src/app/settings/page.tsx && git commit -m "feat: hands-on onboarding tutorial"`).

---

## Acceptance checklist

- [ ] Migration applied (`user_onboarding_dismissed` extended, existing users backfilled).
- [ ] Tutoring gets the 6-step bespoke flow; other profiles get the 3-step generic fallback.
- [ ] Steps auto-detect completion scoped to the current run's `started_at`; manual Continue
  (via "Skip this step", which doubles as manual-advance) always available.
- [ ] Whole tutorial skippable at any point; individual steps skippable.
- [ ] Settings has a working "Restart tutorial" action, no age gate.
- [ ] Solo (non-org) users now see the Welcome trigger (previously never did).
- [ ] Pre-existing users see no unsolicited Welcome popup after this ships.
- [ ] `pnpm run build` passes clean.

## Verification

No test runner in this project — verification is `pnpm run build` plus the manual smoke checklist
in Task 8, Step 2 (requires the user's own authenticated browser session).
