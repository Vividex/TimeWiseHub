# Account Deactivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This project uses the handover loop instead** (Claude = conductor, Codex = implementer via `.handover/`). After this plan is written and self-reviewed, it is translated into `.handover/spec.md` as a C-N checklist and executed via the `handover-loop` skill — do not invoke subagent-driven-development or executing-plans here.

**Goal:** Let an org owner (or a solo Pro user with no org) permanently close their TimeWiseHub account — blocking login for the whole org, capturing an exit reason, emailing the operator — without deleting any data, and let the owner reactivate it later.

**Architecture:** Two new nullable `deactivated_at` flag columns (on `organisations` and `profiles`) gate page access via a redirect check added to the two entry points (`dashboard/layout.tsx`, `settings/page.tsx`). A new `account_deactivations` table records the reason/feedback/who/when, kept forever across cycles. All writes to the flag columns go through two API routes (`/api/account/deactivate`, `/api/account/reactivate`) that use the service-role client after an explicit server-side owner-only check — **not** a direct client-side `.update()`, because the existing `organisations` UPDATE RLS policy allows admins as well as owners, which would silently let an admin deactivate/reactivate if the write went through the normal client.

**Tech Stack:** Next.js 16 App Router (route handlers), React 19 client components, Supabase (`@supabase/ssr` for the user-scoped client, service-role client for privileged writes), existing `sendEmail()`/Resend helper.

## Global Constraints
- No new npm dependencies.
- No test runner in this project — verification is `pnpm run build` (tsc + eslint) plus manual smoke testing across roles.
- Migrations are committed as `supabase/schema-NNN-*.sql` and applied via Supabase MCP `apply_migration` by the conductor — Codex cannot do this.
- Every new table needs RLS (project convention), even where the app's actual writes bypass it via the service-role client — defense in depth, and consistent with how every other table in this schema is treated.
- Deviation from the approved spec (`docs/superpowers/specs/2026-07-14-account-deactivation-design.md`), flagged during planning: the spec's flow step "sign the user out" is dropped. Signing out immediately, before redirecting to `/account-deactivated`, would make it impossible for that page to tell whether the just-deactivated visitor is the account owner (the page needs an authenticated session to check role). The `deactivated_at` page-gate alone already fully blocks re-entry to the product on every subsequent page load regardless of session state, so an explicit sign-out adds no security — it only breaks the reactivate-button UX. A manual "Sign out" link is added to `/account-deactivated` instead, so nothing is lost.

---

### Task 1: Database schema (conductor-only — not dispatched to Codex)

**Files:**
- Create: `supabase/schema-102-account-deactivation.sql`

**Interfaces:**
- Produces: `organisations.deactivated_at timestamptz` (nullable), `profiles.deactivated_at timestamptz` (nullable), table `account_deactivations` with columns `id, org_id, user_id, deactivated_by, reason, feedback, deactivated_at, reactivated_at` and check constraint `account_deactivations_one_owner` (exactly one of `org_id`/`user_id` set). Later tasks read/write these directly by name.

- [ ] **Step 1: Write the migration file**

```sql
-- Account deactivation: soft-close for an org (owner-only) or a solo user with
-- no org. No data is ever deleted. deactivated_at gates page access via
-- redirects in src/app/dashboard/layout.tsx and src/app/settings/page.tsx —
-- a page-level gate, not an RLS-level one (same limitation the existing
-- setup_completed gate already has; see design doc for why this is fine).
--
-- All writes to deactivated_at go through /api/account/deactivate and
-- /api/account/reactivate using the service-role client after an explicit
-- owner-only check — NOT a direct client .update(), because the existing
-- "Owners and admins can update organisation settings" RLS policy on
-- organisations would otherwise let an admin (not just the owner) flip this
-- flag. The RLS policies below on account_deactivations are defense in
-- depth for a future client-side write path; the app doesn't currently
-- rely on them.

alter table organisations add column if not exists deactivated_at timestamptz;
alter table profiles add column if not exists deactivated_at timestamptz;

create table if not exists account_deactivations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  deactivated_by uuid not null references auth.users(id),
  reason text not null check (reason in ('too_expensive', 'missing_features', 'switched_tools', 'no_longer_needed', 'other')),
  feedback text,
  deactivated_at timestamptz not null default now(),
  reactivated_at timestamptz,
  constraint account_deactivations_one_owner check (
    (org_id is not null and user_id is null) or (org_id is null and user_id is not null)
  )
);

create index if not exists account_deactivations_org_id_idx on account_deactivations(org_id);
create index if not exists account_deactivations_user_id_idx on account_deactivations(user_id);

alter table account_deactivations enable row level security;

create policy "Members can view their account's deactivation history"
  on account_deactivations for select
  using (
    (org_id is not null and is_org_member(org_id))
    or (user_id = auth.uid())
  );

create policy "Owners can record a deactivation"
  on account_deactivations for insert
  with check (
    deactivated_by = auth.uid()
    and (
      (org_id is not null and has_org_role(org_id, ARRAY['owner'::member_role]))
      or (org_id is null and user_id = auth.uid())
    )
  );

create policy "Owners can record a reactivation"
  on account_deactivations for update
  using (
    (org_id is not null and has_org_role(org_id, ARRAY['owner'::member_role]))
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    (org_id is not null and has_org_role(org_id, ARRAY['owner'::member_role]))
    or (org_id is null and user_id = auth.uid())
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Run (conductor, via `mcp__supabase__apply_migration`, project id `sdwwlnnsijcadkdwsvud`): apply the SQL above with migration name `account_deactivation`.

- [ ] **Step 3: Verify**

Run: `mcp__supabase__list_migrations` — confirm the new migration appears.
Run (via `mcp__supabase__execute_sql`): `select column_name from information_schema.columns where table_name = 'organisations' and column_name = 'deactivated_at';` — expect one row. Repeat for `profiles`. Then `select policyname from pg_policies where tablename = 'account_deactivations';` — expect 3 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-102-account-deactivation.sql
git commit -m "schema: add account_deactivations table and deactivated_at flags"
```

---

### Task 2: Types and shared lib

**Files:**
- Create: `src/types/account-deactivation.ts`
- Create: `src/lib/account-deactivation.ts`

**Interfaces:**
- Consumes: nothing (pure types/helpers).
- Produces: `DeactivationReason` (union type), `AccountDeactivation` (row type), `REASON_LABEL: Record<DeactivationReason, string>`, `formatTenure(createdAt: string): string`. Task 3 (API routes) and Task 4 (Settings UI) both import from here.

- [ ] **Step 1: Write the types file**

```ts
// src/types/account-deactivation.ts
export type DeactivationReason =
  | 'too_expensive'
  | 'missing_features'
  | 'switched_tools'
  | 'no_longer_needed'
  | 'other'

export type AccountDeactivation = {
  id: string
  org_id: string | null
  user_id: string | null
  deactivated_by: string
  reason: DeactivationReason
  feedback: string | null
  deactivated_at: string
  reactivated_at: string | null
}
```

- [ ] **Step 2: Write the lib file**

```ts
// src/lib/account-deactivation.ts
import type { DeactivationReason } from '@/types/account-deactivation'

export const REASON_LABEL: Record<DeactivationReason, string> = {
  too_expensive: 'Too expensive',
  missing_features: 'Missing features I need',
  switched_tools: 'Switched to another tool',
  no_longer_needed: 'No longer need it',
  other: 'Other',
}

export function formatTenure(createdAt: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000))
  if (days < 1) return 'less than a day'
  if (days < 30) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
  const years = Math.floor(months / 12)
  const remMonths = months % 12
  return remMonths ? `${years}y ${remMonths}m` : `${years} year${years === 1 ? '' : 's'}`
}
```

- [ ] **Step 3: Verify**

Run: `pnpm run build` — expect a clean pass (these files aren't imported by anything yet, so this just confirms no syntax/type errors in isolation).

- [ ] **Step 4: Commit**

```bash
git add src/types/account-deactivation.ts src/lib/account-deactivation.ts
git commit -m "feat: add account deactivation types and reason labels"
```

---

### Task 3: API routes (deactivate, reactivate)

**Files:**
- Create: `src/app/api/account/deactivate/route.ts`
- Create: `src/app/api/account/reactivate/route.ts`

**Interfaces:**
- Consumes: `DeactivationReason`, `REASON_LABEL`, `formatTenure` from Task 2; `createClient` from `@/lib/supabase-server`; `createServiceClient` from `@/lib/supabase-service`; `getSubscription`, `isPaidPlan` from `@/lib/subscription`; `sendEmail` from `@/lib/email-notifications`.
- Produces: `POST /api/account/deactivate` — body `{ reason: string; feedback?: string }`, returns `{ success: true }` or `{ error: string }` with a 4xx status. `POST /api/account/reactivate` — no body, same response shape. Task 4 (Danger Zone form) calls the first; Task 6 (`ReactivateAccountButton`) calls the second.

- [ ] **Step 1: Write the deactivate route**

```ts
// src/app/api/account/deactivate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getSubscription, isPaidPlan } from '@/lib/subscription'
import { sendEmail } from '@/lib/email-notifications'
import { REASON_LABEL, formatTenure } from '@/lib/account-deactivation'
import type { DeactivationReason } from '@/types/account-deactivation'

const REASONS: DeactivationReason[] = ['too_expensive', 'missing_features', 'switched_tools', 'no_longer_needed', 'other']

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { reason, feedback } = await req.json() as { reason?: string; feedback?: string }
  if (!reason || !REASONS.includes(reason as DeactivationReason)) {
    return NextResponse.json({ error: 'Invalid reason' }, { status: 400 })
  }

  const subscription = await getSubscription(user.id)
  if (isPaidPlan(subscription)) {
    return NextResponse.json({ error: 'Cancel your subscription in Billing before deactivating.' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()

  const service = createServiceClient()
  const now = new Date().toISOString()

  if (membership?.org_id) {
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the org owner can deactivate the account.' }, { status: 403 })
    }

    const { data: org } = await service
      .from('organisations').select('name, created_at, deactivated_at').eq('id', membership.org_id).maybeSingle()
    if (!org) return NextResponse.json({ error: 'Organisation not found.' }, { status: 404 })
    if (org.deactivated_at) return NextResponse.json({ error: 'Already deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('organisations').update({ deactivated_at: now }).eq('id', membership.org_id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { error: insertError } = await service.from('account_deactivations').insert({
      org_id: membership.org_id,
      user_id: null,
      deactivated_by: user.id,
      reason,
      feedback: feedback?.trim() || null,
      deactivated_at: now,
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    await sendDeactivationEmail({
      accountName: org.name,
      reason: reason as DeactivationReason,
      feedback,
      tenure: formatTenure(org.created_at),
    })
  } else {
    const { data: profile } = await service
      .from('profiles').select('full_name, email, created_at, deactivated_at').eq('id', user.id).maybeSingle()
    if (!profile) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
    if (profile.deactivated_at) return NextResponse.json({ error: 'Already deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('profiles').update({ deactivated_at: now }).eq('id', user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { error: insertError } = await service.from('account_deactivations').insert({
      org_id: null,
      user_id: user.id,
      deactivated_by: user.id,
      reason,
      feedback: feedback?.trim() || null,
      deactivated_at: now,
    })
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    await sendDeactivationEmail({
      accountName: profile.full_name || profile.email || user.email || 'Unknown user',
      reason: reason as DeactivationReason,
      feedback,
      tenure: formatTenure(profile.created_at),
    })
  }

  return NextResponse.json({ success: true })
}

async function sendDeactivationEmail({ accountName, reason, feedback, tenure }: {
  accountName: string
  reason: DeactivationReason
  feedback?: string
  tenure: string
}) {
  const to = process.env.OPERATOR_NOTIFICATION_EMAIL
  if (!to) {
    console.warn('OPERATOR_NOTIFICATION_EMAIL is not set — skipping deactivation notification email.')
    return
  }

  const lines = [
    `Account: ${accountName}`,
    `Reason: ${REASON_LABEL[reason]}`,
    `Customer for: ${tenure}`,
    feedback?.trim() ? `Feedback: ${feedback.trim()}` : null,
  ].filter((line): line is string => !!line)

  try {
    await sendEmail({
      to,
      subject: `Account deactivated — ${accountName}`,
      text: lines.join('\n'),
      html: `<p>${lines.join('<br>')}</p>`,
    })
  } catch (err) {
    console.error('Failed to send deactivation notification email:', err)
  }
}
```

- [ ] **Step 2: Write the reactivate route**

```ts
// src/app/api/account/reactivate/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()

  const service = createServiceClient()
  const now = new Date().toISOString()

  if (membership?.org_id) {
    if (membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the org owner can reactivate the account.' }, { status: 403 })
    }

    const { data: org } = await service
      .from('organisations').select('deactivated_at').eq('id', membership.org_id).maybeSingle()
    if (!org?.deactivated_at) return NextResponse.json({ error: 'Account is not deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('organisations').update({ deactivated_at: null }).eq('id', membership.org_id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { data: lastDeactivation } = await service
      .from('account_deactivations')
      .select('id')
      .eq('org_id', membership.org_id)
      .is('reactivated_at', null)
      .order('deactivated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDeactivation) {
      await service.from('account_deactivations').update({ reactivated_at: now }).eq('id', lastDeactivation.id)
    }
  } else {
    const { data: profile } = await service
      .from('profiles').select('deactivated_at').eq('id', user.id).maybeSingle()
    if (!profile?.deactivated_at) return NextResponse.json({ error: 'Account is not deactivated.' }, { status: 400 })

    const { error: updateError } = await service
      .from('profiles').update({ deactivated_at: null }).eq('id', user.id)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    const { data: lastDeactivation } = await service
      .from('account_deactivations')
      .select('id')
      .eq('user_id', user.id)
      .is('reactivated_at', null)
      .order('deactivated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastDeactivation) {
      await service.from('account_deactivations').update({ reactivated_at: now }).eq('id', lastDeactivation.id)
    }
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify**

Run: `pnpm run build` — must pass clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/account
git commit -m "feat: add deactivate/reactivate account API routes"
```

---

### Task 4: Settings — Danger Zone UI + gate

**Files:**
- Create: `src/components/settings/DangerZoneDeactivate.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `DeactivationReason`, `REASON_LABEL` from Task 2; posts to `/api/account/deactivate` from Task 3.
- Produces: `<DangerZoneDeactivate accountLabel={string} blockedByPlan={boolean} />`.

- [ ] **Step 1: Write the Danger Zone component**

```tsx
// src/components/settings/DangerZoneDeactivate.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { DeactivationReason } from '@/types/account-deactivation'
import { REASON_LABEL } from '@/lib/account-deactivation'

const REASONS: DeactivationReason[] = ['too_expensive', 'missing_features', 'switched_tools', 'no_longer_needed', 'other']

export default function DangerZoneDeactivate({
  accountLabel,
  blockedByPlan,
}: {
  accountLabel: string
  blockedByPlan: boolean
}) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'reason' | 'confirm'>('idle')
  const [reason, setReason] = useState<DeactivationReason | ''>('')
  const [feedback, setFeedback] = useState('')
  const [typedConfirm, setTypedConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submitDeactivation() {
    if (typedConfirm !== accountLabel) return
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/account/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, feedback: feedback.trim() || undefined }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to deactivate account.')
      setSubmitting(false)
      return
    }

    router.push('/account-deactivated')
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-500/20 dark:bg-red-500/10">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
        <h2 className="text-lg font-bold text-red-700 dark:text-red-300">Deactivate account</h2>
      </div>
      <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-300">
        Closes {accountLabel} for everyone. No data is deleted — you can reactivate any time.
      </p>

      {blockedByPlan ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-slate-900 dark:text-red-300">
          You&apos;re on a paid plan. Cancel your subscription first, then come back here.
          <Link href="/dashboard/billing" className="mt-2 block text-cyan-600 hover:underline dark:text-cyan-400">
            Go to Billing →
          </Link>
        </div>
      ) : step === 'idle' ? (
        <button
          onClick={() => setStep('reason')}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          Deactivate account
        </button>
      ) : step === 'reason' ? (
        <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-white p-4 dark:border-red-500/20 dark:bg-slate-900">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Why are you leaving? *</label>
            <select
              value={reason}
              onChange={event => setReason(event.target.value as DeactivationReason)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Select a reason</option>
              {REASONS.map(r => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Anything else? (optional)</label>
            <textarea
              value={feedback}
              onChange={event => setFeedback(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('idle')}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={() => setStep('confirm')}
              disabled={!reason}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-300">Confirm deactivation</h3>
            <p className="mt-2 text-sm font-medium text-gray-600 dark:text-slate-300">
              Type <span className="font-bold text-gray-900 dark:text-slate-100">{accountLabel}</span> to confirm.
              Everyone in {accountLabel} will be locked out until it&apos;s reactivated.
            </p>
            <input
              value={typedConfirm}
              onChange={event => setTypedConfirm(event.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              autoFocus
            />
            {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setStep('reason'); setTypedConfirm(''); setError(null) }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300"
              >
                Back
              </button>
              <button
                onClick={submitDeactivation}
                disabled={typedConfirm !== accountLabel || submitting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Deactivating…' : 'Deactivate account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Wire into Settings — add the deactivated_at gate and the Danger Zone tab**

In `src/app/settings/page.tsx`, add imports:

```ts
import DangerZoneDeactivate from '@/components/settings/DangerZoneDeactivate'
import { effectivePlan, getSubscription, isPaidPlan, isTeamPlan } from '@/lib/subscription'
```
(replacing the existing `import { effectivePlan, getSubscription, isTeamPlan } from '@/lib/subscription'` line — just adding `isPaidPlan` to that same import.)

Immediately after the existing membership fetch:

```ts
  const [{ data: profile }, { data: membership }, subscription] = await Promise.all([
    ...
  ])
```

insert the deactivation gate (must run for every role, before anything else renders):

```ts
  if (membership?.org_id) {
    const { data: orgDeactivation } = await supabase
      .from('organisations').select('deactivated_at').eq('id', membership.org_id).maybeSingle()
    if (orgDeactivation?.deactivated_at) redirect('/account-deactivated')
  } else {
    const { data: profileDeactivation } = await supabase
      .from('profiles').select('deactivated_at').eq('id', user.id).maybeSingle()
    if (profileDeactivation?.deactivated_at) redirect('/account-deactivated')
  }
```

Then, after the existing `const isOrgAdmin = ...` / `const plan = ...` lines (organisation is already fetched here when `isOrgAdmin && membership?.org_id`, which covers the owner case since owner is included in `isOrgAdmin`), add:

```ts
  const isOwner = membership?.role === 'owner'
  const isSolo = !membership?.org_id
  const showDangerZone = isOwner || isSolo
  const accountLabel = membership?.org_id
    ? (organisation?.name ?? 'your organisation')
    : (profile?.full_name || user.email || 'your account')
```

Then, alongside the existing `dataTab` definition, add:

```ts
  const dangerTab = showDangerZone ? (
    <DangerZoneDeactivate accountLabel={accountLabel} blockedByPlan={isPaidPlan(subscription)} />
  ) : null
```

And in the `tabs` array, add the new entry after `data`:

```ts
  const tabs = [
    { key: 'profile', label: 'Profile', content: profileTab },
    ...(orgTab ? [{ key: 'organisation', label: 'Organisation', content: orgTab }] : []),
    { key: 'data', label: 'Data', content: dataTab },
    ...(dangerTab ? [{ key: 'danger', label: 'Danger Zone', content: dangerTab }] : []),
  ]
```

Note: `organisation` is only fetched (via the existing conditional `Promise.all`) when `isOrgAdmin && membership?.org_id` — since `isOrgAdmin` includes both `owner` and `admin`, and an owner always satisfies `isOrgAdmin`, `organisation.name` is available whenever `isOwner` is true. No extra fetch is needed.

- [ ] **Step 3: Verify**

Run: `pnpm run build` — must pass clean.

Manual: as an org owner on the free plan, open Settings → confirm a "Danger Zone" tab appears with the deactivate flow (reason → type-to-confirm modal, cancel/back both work, typing the wrong text keeps the button disabled). As an org admin (not owner), confirm the tab does NOT appear. As a solo user with no org, confirm it appears using their full name as the confirm text.

- [ ] **Step 4: Commit**

```bash
git add src/components/settings/DangerZoneDeactivate.tsx src/app/settings/page.tsx
git commit -m "feat: add Danger Zone deactivation UI and settings access gate"
```

---

### Task 5: Dashboard layout gate

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

**Interfaces:**
- Consumes: nothing new — reuses the `orgId`/`role`/`supabase` already in scope.
- Produces: a redirect to `/account-deactivated` for every role when the resolved org (or profile, for no-org users) is deactivated, checked unconditionally rather than only for `owner`/`admin` like the existing `setup_completed` check.

- [ ] **Step 1: Replace the existing setup_completed block**

Replace this existing block (lines ~68-76):

```ts
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

with:

```ts
  if (orgId) {
    const { data: org } = await supabase
      .from('organisations').select('deactivated_at, setup_completed').eq('id', orgId).maybeSingle()
    if (org?.deactivated_at) redirect('/account-deactivated')
    if (['owner', 'admin'].includes(role) && org && !org.setup_completed) redirect('/setup')
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('deactivated_at, setup_completed').eq('id', user.id).maybeSingle()
    if (profile?.deactivated_at) redirect('/account-deactivated')
    if (profile && !profile.setup_completed) redirect('/setup')
  }
```

This runs the `deactivated_at` check for every role (satisfying the spec's explicit requirement that deactivation locks out the whole org, not just owner/admin) while preserving the exact existing `setup_completed` behavior and role-scoping, and without adding a second query — `deactivated_at` and `setup_completed` are fetched together in the same `select`.

- [ ] **Step 2: Verify**

Run: `pnpm run build` — must pass clean.

Manual: as a deactivated org's employee (not owner/admin), confirm visiting `/dashboard` redirects to `/account-deactivated`. Confirm a non-deactivated org still behaves exactly as before (setup redirect still fires only for owner/admin on an incomplete org).

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat: block dashboard access for deactivated accounts (all roles)"
```

---

### Task 6: `/account-deactivated` page + reactivation

**Files:**
- Create: `src/app/account-deactivated/page.tsx`
- Create: `src/components/account/ReactivateAccountButton.tsx`

**Interfaces:**
- Consumes: `POST /api/account/reactivate` from Task 3; `SignOutButton` (existing, `src/components/SignOutButton.tsx`).
- Produces: the page every gated redirect (Task 4, Task 5) and the Danger Zone form (Task 4) sends the user to.

- [ ] **Step 1: Write the reactivate button**

```tsx
// src/components/account/ReactivateAccountButton.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ReactivateAccountButton() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function reactivate() {
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/account/reactivate', { method: 'POST' })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to reactivate account.')
      setSubmitting(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div>
      <button
        onClick={reactivate}
        disabled={submitting}
        className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {submitting ? 'Reactivating…' : 'Reactivate account'}
      </button>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Write the page**

```tsx
// src/app/account-deactivated/page.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ReactivateAccountButton from '@/components/account/ReactivateAccountButton'
import SignOutButton from '@/components/SignOutButton'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function AccountDeactivatedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()

  let deactivatedAt: string | null = null
  let isOwner = false

  if (membership?.org_id) {
    const { data: org } = await supabase
      .from('organisations').select('deactivated_at').eq('id', membership.org_id).maybeSingle()
    deactivatedAt = org?.deactivated_at ?? null
    isOwner = membership.role === 'owner'
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('deactivated_at').eq('id', user.id).maybeSingle()
    deactivatedAt = profile?.deactivated_at ?? null
    isOwner = true
  }

  if (!deactivatedAt) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-slate-100">Account deactivated</h1>
        <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
          Deactivated on {fmtDate(deactivatedAt)}. No data was deleted.
        </p>

        <div className="mt-6">
          {isOwner ? (
            <ReactivateAccountButton />
          ) : (
            <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">
              Contact the account owner to reactivate this account.
            </p>
          )}
        </div>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

Run: `pnpm run build` — must pass clean.

Manual: as the owner, deactivate (Task 4's flow), confirm landing on this page shows the deactivated date and a working "Reactivate account" button; click it, confirm `/dashboard` is reachable again and all prior data is untouched. As a non-owner member of a still-deactivated org, confirm this page shows only the informational message (no button) and that navigating to `/dashboard` or `/settings` redirects back here. Confirm the "Sign out" link works from this page.

- [ ] **Step 4: Commit**

```bash
git add src/app/account-deactivated src/components/account/ReactivateAccountButton.tsx
git commit -m "feat: add account-deactivated page with owner-only reactivation"
```

---

## Self-Review

**1. Spec coverage:**
- Danger Zone visibility (owner or solo, not admin) → Task 4 Step 2 (`isOwner || isSolo`). ✓
- Paid-plan block with Billing link → Task 4 Step 1 (`blockedByPlan`). ✓
- Reason + optional feedback collected before confirmation → Task 4 Step 1 (`step === 'reason'`). ✓
- Type-to-confirm exact org name / own name → Task 4 Step 1 (`step === 'confirm'`, `typedConfirm !== accountLabel` disables submit). ✓
- Server action: set `deactivated_at`, insert `account_deactivations`, email operator, (sign-out dropped — see Global Constraints deviation note) → Task 3 Step 1. ✓
- `OPERATOR_NOTIFICATION_EMAIL` env var, not hardcoded → Task 3 Step 1 (`process.env.OPERATOR_NOTIFICATION_EMAIL`). ✓
- Redirect to `/account-deactivated` → Task 4 Step 1 (`router.push`). ✓
- Access blocking for ALL roles, both `/dashboard` and `/settings` → Task 5, Task 4 Step 2. ✓
- Page-level gate only, documented, not RLS → noted in Task 1's SQL comment and this plan's constraints. ✓
- Reactivation owner-only, symmetric with deactivation, informational-only for others → Task 6 Step 2 (`isOwner` branch). ✓
- `account_deactivations` history survives multiple cycles (separate table, not overwritten columns) → Task 1. ✓
- Exactly one of `org_id`/`user_id` set → Task 1 (`account_deactivations_one_owner` check constraint). ✓

**2. Placeholder scan:** No TBD/TODO markers; every step has complete, exact code. The one deliberate scope note (dropping the literal "sign out" step) is documented as a decision with reasoning, not a placeholder.

**3. Type consistency:** `DeactivationReason` (Task 2) is used identically in Task 3's `REASONS` array, Task 3's route body parsing, and Task 4's `REASONS`/`<select>` — same 5 string literals throughout. `AccountDeactivation` type (Task 2) isn't directly imported anywhere else in this plan (the API routes use raw Supabase inserts/selects rather than typed reads) — left in Task 2 for consistency with the project's existing `types/*.ts` convention (e.g. `types/incident-reports.ts`) and as the shape future admin tooling would use; not dead code, just not yet consumed by a UI list. `formatTenure`/`REASON_LABEL` (Task 2) are consumed by both Task 3 (email body) and Task 4 (`<select>` labels) with matching signatures.

**One additional gap found and fixed during self-review:** the original spec's flow implied the deactivation API route would need to send the client-typed confirmation text to the server to verify it — but that's unnecessary and was correctly left out: the security boundary is the owner-role + reason-enum + paid-plan checks (Task 3, all server-side), not the typed text, which is purely a client-side UX safety rail (Task 4) that never needs to reach the server.

---

## `.handover/spec.md` checklist (for the handover loop)

- C-1: Database schema — conductor-only, done directly (not dispatched to Codex).
- C-2: Types and shared lib (`src/types/account-deactivation.ts`, `src/lib/account-deactivation.ts`).
- C-3: API routes (`/api/account/deactivate`, `/api/account/reactivate`).
- C-4: Settings Danger Zone UI + settings access gate.
- C-5: Dashboard layout access gate.
- C-6: `/account-deactivated` page + reactivation button.

Before dispatching C-3/C-4, the conductor must confirm `OPERATOR_NOTIFICATION_EMAIL` is set in Vercel (`vercel env add OPERATOR_NOTIFICATION_EMAIL production`) — the route degrades gracefully (logs a warning, doesn't block deactivation) if it's missing, so this isn't a hard blocker, but the notification won't fire until it's set.
