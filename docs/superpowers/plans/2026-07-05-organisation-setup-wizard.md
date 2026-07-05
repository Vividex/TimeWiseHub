# Organisation Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **TimeWiseHub-specific note:** this project's actual convention is the `handover-loop` skill (Claude conducts, Codex does text edits, conductor runs all shell/DB commands) — see `CLAUDE.md`. Translate these tasks into `.handover/spec.md` C-N items rather than generic subagent dispatch, unless told otherwise.

**Goal:** Build a setup wizard (Welcome → Industry → Complete) that sets `workspace_profile` and
`setup_completed`, gated to org owners/admins and solo Pro users, plus make the industry choice
editable later via Settings.

**Architecture:** A new `/setup` route renders a client-side step wizard. `dashboard/layout.tsx`
gains a redirect gate sending eligible users there when their `setup_completed` is `false`. The
existing `/onboarding` page (org name + logo, unchanged) redirects into `/setup` instead of
`/dashboard` once done. A shared `IndustryPicker` component is reused both inside the wizard and
as a new field in the existing Settings forms.

**Tech Stack:** Next.js 16 / TypeScript strict / Supabase (`@supabase/ssr`, `@supabase/supabase-js`)
— no new dependencies.

## Global Constraints

- No test runner in this project — verification is `pnpm run build` (tsc + eslint) plus manual
  browser smoke testing.
- No new RLS policies — `organisations` and `profiles` UPDATE policies already cover the
  `workspace_profile`/`setup_completed`/`setup_completed_at` columns (Phase 1, confirmed).
- Only `owner`/`admin` org roles and solo Pro users (no org) are ever redirected to `/setup` —
  `employee` role members are never gated, regardless of their org's `setup_completed` state
  (they have no RLS permission to change it).
- Industry choice is never a one-time lock-in — it must be editable later via Settings.
- Completion copy must not overpromise: Phase 3 (dynamic terminology actually changing UI text)
  doesn't exist yet.
- Source spec: `docs/superpowers/specs/2026-07-05-organisation-setup-wizard-design.md`.

---

### Task 1: `IndustryPicker` component

**Files:**
- Create: `src/components/setup/IndustryPicker.tsx`

**Interfaces:**
- Consumes: `WORKSPACE_PROFILES` from `src/lib/workspace-profiles/registry.ts` (Phase 1, already
  shipped), `WorkspaceProfileKey` from `src/lib/workspace-profiles/types.ts` (Phase 1, already
  shipped).
- Produces: `IndustryPicker` — a controlled component, props `{ value: WorkspaceProfileKey | null,
  onChange: (key: WorkspaceProfileKey) => void }`. Purely presentational — never talks to
  Supabase itself. Tasks 2 and 4 both import this exact component and wire `onChange` differently
  (autosave vs staged local state).

- [ ] **Step 1: Write `src/components/setup/IndustryPicker.tsx`**

```typescript
'use client'

import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'
import { WORKSPACE_PROFILES } from '@/lib/workspace-profiles/registry'

export default function IndustryPicker({
  value,
  onChange,
}: {
  value: WorkspaceProfileKey | null
  onChange: (key: WorkspaceProfileKey) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Object.values(WORKSPACE_PROFILES).map(profile => (
        <button
          key={profile.key}
          type="button"
          onClick={() => onChange(profile.key)}
          className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
            value === profile.key
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-500/10 dark:text-cyan-300'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {profile.label}
        </button>
      ))}
    </div>
  )
}
```

`Object.values()` on a `Record` preserves insertion order for string keys — `generic` ("Other /
Not Listed") is the first key in `WORKSPACE_PROFILES`, so it renders first, not sorted
alphabetically to the bottom.

- [ ] **Step 2: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 3: Run build**

```bash
pnpm run build
```

Expected: PASS clean (new, unimported file — nothing else references it yet).

- [ ] **Step 4: Commit**

```bash
git add src/components/setup/IndustryPicker.tsx
git commit -m "feat: setup wizard — IndustryPicker component"
```

---

### Task 2: `SetupWizard` component and `/setup` page

**Files:**
- Create: `src/components/setup/SetupWizard.tsx`
- Create: `src/app/setup/page.tsx`

**Interfaces:**
- Consumes: `IndustryPicker` (Task 1, exact props above), `WorkspaceProfileKey` from
  `src/lib/workspace-profiles/types.ts`.
- Produces: `SetupWizard` — client component, props `{ orgId: string | null, userId: string }`.
  Task 3's gate in `dashboard/layout.tsx` sends users to the `/setup` route this task creates;
  no other task imports `SetupWizard` directly.

- [ ] **Step 1: Write `src/components/setup/SetupWizard.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import IndustryPicker from './IndustryPicker'
import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'

type WizardStepId = 'welcome' | 'industry'

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'industry', label: 'Industry' },
]

export default function SetupWizard({
  orgId,
  userId,
}: {
  orgId: string | null
  userId: string
}) {
  const router = useRouter()
  const [stepIndex, setStepIndex] = useState(0)
  const [complete, setComplete] = useState(false)
  const [selected, setSelected] = useState<WorkspaceProfileKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStep = WIZARD_STEPS[stepIndex]

  async function handleSelectIndustry(key: WorkspaceProfileKey) {
    setSelected(key)
    setError(null)
    const supabase = createClient()
    const table = orgId ? 'organisations' : 'profiles'
    const id = orgId ?? userId
    const { error: updateError } = await supabase
      .from(table)
      .update({ workspace_profile: key })
      .eq('id', id)
    if (updateError) setError(updateError.message)
  }

  async function handleFinish() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const table = orgId ? 'organisations' : 'profiles'
    const id = orgId ?? userId
    const { error: updateError } = await supabase
      .from(table)
      .update({ setup_completed: true, setup_completed_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setComplete(true)
  }

  if (complete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">TimeWiseHub</p>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">You&apos;re all set</h1>
          <p className="mb-8 text-sm font-medium text-gray-500 dark:text-slate-400">
            Saved — as more industry-specific features roll out, this is what shapes them.
          </p>
          <button
            type="button"
            onClick={() => { router.push('/dashboard'); router.refresh() }}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">TimeWiseHub</p>
        <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          Step {stepIndex + 1} of {WIZARD_STEPS.length}
        </p>

        {currentStep.id === 'welcome' && (
          <>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">Let&apos;s set up your workspace</h1>
            <p className="mb-8 text-sm font-medium text-gray-500 dark:text-slate-400">
              A couple of quick questions so TimeWiseHub fits how you actually work.
            </p>
            <button
              type="button"
              onClick={() => setStepIndex(1)}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
            >
              Next
            </button>
          </>
        )}

        {currentStep.id === 'industry' && (
          <>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">What field are you in?</h1>
            <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
              Not sure, or don&apos;t see your field? Choose &quot;Other / Not Listed&quot; — you can change this anytime in Settings.
            </p>

            <div className="mb-6">
              <IndustryPicker value={selected} onChange={handleSelectIndustry} />
            </div>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleFinish}
              disabled={!selected || saving}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Finish'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Write `src/app/setup/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase-server'
import SetupWizard from '@/components/setup/SetupWizard'

export default async function SetupPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  const cookieStore = await cookies()
  let orgId = cookieStore.get('active_org_id')?.value ?? null

  if (orgId) {
    const { count } = await supabase
      .from('organisation_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', user.id)
    if (!count) orgId = null
  }

  if (!orgId) {
    orgId = membership?.org_id ?? null
  }

  const role = membership?.role ?? 'employee'

  if (orgId) {
    if (!['owner', 'admin'].includes(role)) redirect('/dashboard')
    const { data: org } = await supabase
      .from('organisations').select('setup_completed').eq('id', orgId).maybeSingle()
    if (org?.setup_completed) redirect('/dashboard')
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('setup_completed').eq('id', user.id).maybeSingle()
    if (profile?.setup_completed) redirect('/dashboard')
  }

  return <SetupWizard orgId={orgId} userId={user.id} />
}
```

This mirrors `dashboard/layout.tsx`'s own org-resolution pattern — matching the existing
convention of inline per-route org resolution (used the same way across many pages in this
codebase) rather than introducing a new shared helper for it.

- [ ] **Step 3: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/setup/SetupWizard.tsx src/app/setup/page.tsx
git commit -m "feat: setup wizard — SetupWizard component and /setup page"
```

---

### Task 3: Wire up entry points — dashboard gate and onboarding redirect

**Files:**
- Modify: `src/app/dashboard/layout.tsx:64` (insert after `role` is computed, before `return`)
- Modify: `src/app/onboarding/page.tsx:75,82` (redirect target change)

**Interfaces:**
- Consumes: the `/setup` route created in Task 2. No new exported functions/types — this task is
  pure control-flow wiring.

- [ ] **Step 1: Read `src/app/dashboard/layout.tsx`, then insert this block right after line 64
  (`const role = (membership?.role ?? 'employee') as UserRole`) and before the `return` statement:**

```typescript
  if (orgId && ['owner', 'admin'].includes(role)) {
    const { data: org } = await supabase
      .from('organisations').select('setup_completed').eq('id', orgId).maybeSingle()
    if (org && !org.setup_completed) redirect('/setup')
  } else if (!orgId) {
    const { data: profile } = await supabase
      .from('profiles').select('setup_completed').eq('id', user.id).maybeSingle()
    if (profile && !profile.setup_completed) redirect('/setup')
  }
```

`employee`-role members are never redirected regardless of their org's `setup_completed` value —
matches the Global Constraints above (they have no RLS permission to change it, so sending them to
`/setup` would just produce a permission error on save).

- [ ] **Step 2: Read `src/app/onboarding/page.tsx`, then change both occurrences** of
  `router.push('/dashboard'); router.refresh()` (currently lines 75 and 82, the "Skip for now" and
  "Done" buttons) **to** `router.push('/setup'); router.refresh()`. No other change to this file —
  name and logo collection stay exactly as they are.

- [ ] **Step 3: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 4: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 5: Manual smoke test**

Sign in as the existing org's owner (Vividex, `setup_completed = false` since the Phase 1
migration) and confirm the dashboard redirects to `/setup`. Complete the wizard, confirm it lands
back on `/dashboard`, and confirm a second visit to `/dashboard` does **not** redirect again (SQL
check: `organisations.setup_completed` is now `true`).

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/layout.tsx src/app/onboarding/page.tsx
git commit -m "feat: setup wizard — gate dashboard access and redirect from onboarding"
```

---

### Task 4: Settings integration — industry becomes editable later

**Files:**
- Modify: `src/components/OrgBillingSettingsForm.tsx`
- Modify: `src/components/AccountSettingsForm.tsx`
- Modify: `src/app/settings/page.tsx:19-48,89-143`

**Interfaces:**
- Consumes: `IndustryPicker` (Task 1), `WorkspaceProfileKey` from
  `src/lib/workspace-profiles/types.ts`.
- Produces: nothing new for later tasks — this is the final task in the plan.

`OrgBillingSettingsForm` is only ever rendered inside `settings/page.tsx`'s `orgTab`, itself gated
to `isOrgAdmin && membership?.org_id` (confirmed at `settings/page.tsx:110`) — no extra role check
needed inside the form. `AccountSettingsForm` is rendered for **every** user regardless of org
membership, but a solo Pro user's `profiles.workspace_profile` is the only one the resolver
(`getWorkspaceProfileForUser`, Phase 1) ever reads for org members (it checks org membership
first) — so the picker must be hidden for org members, not just cosmetically de-emphasized,
otherwise it edits data nothing consults.

- [ ] **Step 1: Read `src/components/OrgBillingSettingsForm.tsx`, then:**
  1. Add `import IndustryPicker from '@/components/setup/IndustryPicker'` and
     `import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'` to the imports.
  2. Add `initialWorkspaceProfile: WorkspaceProfileKey` to the destructured props and the inline
     props type (alongside the existing `initialLogoUrl: string | null` etc., currently
     lines 26/38).
  3. Add `const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfileKey>(initialWorkspaceProfile)`
     alongside the other `useState` calls (currently lines 44-53).
  4. Add `workspace_profile: workspaceProfile,` to the `organisations` `.update()` call's object
     (currently lines 70-77).
  5. Add a new section right after the header `<div>` (currently lines 110-114, before the
     `canEditInvoiceLetterhead &&` block):
     ```typescript
        <div className="space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Industry</p>
            <p className="text-xs font-medium text-gray-500">Shapes future industry-specific features.</p>
          </div>
          <IndustryPicker value={workspaceProfile} onChange={setWorkspaceProfile} />
        </div>
     ```

- [ ] **Step 2: Read `src/components/AccountSettingsForm.tsx`, then:**
  1. Add `import IndustryPicker from '@/components/setup/IndustryPicker'` and
     `import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'` to the imports.
  2. Add `initialWorkspaceProfile: WorkspaceProfileKey` and `showWorkspaceProfile: boolean` to the
     `Props` type (currently lines 41-52) and the destructured function parameters (currently
     lines 54-65).
  3. Add `const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfileKey>(initialWorkspaceProfile)`
     alongside the other `useState` calls (currently lines 66-74).
  4. Change the `updates` object (currently lines 99-106) to conditionally include the field —
     only ever written when the picker is actually shown, so an org member's personal
     `workspace_profile` is never silently mutated by a form field they can't see:
     ```typescript
     const updates = {
       full_name: fullName,
       timezone,
       au_state: auState || null,
       notification_preferences: payloadNotifications,
       invoice_payment_details: paymentDetails,
       ...(canEditInvoiceLetterhead ? { invoice_letterhead: invoiceLetterhead.trim() || null } : {}),
       ...(showWorkspaceProfile ? { workspace_profile: workspaceProfile } : {}),
     }
     ```
  5. Add a new section, gated on `showWorkspaceProfile`, inside the form (near the existing
     "Profile" section, currently starting line 127):
     ```typescript
        {showWorkspaceProfile && (
          <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Industry</h2>
            <p className="text-sm font-semibold text-gray-500">Shapes future industry-specific features.</p>
            <IndustryPicker value={workspaceProfile} onChange={setWorkspaceProfile} />
          </div>
        )}
     ```

- [ ] **Step 3: Read `src/app/settings/page.tsx`, then:**
  1. Add `workspace_profile` to the `profiles` select (currently line 22).
  2. Add `workspace_profile` to the `organisations` select (currently line 39).
  3. Add `initialWorkspaceProfile={profile?.workspace_profile ?? 'generic'}` and
     `showWorkspaceProfile={!membership?.org_id}` to the `<AccountSettingsForm>` call (currently
     lines 89-106).
  4. Add `initialWorkspaceProfile={organisation?.workspace_profile ?? 'generic'}` to the
     `<OrgBillingSettingsForm>` call (currently lines 131-143).

- [ ] **Step 4: Report back** (Codex turn) — list files changed.

*Conductor:*

- [ ] **Step 5: Run build**

```bash
pnpm run build
```

Expected: PASS clean.

- [ ] **Step 6: Manual smoke test**

As the org owner: open Settings → Organisation tab, change Industry, save, refresh, confirm it
persisted (and that `/dashboard` does not re-redirect to `/setup`, since `setup_completed` is
already `true` from Task 3's test). As a solo Pro user (or by temporarily checking with a
solo-Pro test account): open Settings → Profile tab, confirm the Industry section appears there
instead. As an org employee (non-owner/admin): confirm the Profile tab's Industry section does
**not** appear.

- [ ] **Step 7: Commit**

```bash
git add src/components/OrgBillingSettingsForm.tsx src/components/AccountSettingsForm.tsx src/app/settings/page.tsx
git commit -m "feat: setup wizard — industry editable later via Settings"
```

---

## Self-Review Notes

- **Spec coverage:** gate logic (Task 3) matches the spec's owner/admin-only + solo-Pro rule
  exactly; wizard shell (Task 2) matches the Welcome→Industry→Complete structure and the honest,
  non-overpromising completion copy; `/onboarding` redirect change (Task 3) matches; Settings
  integration (Task 4) matches, including the "editable later, not locked in" requirement and the
  org-member-must-not-see-a-no-op-picker nuance derived from how the resolver actually works.
  Explicitly-deferred items (business hours, employee count, org currency/date format/timezone)
  have no task, correctly.
- **Placeholder scan:** none — every step has real, complete code or an exact line-level edit
  instruction.
- **Type consistency:** `WorkspaceProfileKey` (Phase 1) is used identically across
  `IndustryPicker`, `SetupWizard`, `OrgBillingSettingsForm`, and `AccountSettingsForm`. The
  `IndustryPicker` props (`value`/`onChange`) defined in Task 1 are used identically by both
  consumers in Tasks 2 and 4.
