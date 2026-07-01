# Company Logo & Invoice Email Sender — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add company logo upload to settings + onboarding (appears in invoice PDF, email HTML, and invoice UI), and fix invoice email sender to show business name in From and route replies to the owner's inbox.

**Architecture:** Eight sequential tasks — migration first (unblocks storage), then the leaf components (LogoUpload, InvoiceDocument), then integration points (settings, onboarding, send route, detail page), and a final build + ship. Each task compiles independently; the build gate is `pnpm run build` (no test runner).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Supabase SSR, `@react-pdf/renderer`, Resend API (raw fetch), Tailwind v4.

## Global Constraints

- Package manager: `pnpm` — never `npm install`.
- No new npm dependencies.
- Shell is PowerShell — use `pnpm run build` to verify, not `npm run build`.
- Supabase project id: `sdwwlnnsijcadkdwsvud`. Apply migrations via MCP `apply_migration` AND write the SQL file to `supabase/`.
- Every `as { ... }` cast on a Supabase FK join must use `as unknown as { ... }` (tsc requirement).
- No test runner — the verification gate is `pnpm run build` passing clean (tsc + eslint).
- Storage path: solo user → `{userId}/logo`, org → `{orgId}/logo`. No file extension — upsert overwrites regardless of MIME type.
- `logo_url` stored in DB is the full public URL string from `getPublicUrl()`.
- Logo resolution: team plan + org → `organisation.logo_url`, pro plan → `profile.logo_url`, free plan → `null`.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `supabase/schema-071-logo.sql` | Create | Migration: `logo_url` columns + `logos` bucket + RLS |
| `src/lib/invoice-letterhead.ts` | Modify | Add `invoiceLogo()` helper (mirrors `invoiceLetterhead`) |
| `src/lib/email-notifications.ts` | Modify | Add `fromName?` + `replyTo?` to `sendEmail` |
| `src/components/LogoUpload.tsx` | Create | Reusable client component: upload/preview/remove logo |
| `src/components/AccountSettingsForm.tsx` | Modify | Add `initialLogoUrl` + `userId` props; render `<LogoUpload>` |
| `src/components/OrgBillingSettingsForm.tsx` | Modify | Add `initialLogoUrl` prop; render `<LogoUpload>` |
| `src/app/settings/page.tsx` | Modify | Add `logo_url` to selects; pass new props to forms |
| `src/app/onboarding/page.tsx` | Modify | Two-phase: org create → optional logo upload |
| `src/components/invoices/InvoiceDocument.tsx` | Modify | Add `logoUrl?` prop; render `<Image>` in PDF header |
| `src/app/api/invoices/[id]/send/route.ts` | Modify | Resolve logo; pass to PDF + email HTML; add `fromName`/`replyTo` |
| `src/app/dashboard/invoices/[id]/page.tsx` | Modify | Fetch + display logo above letterhead |

---

### Task 1: Supabase migration — logo_url columns + logos bucket

**Files:**
- Create: `supabase/schema-071-logo.sql`
- Apply via: Supabase MCP `apply_migration`

**Interfaces:**
- Produces: `profiles.logo_url text`, `organisations.logo_url text`, public `logos` storage bucket with RLS

- [ ] **Step 1: Write migration file**

Create `supabase/schema-071-logo.sql` with this exact content:

```sql
-- Add logo_url to both profile and org tables
alter table public.profiles add column if not exists logo_url text;
alter table public.organisations add column if not exists logo_url text;

-- Public logos bucket (URLs must be stable for emails and PDFs)
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Solo users: own path by userId (folder[1] = userId)
create policy "Users can upload their own logo"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own logo"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Org admins: own path by orgId (folder[1] = orgId)
create policy "Org admins can upload org logo"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and exists (
      select 1 from public.organisation_members om
      where om.user_id = auth.uid()
        and om.org_id::text = (storage.foldername(name))[1]
        and om.role in ('owner', 'admin')
    )
  );

create policy "Org admins can delete org logo"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and exists (
      select 1 from public.organisation_members om
      where om.user_id = auth.uid()
        and om.org_id::text = (storage.foldername(name))[1]
        and om.role in ('owner', 'admin')
    )
  );

create policy "Logos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'logos');
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use the MCP `apply_migration` tool:
- `name`: `schema-071-logo`
- `query`: the SQL content from step 1

- [ ] **Step 3: Verify columns exist**

Use MCP `execute_sql` to confirm:
```sql
select column_name from information_schema.columns
where table_name in ('profiles', 'organisations')
  and column_name = 'logo_url';
```
Expected: 2 rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-071-logo.sql
git commit -m "feat: add logo_url columns and logos storage bucket"
```

---

### Task 2: Email sender fix — fromName + replyTo in sendEmail

**Files:**
- Modify: `src/lib/email-notifications.ts`

**Interfaces:**
- Produces: `sendEmail` now accepts `fromName?: string` and `replyTo?: string`; all existing callers are unaffected (fields are optional)

- [ ] **Step 1: Update the `Email` type and `sendEmail` function**

In `src/lib/email-notifications.ts`, replace the existing `Email` type and `sendEmail` function (lines 23-110):

```typescript
type Email = {
  to: string
  subject: string
  text: string
  html: string
  attachments?: Attachment[]
  fromName?: string
  replyTo?: string
}
```

Then update `sendEmail` to use them:

```typescript
export async function sendEmail({ to, subject, text, html, attachments, fromName, replyTo }: Email) {
  const apiKey = process.env.RESEND_API_KEY
  const baseFrom = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !baseFrom) {
    console.info(`Email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured. Subject: ${subject}`)
    return { skipped: true }
  }

  const from = fromName ? `${fromName} <${baseFrom}>` : baseFrom

  const body: Record<string, unknown> = { from, to, subject, text, html }
  if (attachments?.length) body.attachments = attachments
  if (replyTo) body.reply_to = replyTo

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend email failed: ${response.status} ${body}`)
  }

  return response.json()
}
```

- [ ] **Step 2: Build to verify**

```powershell
pnpm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email-notifications.ts
git commit -m "feat: sendEmail supports fromName and replyTo"
```

---

### Task 3: invoiceLogo helper in invoice-letterhead.ts

**Files:**
- Modify: `src/lib/invoice-letterhead.ts`

**Interfaces:**
- Produces: `invoiceLogo({ profile, organisation, subscription }): string | null` — same call signature as `invoiceLetterhead`, returns the logo URL or `null`

- [ ] **Step 1: Add `invoiceLogo` export**

Append to the end of `src/lib/invoice-letterhead.ts`:

```typescript
type ProfileLogo = {
  logo_url?: string | null
}

type OrganisationLogo = {
  logo_url?: string | null
} | null

export function invoiceLogo({
  profile,
  organisation,
  subscription,
}: {
  profile: ProfileLogo | null
  organisation: OrganisationLogo
  subscription: Subscription
}): string | null {
  const plan = effectivePlan(subscription)
  if (plan === 'team' && organisation) return organisation.logo_url ?? null
  if (plan === 'pro') return profile?.logo_url ?? null
  return null
}
```

- [ ] **Step 2: Build**

```powershell
pnpm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/invoice-letterhead.ts
git commit -m "feat: invoiceLogo helper resolves logo per plan"
```

---

### Task 4: LogoUpload component

**Files:**
- Create: `src/components/LogoUpload.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase-browser`
- Produces: `<LogoUpload currentLogoUrl={string|null} storagePath={string} targetTable={'profiles'|'organisations'} targetId={string} />`

- [ ] **Step 1: Create the component**

Create `src/components/LogoUpload.tsx`:

```typescript
'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  currentLogoUrl: string | null
  storagePath: string
  targetTable: 'profiles' | 'organisations'
  targetId: string
}

export default function LogoUpload({ currentLogoUrl, storagePath, targetTable, targetId }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(currentLogoUrl)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Only PNG or JPEG files are supported.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2 MB.')
      return
    }
    setError(null)
    setUploading(true)
    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(storagePath, file, { upsert: true, contentType: file.type })
    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(storagePath)
    const { error: dbError } = await supabase
      .from(targetTable)
      .update({ logo_url: publicUrl })
      .eq('id', targetId)
    if (dbError) {
      setError(dbError.message)
      setUploading(false)
      return
    }
    setLogoUrl(publicUrl)
    setUploading(false)
  }

  async function handleRemove() {
    setError(null)
    setUploading(true)
    const supabase = createClient()
    await supabase.storage.from('logos').remove([storagePath])
    const { error: dbError } = await supabase
      .from(targetTable)
      .update({ logo_url: null })
      .eq('id', targetId)
    if (dbError) {
      setError(dbError.message)
      setUploading(false)
      return
    }
    setLogoUrl(null)
    setUploading(false)
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-900">Company logo</p>
      <p className="mb-3 text-xs font-medium text-gray-500">
        Shown on invoices, PDF, and email. PNG or JPEG, max 2 MB.
      </p>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {logoUrl
            ? <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
            : <span className="text-xs text-gray-400">No logo</span>
          }
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={uploading}
              onClick={handleRemove}
              className="rounded-xl border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Build**

```powershell
pnpm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/LogoUpload.tsx
git commit -m "feat: LogoUpload component for logos bucket"
```

---

### Task 5: Wire LogoUpload into settings (AccountSettingsForm, OrgBillingSettingsForm, settings page)

**Files:**
- Modify: `src/components/AccountSettingsForm.tsx`
- Modify: `src/components/OrgBillingSettingsForm.tsx`
- Modify: `src/app/settings/page.tsx`

**Interfaces:**
- Consumes: `LogoUpload` from `@/components/LogoUpload`
- Consumes: `invoiceLogo` — not needed here (no resolution, forms just pass the stored URL)

- [ ] **Step 1: Update `AccountSettingsForm` props and render LogoUpload**

In `src/components/AccountSettingsForm.tsx`, add `initialLogoUrl` and `userId` to the `Props` type:

```typescript
type Props = {
  email: string
  userId: string
  initialFullName: string
  initialTimezone: string
  initialAuState: AustralianState | ''
  initialInvoiceLetterhead: string
  initialLogoUrl: string | null
  initialInvoicePaymentDetails: InvoicePaymentDetails
  canEditInvoiceLetterhead: boolean
  initialNotifications: NotificationPreferences
}
```

Add `userId` and `initialLogoUrl` to the function destructuring:

```typescript
export default function AccountSettingsForm({
  email,
  userId,
  initialFullName,
  initialTimezone,
  initialAuState,
  initialInvoiceLetterhead,
  initialLogoUrl,
  initialInvoicePaymentDetails,
  canEditInvoiceLetterhead,
  initialNotifications,
}: Props) {
```

Add `LogoUpload` import at the top of the file:

```typescript
import LogoUpload from '@/components/LogoUpload'
```

After the closing `</div>` of the letterhead section (after line 188 in the existing file, i.e. after the `{canEditInvoiceLetterhead && ( ... )}` block), add the LogoUpload inside the same conditional:

Replace the existing letterhead block:

```tsx
{canEditInvoiceLetterhead && (
  <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-bold text-gray-900">Invoice letterhead</h2>
    <p className="mt-1 text-sm font-semibold text-gray-500">Shown at the top of invoices instead of TimeWiseHub.</p>
    <input
      type="text"
      value={invoiceLetterhead}
      onChange={e => setInvoiceLetterhead(e.target.value)}
      placeholder={fullName || email || 'Your business name'}
      className="mt-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
    />
    <div className="mt-6 border-t border-gray-100 pt-6">
      <LogoUpload
        currentLogoUrl={initialLogoUrl}
        storagePath={`${userId}/logo`}
        targetTable="profiles"
        targetId={userId}
      />
    </div>
  </div>
)}
```

- [ ] **Step 2: Update `OrgBillingSettingsForm` props and render LogoUpload**

In `src/components/OrgBillingSettingsForm.tsx`, add `initialLogoUrl: string | null` to the props interface:

```typescript
export default function OrgBillingSettingsForm({
  orgId,
  initialRoundingMinutes,
  initialPayCadence,
  initialSuperRate,
  initialPayWeekStartDay,
  initialOrgName,
  initialInvoiceLetterhead,
  initialLogoUrl,
  initialInvoicePaymentDetails,
  canEditInvoiceLetterhead,
  initialMembers,
}: {
  orgId: string
  initialRoundingMinutes: number
  initialPayCadence: string
  initialSuperRate: number
  initialPayWeekStartDay: number
  initialOrgName: string
  initialInvoiceLetterhead: string
  initialLogoUrl: string | null
  initialInvoicePaymentDetails: InvoicePaymentDetails
  canEditInvoiceLetterhead: boolean
  initialMembers: OrgMember[]
}) {
```

Add `LogoUpload` import at the top:

```typescript
import LogoUpload from '@/components/LogoUpload'
```

Replace the existing `{canEditInvoiceLetterhead && ( ... )}` letterhead block with:

```tsx
{canEditInvoiceLetterhead && (
  <div className="space-y-4">
    <div>
      <label htmlFor="invoiceLetterhead" className="block text-sm font-bold text-gray-900">Invoice letterhead</label>
      <input
        id="invoiceLetterhead"
        type="text"
        value={invoiceLetterhead}
        onChange={e => setInvoiceLetterhead(e.target.value)}
        placeholder={initialOrgName || 'Organisation name'}
        className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
      />
      <p className="mt-1 text-xs font-medium text-gray-500">
        Leave blank to use {initialOrgName || 'your organisation name'} on team invoices.
      </p>
    </div>
    <LogoUpload
      currentLogoUrl={initialLogoUrl}
      storagePath={`${orgId}/logo`}
      targetTable="organisations"
      targetId={orgId}
    />
  </div>
)}
```

- [ ] **Step 3: Update settings page — add logo_url to selects and new props**

In `src/app/settings/page.tsx`, add `logo_url` to the profile select (line 21):

```typescript
supabase
  .from('profiles')
  .select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, logo_url, invoice_payment_details, username, nickname, avatar_url')
  .eq('id', user.id)
  .single(),
```

Add `logo_url` to the org select (line 38):

```typescript
supabase
  .from('organisations')
  .select('name, time_rounding_minutes, pay_cadence, super_rate, pay_week_start_day, invoice_letterhead, logo_url, invoice_payment_details')
  .eq('id', membership.org_id)
  .single(),
```

Add `userId` and `initialLogoUrl` to the `<AccountSettingsForm>` render (around line 129):

```tsx
<AccountSettingsForm
  email={user.email ?? ''}
  userId={user.id}
  initialFullName={profile?.full_name ?? ''}
  initialTimezone={profile?.timezone ?? 'UTC'}
  initialAuState={profile?.au_state ?? ''}
  initialInvoiceLetterhead={profile?.invoice_letterhead ?? ''}
  initialLogoUrl={profile?.logo_url ?? null}
  initialInvoicePaymentDetails={profile?.invoice_payment_details ?? {}}
  canEditInvoiceLetterhead={plan === 'pro'}
  initialNotifications={profile?.notification_preferences ?? {
    deadline_alerts: true,
    priority_nudges: true,
    daily_digest: true,
    scheduled_reports: true,
    idle_alerts: true,
  }}
/>
```

Add `initialLogoUrl` to the `<OrgBillingSettingsForm>` render (around line 168):

```tsx
<OrgBillingSettingsForm
  orgId={membership.org_id}
  initialRoundingMinutes={organisation?.time_rounding_minutes ?? 0}
  initialPayCadence={organisation?.pay_cadence ?? 'fortnightly'}
  initialSuperRate={organisation?.super_rate ?? 12}
  initialPayWeekStartDay={organisation?.pay_week_start_day ?? 1}
  initialOrgName={organisation?.name ?? ''}
  initialInvoiceLetterhead={organisation?.invoice_letterhead ?? ''}
  initialLogoUrl={organisation?.logo_url ?? null}
  initialInvoicePaymentDetails={organisation?.invoice_payment_details ?? {}}
  canEditInvoiceLetterhead={plan === 'team'}
  initialMembers={(members ?? []) as unknown as Parameters<typeof OrgBillingSettingsForm>[0]['initialMembers']}
/>
```

- [ ] **Step 4: Build**

```powershell
pnpm run build
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AccountSettingsForm.tsx src/components/OrgBillingSettingsForm.tsx src/app/settings/page.tsx
git commit -m "feat: logo upload in account and org settings"
```

---

### Task 6: Two-phase onboarding with optional logo upload

**Files:**
- Modify: `src/app/onboarding/page.tsx`

**Interfaces:**
- Consumes: `LogoUpload` from `@/components/LogoUpload`
- Produces: two-phase UI — phase 1 creates org, phase 2 shows optional `LogoUpload`, both redirect to `/dashboard`

- [ ] **Step 1: Rewrite onboarding page**

Replace the entire content of `src/app/onboarding/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import LogoUpload from '@/components/LogoUpload'

function slugify(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export default function OnboardingPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const slug = slugify(name)

    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .insert({ name, slug })
      .select()
      .single()

    if (orgError) {
      setError(orgError.message)
      setLoading(false)
      return
    }

    const { error: memberError } = await supabase
      .from('organisation_members')
      .insert({ org_id: org.id, user_id: user.id, role: 'owner' })

    if (memberError) {
      setError(memberError.message)
      setLoading(false)
      return
    }

    setCreatedOrgId(org.id)
    setLoading(false)
  }

  if (createdOrgId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Add your company logo</h1>
          <p className="mb-8 text-sm font-medium text-gray-500">Optional — you can always add or change this in Settings.</p>

          <div className="space-y-8">
            <LogoUpload
              currentLogoUrl={null}
              storagePath={`${createdOrgId}/logo`}
              targetTable="organisations"
              targetId={createdOrgId}
            />

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { router.push('/dashboard'); router.refresh() }}
                className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
              >
                Skip for now
              </button>
              <button
                type="button"
                onClick={() => { router.push('/dashboard'); router.refresh() }}
                className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900">Set up your organisation</h1>
        <p className="mb-8 text-sm font-medium text-gray-500">You can invite team members after setup.</p>

        <form onSubmit={handleCreate} className="space-y-5">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-900">Organisation name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Vividex"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            />
            {name && (
              <p className="mt-2 text-xs font-semibold text-gray-500">URL slug: {slugify(name)}</p>
            )}
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create organisation'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

```powershell
pnpm run build
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboarding/page.tsx
git commit -m "feat: two-phase onboarding with optional logo upload"
```

---

### Task 7: Invoice PDF — logo in InvoiceDocument

**Files:**
- Modify: `src/components/invoices/InvoiceDocument.tsx`

**Interfaces:**
- Consumes: `Image` from `@react-pdf/renderer`
- Produces: `InvoiceDocument` now accepts optional `logoUrl?: string` prop; logo renders in header above org name when provided

- [ ] **Step 1: Add Image import and logoUrl prop**

In `src/components/invoices/InvoiceDocument.tsx`, add `Image` to the import:

```typescript
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer'
```

Add `logoUrl?: string` to the `Props` type:

```typescript
type Props = {
  invoiceNumber: string
  letterhead: string
  clientName: string
  dueDate: string | null
  currency: string
  items: Item[]
  subtotal: number
  paymentLines: string[]
  hasPaymentDetails: boolean
  logoUrl?: string
}
```

Add `logoUrl` to function destructuring:

```typescript
export default function InvoiceDocument({
  invoiceNumber, letterhead, clientName, dueDate, currency,
  items, subtotal, paymentLines, hasPaymentDetails, logoUrl,
}: Props) {
```

Replace the header `<View>` block to include the logo:

```tsx
<View style={styles.header}>
  <View>
    {logoUrl && (
      <Image
        src={logoUrl}
        style={{ maxWidth: 60, maxHeight: 36, objectFit: 'contain', marginBottom: 6 }}
      />
    )}
    <Text style={styles.orgName}>{letterhead}</Text>
    <Text style={styles.invoiceTitle}>INVOICE</Text>
  </View>
  <Text style={styles.invoiceNumber}>{invoiceNumber}</Text>
</View>
```

- [ ] **Step 2: Build**

```powershell
pnpm run build
```

Expected: exits 0. (`@react-pdf/renderer` exports `Image` — no new dependency needed.)

- [ ] **Step 3: Commit**

```bash
git add src/components/invoices/InvoiceDocument.tsx
git commit -m "feat: company logo in invoice PDF"
```

---

### Task 8: Invoice send route — logo + fromName + replyTo

**Files:**
- Modify: `src/app/api/invoices/[id]/send/route.ts`

**Interfaces:**
- Consumes: `invoiceLogo` from `@/lib/invoice-letterhead` (Task 3)
- Consumes: `sendEmail` with `fromName` + `replyTo` (Task 2)
- Consumes: `InvoiceDocument` with `logoUrl` (Task 7)

- [ ] **Step 1: Add invoiceLogo import**

At the top of `src/app/api/invoices/[id]/send/route.ts`, update the invoice-letterhead import:

```typescript
import { invoiceLetterhead, invoiceLogo } from '@/lib/invoice-letterhead'
```

- [ ] **Step 2: Add logo_url to the profile and org Supabase selects**

Find the `Promise.all` that fetches `profile` and `organisation` (currently around line 61). Update the selects:

```typescript
const [{ data: profile }, subscription, { data: organisation }] = await Promise.all([
  service.from('profiles').select('full_name, email, invoice_letterhead, logo_url, invoice_payment_details').eq('id', user.id).single(),
  getSubscription(user.id),
  invoice.org_id
    ? service.from('organisations').select('name, invoice_letterhead, logo_url, invoice_payment_details').eq('id', invoice.org_id).maybeSingle()
    : Promise.resolve({ data: null }),
])
```

- [ ] **Step 3: Resolve logo URL and pass it to InvoiceDocument and email HTML**

After `const letterhead = invoiceLetterhead(...)` (around line 69), add:

```typescript
const logoUrl = invoiceLogo({ profile, organisation, subscription }) ?? undefined
```

In the PDF generation block (around line 147), add `logoUrl` to the `React.createElement` call:

```typescript
const element = React.createElement(InvoiceDocument, {
  invoiceNumber: invoice.invoice_number as string,
  letterhead,
  clientName: client.name,
  dueDate: invoice.due_date as string | null,
  currency: invoice.currency as string,
  items: pdfItems,
  subtotal: Number(invoice.subtotal),
  paymentLines,
  hasPaymentDetails: hasInvoicePaymentDetails(paymentDetails),
  logoUrl,
}) as unknown as React.ReactElement<DocumentProps>
```

In the `sendEmail` call, prepend the logo `<img>` to the HTML and add `fromName` + `replyTo`:

```typescript
const emailResult = await sendEmail({
  to: client.email,
  subject,
  text: lines.join('\n\n'),
  attachments: pdfAttachment ? [pdfAttachment] : undefined,
  fromName: letterhead,
  replyTo: profile?.email ?? undefined,
  html: `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      ${logoUrl ? `<img src="${logoUrl}" alt="" style="max-height:60px;max-width:200px;object-fit:contain;display:block;margin-bottom:16px;" />` : ''}
      ${lines.filter(line => !line.startsWith('Pay securely here:')).map(line => `<p>${escapeHtml(line)}</p>`).join('')}
      ${paymentLink ? `<p style="margin:20px 0;"><a href="${paymentLink}" style="background:#0891b2;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Pay Invoice</a></p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
        <thead><tr><th style="padding:8px 0;border-bottom:1px solid #d1d5db;text-align:left;">Description</th><th style="padding:8px 0;border-bottom:1px solid #d1d5db;text-align:right;">Qty</th><th style="padding:8px 0;border-bottom:1px solid #d1d5db;text-align:right;">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p style="font-size:18px;font-weight:700;">Total: ${escapeHtml(total)}</p>
      ${hasInvoicePaymentDetails(paymentDetails) ? `
        <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-top:20px;">
          <p style="font-weight:700;margin:0 0 8px;">Bank transfer details</p>
          ${paymentLines.map(line => `<p style="margin:4px 0;">${escapeHtml(line)}</p>`).join('')}
          <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Use invoice ${escapeHtml(invoice.invoice_number)} as the payment reference.</p>
        </div>
      ` : ''}
    </div>
  `,
})
```

- [ ] **Step 4: Build**

```powershell
pnpm run build
```

Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/invoices/[id]/send/route.ts
git commit -m "feat: logo + fromName/replyTo in invoice send route"
```

---

### Task 9: Invoice detail page — show logo in UI

**Files:**
- Modify: `src/app/dashboard/invoices/[id]/page.tsx`

**Interfaces:**
- Consumes: `invoiceLogo` from `@/lib/invoice-letterhead`

- [ ] **Step 1: Add logo_url to selects and resolve logo**

In `src/app/dashboard/invoices/[id]/page.tsx`, update the `invoiceLetterhead` import to also import `invoiceLogo`:

```typescript
import { invoiceLetterhead, invoiceLogo } from '@/lib/invoice-letterhead'
```

Add `logo_url` to the profile select (around line 57):

```typescript
supabase
  .from('profiles')
  .select('full_name, email, invoice_letterhead, logo_url, invoice_payment_details')
  .eq('id', user.id)
  .single(),
```

Add `logo_url` to the org select (around line 63):

```typescript
invoice.org_id
  ? supabase
    .from('organisations')
    .select('name, invoice_letterhead, logo_url, invoice_payment_details')
    .eq('id', invoice.org_id)
    .maybeSingle()
  : Promise.resolve({ data: null }),
```

After `const letterhead = invoiceLetterhead(...)` (line 71), add:

```typescript
const logoUrl = invoiceLogo({ profile, organisation, subscription })
```

- [ ] **Step 2: Render logo in invoice header**

In the invoice document JSX, find the "Title row" section (around line 123). Replace the `<div>` that contains the letterhead text:

```tsx
{/* Title row */}
<div className="flex items-start justify-between gap-6">
  <div>
    {logoUrl && (
      <img
        src={logoUrl}
        alt="Company logo"
        className="mb-3 max-h-12 max-w-[160px] object-contain"
      />
    )}
    <p className="mb-4 text-xl font-black tracking-tight text-slate-900">{letterhead}</p>
    <p className="text-3xl font-black tracking-tight text-slate-900">{invoice.status === 'quote' ? 'QUOTE' : 'INVOICE'}</p>
    <p className="mt-1 text-lg font-bold text-cyan-600">{invoice.invoice_number}</p>
  </div>
  <span className={`rounded-xl px-3 py-1 text-sm font-black ${STATUS_STYLE[invoice.status]}`}>
    {invoice.status.toUpperCase()}
  </span>
</div>
```

- [ ] **Step 3: Build**

```powershell
pnpm run build
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/invoices/[id]/page.tsx
git commit -m "feat: company logo in invoice detail UI"
```

---

### Task 10: Final build, smoke test, and ship

**Files:** none new

- [ ] **Step 1: Full build**

```powershell
pnpm run build
```

Expected: clean exit, no errors.

- [ ] **Step 2: Smoke test checklist**

Manual checks in the browser:

1. **Settings — solo pro user:** Go to `/settings`. The "Invoice letterhead" section should show a "Company logo" upload area below the letterhead input. Upload a PNG. Verify the preview appears. Verify a "Remove" button appears. Verify removing it clears the preview. (Note: only visible when on a Pro plan.)
2. **Settings — org admin:** Same test in the Organisation settings section.
3. **Onboarding:** Create a fresh org via `/onboarding`. After org creation, phase 2 logo upload should appear with "Skip for now" and "Done" buttons. Both should redirect to `/dashboard`.
4. **Invoice send:** Open an invoice, click "Send". Receive the email. Check: From shows `"<Business Name> <noreply@...>"`, Reply-To is your email, email has a logo `<img>` at the top (if logo is uploaded), PDF attachment contains the logo in the header.
5. **Invoice detail:** Open the same invoice. Verify the logo appears above the letterhead name in the invoice card.

- [ ] **Step 3: Push to deploy**

```bash
git push
```

Vercel auto-deploys from `master`. Wait ~2 min and verify production.
