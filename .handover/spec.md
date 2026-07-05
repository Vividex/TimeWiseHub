# Organisation Setup Wizard

## Goal
Build a setup wizard (Welcome → Industry → Complete) that sets `workspace_profile` and
`setup_completed`, gated to org owners/admins and solo Pro users, plus make the industry choice
editable later via Settings. Phase 2 of the Workspace Profile roadmap (Phase 1 = the schema +
registry + resolver engine, already shipped).

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-05-organisation-setup-wizard-design.md`
- Source plan: `docs/superpowers/plans/2026-07-05-organisation-setup-wizard.md`
- Only **industry** is genuinely new to collect — organisation name and logo already have working
  homes (existing `/onboarding` page; `logo_url` already editable in Settings for both org and
  solo Pro). Business hours, employee count, org-level currency/date format/timezone all have zero
  current consumer anywhere in the app — explicitly deferred, no task for them in this phase.
- Built as a genuine multi-step wizard shell (Welcome + Industry steps, extensible), even though
  only one real step exists today — deliberate choice so future fields can slot in without
  restructuring.
- `organisations` UPDATE is RLS-restricted to owner/admin roles — the dashboard gate only ever
  redirects owner/admin org members or solo Pro users to `/setup`; `employee`-role members are
  never redirected regardless of their org's `setup_completed` state (they have no permission to
  change it).
- Industry choice must stay editable later via Settings, not locked into the wizard forever — same
  `IndustryPicker` component reused in both places.
- An org member's personal `profiles.workspace_profile` is never actually read by the resolver
  (org membership wins first) — so the Settings Industry picker in `AccountSettingsForm` is hidden
  entirely for org members (`showWorkspaceProfile = !membership?.org_id`), not just de-emphasized,
  to avoid editing dead data behind a UI that looks like it does something.
- Completion copy must not overpromise: Phase 3 (dynamic terminology actually changing UI text)
  doesn't exist yet.
- No new RLS policies needed — same reasoning as Phase 1.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node) — the conductor handles those.
- Read a file before editing it if its structure is unknown.
- After each task, list the files changed.
- All Tailwind classes must include `dark:` variants where the file already uses them (existing
  convention in `SetupWizard.tsx`'s own template below — mirror it, don't drop it).

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before committing.
- No DB migration this phase — Phase 1's schema already has everything needed.
- Manual smoke tests (Task 3 Step 5, Task 4 Step 6) are conductor + user, not Codex.

---

## C-1 — IndustryPicker component

*Codex edits:*
- [x] Create `src/components/setup/IndustryPicker.tsx`:
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
  `Object.values()` on a `Record` preserves insertion order — `generic` ("Other / Not Listed") is
  the first key in `WORKSPACE_PROFILES`, so it renders first, not sorted to the bottom.
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/setup/IndustryPicker.tsx && git commit -m "feat: setup wizard — IndustryPicker component"`

---

## C-2 — SetupWizard component and /setup page

*Codex edits:*
- [x] Create `src/components/setup/SetupWizard.tsx`:
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
- [x] Create `src/app/setup/page.tsx`:
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
  This mirrors `dashboard/layout.tsx`'s own org-resolution pattern — matching existing convention
  of inline per-route org resolution rather than introducing a new shared helper.
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/components/setup/SetupWizard.tsx src/app/setup/page.tsx && git commit -m "feat: setup wizard — SetupWizard component and /setup page"`

---

## C-3 — Wire up entry points: dashboard gate and onboarding redirect

*Codex edits:*
- [ ] Read `src/app/dashboard/layout.tsx`, then insert this block right after line 64
  (`const role = (membership?.role ?? 'employee') as UserRole`) and before the `return` statement:
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
  `employee`-role members are never redirected regardless of their org's `setup_completed` value.
- [ ] Read `src/app/onboarding/page.tsx`, then change both occurrences of
  `router.push('/dashboard'); router.refresh()` (currently lines 75 and 82, the "Skip for now" and
  "Done" buttons) to `router.push('/setup'); router.refresh()`. No other change to this file.
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: sign in as the existing org's owner (Vividex, `setup_completed = false`
  since the Phase 1 migration), confirm the dashboard redirects to `/setup`. Complete the wizard,
  confirm it lands back on `/dashboard`, confirm a second dashboard visit does NOT redirect again
  (SQL check: `organisations.setup_completed` is now `true`).
- [ ] Commit: `git add src/app/dashboard/layout.tsx src/app/onboarding/page.tsx && git commit -m "feat: setup wizard — gate dashboard access and redirect from onboarding"`

---

## C-4 — Settings integration: industry becomes editable later

*Codex edits:*
- [ ] Read `src/components/OrgBillingSettingsForm.tsx`, then:
  1. Add `import IndustryPicker from '@/components/setup/IndustryPicker'` and
     `import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'` to the imports.
  2. Add `initialWorkspaceProfile: WorkspaceProfileKey` to the destructured props and the inline
     props type (alongside `initialLogoUrl: string | null`, currently lines 26/38).
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
- [ ] Read `src/components/AccountSettingsForm.tsx`, then:
  1. Add `import IndustryPicker from '@/components/setup/IndustryPicker'` and
     `import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'` to the imports.
  2. Add `initialWorkspaceProfile: WorkspaceProfileKey` and `showWorkspaceProfile: boolean` to the
     `Props` type (currently lines 41-52) and the destructured function parameters (currently
     lines 54-65).
  3. Add `const [workspaceProfile, setWorkspaceProfile] = useState<WorkspaceProfileKey>(initialWorkspaceProfile)`
     alongside the other `useState` calls (currently lines 66-74).
  4. Change the `updates` object (currently lines 99-106) to conditionally include the field:
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
  5. Add a new section, gated on `showWorkspaceProfile`, near the existing "Profile" section
     (currently starting line 127):
     ```typescript
        {showWorkspaceProfile && (
          <div className="space-y-2 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">Industry</h2>
            <p className="text-sm font-semibold text-gray-500">Shapes future industry-specific features.</p>
            <IndustryPicker value={workspaceProfile} onChange={setWorkspaceProfile} />
          </div>
        )}
     ```
- [ ] Read `src/app/settings/page.tsx`, then:
  1. Add `workspace_profile` to the `profiles` select (currently line 22).
  2. Add `workspace_profile` to the `organisations` select (currently line 39).
  3. Add `initialWorkspaceProfile={profile?.workspace_profile ?? 'generic'}` and
     `showWorkspaceProfile={!membership?.org_id}` to the `<AccountSettingsForm>` call (currently
     lines 89-106).
  4. Add `initialWorkspaceProfile={organisation?.workspace_profile ?? 'generic'}` to the
     `<OrgBillingSettingsForm>` call (currently lines 131-143).
- [ ] Report back — list files changed.

*Conductor:*
- [ ] `pnpm run build` — must pass clean.
- [ ] Manual smoke test: as org owner, Settings → Organisation tab → change Industry → save →
  refresh → confirm persisted. As a solo Pro user, Settings → Profile tab → confirm the Industry
  section appears there instead. As an org employee (non-owner/admin), confirm the Profile tab's
  Industry section does NOT appear.
- [ ] Commit: `git add src/components/OrgBillingSettingsForm.tsx src/components/AccountSettingsForm.tsx src/app/settings/page.tsx && git commit -m "feat: setup wizard — industry editable later via Settings"`

---

## Acceptance checklist
- [x] C-1: `IndustryPicker` component created, build passes
- [x] C-2: `SetupWizard` + `/setup` page created, build passes
- [ ] C-3: dashboard gate + onboarding redirect wired, manual smoke confirms Vividex owner is
  routed through `/setup` once and not again after completing
- [ ] C-4: industry editable via Settings for org admins and solo Pro, hidden for employees, build
  passes

## Verification
`pnpm run build` (next build = tsc + eslint) must pass clean after every task. No test runner in
this project — manual browser smoke required for C-3 and C-4.
