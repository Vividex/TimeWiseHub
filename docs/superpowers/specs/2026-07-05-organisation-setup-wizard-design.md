# Organisation Setup Wizard — Design (Phase 2 of the Workspace Profile roadmap)

## Background

Phase 1 (`docs/superpowers/specs/2026-07-05-workspace-profile-engine-design.md`) shipped additive
schema columns (`workspace_profile`, `setup_completed`, `setup_completed_at` on both
`organisations` and `profiles`) and a code-based terminology registry, with nothing in the UI
consuming it yet. This phase builds the first real consumer: a wizard that sets `workspace_profile`
and marks `setup_completed`.

**Scope decided during brainstorming (2026-07-05):**
- Only **industry** is genuinely new to collect. An audit confirmed business hours, employee
  count, org-level currency, org-level date format, and org-level timezone all have **zero current
  consumer** anywhere in the codebase — building UI to collect unused data is deferred, not part
  of this phase. Organisation name and logo already have working homes (the existing `/onboarding`
  page, and `logo_url` is already editable in Settings for both org and solo Pro) — untouched here.
- Built as a genuine multi-step wizard shell (not a single screen), even though there's only one
  real step today — deliberate choice so business-hours/employee-count/etc. can slot in later as
  additional steps without restructuring, if a real need for them ever appears.
- Additions beyond the bare industry picker, agreed during brainstorming: a brief welcome step, an
  explicit "Not sure / Other" option (not buried), the choice stays editable later via Settings
  (not locked into the wizard forever), and honest completion copy that doesn't overpromise
  behaviour Phase 3 (dynamic terminology) hasn't built yet.

## Scope for this phase

- New `/setup` route + wizard shell (Welcome step → Industry step → Completion state).
- A gate in `dashboard/layout.tsx` that redirects org owners/admins and solo Pro users to `/setup`
  when their `setup_completed` is `false`.
- Two small edits to the existing `/onboarding` page's redirect target.
- The industry choice becomes a field in the existing Settings forms (org settings for
  owners/admins, account settings for solo Pro), reusing the same picker component.
- **Explicitly out of scope**: business hours, employee count, org-level currency/date
  format/timezone (no consumer exists — confirmed via audit); Phase 3's dynamic terminology
  actually changing any UI string; any employee-facing notice when their org's setup isn't done
  (they simply aren't gated — see below).

## Architecture

### The gate — who sees `/setup`, and who doesn't

Confirmed via audit: `organisations` UPDATE is RLS-restricted to `owner`/`admin` roles. An
`employee` logging into an org with `setup_completed = false` has no permission to set the
org's industry — redirecting them to `/setup` would just produce an RLS error on save. So the
gate only ever applies to the person who *can* actually complete it:

- Org member with role `owner` or `admin`, and `organisations.setup_completed = false` →
  redirect to `/setup`.
- No org membership at all (solo Pro), and `profiles.setup_completed = false` → redirect to
  `/setup`.
- Everyone else (employees regardless of their org's setup state; anyone already
  `setup_completed = true`) → dashboard renders exactly as it does today, no change.

**Modify `src/app/dashboard/layout.tsx`** — insert right after `role` is computed (currently line
64, before the `return`):

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

### `/onboarding`'s redirect target

**Modify `src/app/onboarding/page.tsx`** — both "Skip for now" (line 75) and "Done" (line 82)
currently do `router.push('/dashboard'); router.refresh()`. Change both to
`router.push('/setup'); router.refresh()` — a brand-new org owner goes straight from the existing
logo step into the industry step, rather than bouncing through the dashboard gate first. No other
change to this page; name + logo collection is untouched.

### `/setup` page and wizard shell

**New file: `src/app/setup/page.tsx`** (server component). Mirrors `dashboard/layout.tsx`'s own
org/role resolution (same membership query pattern), then:
- If the user shouldn't be here — an employee, or `setup_completed` already `true` — redirect to
  `/dashboard`. This defends against someone navigating back to `/setup` after finishing, or an
  employee hitting the URL directly.
- Otherwise render `<SetupWizard orgId={orgId} userId={user.id} />`.

**New file: `src/components/setup/SetupWizard.tsx`** (client component):

```typescript
type WizardStepId = 'welcome' | 'industry'

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'industry', label: 'Industry' },
]
```

Internal state is a step index (`0 | 1`) plus a `'complete'` terminal state — not itself one of
`WIZARD_STEPS`, since nothing about it needs a progress-bar slot. A progress indicator shows
"Step X of 2" while `stepIndex` is `0` or `1`.

- **Welcome step**: static framing copy ("Let's set up your workspace") + a Next button. No data
  to save.
- **Industry step**: renders `IndustryPicker` (below). Selecting a card writes
  `workspace_profile` immediately (this *is* the autosave — there's no separate "save" click)
  via `supabase.from(orgId ? 'organisations' : 'profiles').update({ workspace_profile: key }).eq('id', orgId ?? userId)`.
  Next is disabled until a card is selected. Clicking Next (the wizard's last step) additionally
  sets `setup_completed: true, setup_completed_at: new Date().toISOString()` in the same table,
  then transitions to `'complete'`.
- **Complete state**: confirms the choice was saved, deliberately not overpromising — e.g. "Saved
  — as more industry-specific features roll out, this is what shapes them," not "you'll now see
  Student instead of Client," since Phase 3 doesn't exist yet. A "Go to dashboard" button does
  `router.push('/dashboard'); router.refresh()`.

**New file: `src/components/setup/IndustryPicker.tsx`** (client component, reusable — also used
by the Settings integration below):

```typescript
type IndustryPickerProps = {
  value: WorkspaceProfileKey | null
  onChange: (key: WorkspaceProfileKey) => void
}
```

Renders every entry from `WORKSPACE_PROFILES` (Phase 1's registry, `src/lib/workspace-profiles/registry.ts`)
as a selectable card, **preserving the registry's own insertion order** — `generic` ("Other / Not
Listed") is already the first key in `WORKSPACE_PROFILES`, so it naturally appears first and
prominent rather than sorted alphabetically to the bottom. This is the "explicit, not buried"
requirement from brainstorming — satisfied by not re-sorting, not by special-casing the card.

`IndustryPicker` itself is purely a controlled component (`value` + `onChange`) — it never talks to
Supabase. Whether selecting a card autosaves immediately or waits for a form's own Save button is
entirely up to the caller: the wizard's Industry step wires `onChange` straight to a Supabase
`.update()` call (autosave, per this phase's design); the Settings integration below wires it to
local `useState`, deferring to that form's existing `handleSave`, same as every other field in
those forms.

### Editable later — Settings integration

The industry choice must not be a one-time, locked-in wizard artifact. Both existing Settings
forms already follow the same shape (props `initialX`, local state, one `.update()` call in
`handleSave`) — adding a field is additive to each, not a restructure:

- **`src/components/OrgBillingSettingsForm.tsx`**: add `initialWorkspaceProfile: WorkspaceProfileKey`
  prop, `workspaceProfile` state (defaulting to the initial value), include
  `workspace_profile: workspaceProfile` in the existing `organisations` `.update()` call
  (currently lines 68-78), render `<IndustryPicker value={workspaceProfile} onChange={setWorkspaceProfile} />`
  in the form body.
- **`src/components/AccountSettingsForm.tsx`**: identical pattern against `profiles`.
- **`src/app/settings/page.tsx`**: add `workspace_profile` to the existing `organisations` select
  (line 39) and `profiles` select (line 22), pass through as the new `initialWorkspaceProfile` prop
  to each form.

No new RLS policies needed here either — same reasoning as Phase 1: both tables' existing UPDATE
policies already cover this column.

## Out of scope (explicitly deferred)

- Business hours, employee count, org-level currency, date format, org-level timezone — still zero
  current consumers, unchanged from the Phase 2 scoping decision.
- Phase 3 (dynamic terminology actually changing UI strings anywhere) — the completion copy is
  written to stay true given this doesn't exist yet.
- Any interstitial message to employees whose org has `setup_completed = false` — they are simply
  never gated; no "your admin hasn't finished setup" notice is built.
- A formal "resume mid-wizard" mechanism beyond what falls out of the gate structurally — if
  someone abandons the wizard mid-way, the gate re-redirects them to `/setup` on their next
  dashboard visit anyway, since `setup_completed` is still `false`.

## Verification

No test runner in this project — verification is `pnpm run build` plus manual smoke testing:
1. A brand-new org signup: `/onboarding` (name + logo, unchanged) → `/setup` (welcome → industry →
   complete) → `/dashboard`, tutorial fires as normal afterward.
2. A brand-new solo Pro signup: first dashboard visit redirects straight to `/setup` (no
   `/onboarding` involved, matching today's behaviour where solo users never see that page).
3. The existing org (Vividex, `setup_completed = false` since the Phase 1 migration) — logging in
   as its owner redirects to `/setup`; logging in as a non-owner/admin member (if one exists) does
   **not** redirect, dashboard loads normally.
4. Settings: changing the industry there persists and is reflected next time `/setup` would have
   redirected (it won't, since `setup_completed` is already `true`).
