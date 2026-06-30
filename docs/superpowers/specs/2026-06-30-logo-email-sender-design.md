# Company Logo & Invoice Email Sender — Design Spec
_Date: 2026-06-30_

## Scope

Two independent improvements shipped together:

1. **Email sender** — invoice emails show the business name in the From field and set Reply-To to the sender's email
2. **Company logo** — org owners and solo pro users can upload a logo that appears in the invoice PDF, invoice email, and invoice detail UI

---

## Part 1 — Email Sender

### Change to `sendEmail` (`src/lib/email-notifications.ts`)

Add two optional fields to the `Email` type:
- `fromName?: string` — if provided, Resend `from` becomes `"{fromName} <noreply@timewisehub.com.au>"`
- `replyTo?: string` — if provided, adds `reply_to` key to the Resend payload

No other callers of `sendEmail` are affected (they omit the new fields).

### Change to invoice send route (`src/app/api/invoices/[id]/send/route.ts`)

Pass to `sendEmail`:
- `fromName: letterhead` (already computed from `invoiceLetterhead()`)
- `replyTo: profile?.email ?? undefined`

Result: client receives email From `"Abbotts Automotive <noreply@timewisehub.com.au>"`, Reply goes to the owner's inbox.

---

## Part 2 — Company Logo

### Data layer — `supabase/schema-071-logo.sql`

```sql
alter table public.profiles add column logo_url text;
alter table public.organisations add column logo_url text;

insert into storage.buckets (id, name, public) values ('logos', 'logos', true);

-- Solo users own their own path (folder = userId)
create policy "Users can upload their own logo"
  on storage.objects for insert
  with check (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Users can delete their own logo"
  on storage.objects for delete
  using (bucket_id = 'logos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Org admins own their org's path (folder = orgId)
create policy "Org admins can upload org logo"
  on storage.objects for insert
  with check (
    bucket_id = 'logos' and
    exists (
      select 1 from public.organisation_members om
      where om.user_id = auth.uid()
        and om.org_id::text = (storage.foldername(name))[1]
        and om.role in ('owner', 'admin')
    )
  );

create policy "Org admins can delete org logo"
  on storage.objects for delete
  using (
    bucket_id = 'logos' and
    exists (
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

Storage paths:
- Solo user: `{userId}/logo` (no extension — upsert overwrites regardless of source format)
- Org: `{orgId}/logo`

`logo_url` stored in DB is the full public URL returned by `getPublicUrl()`.

### Logo resolution

Mirrors the existing letterhead pattern in `invoice-letterhead.ts`:
- Team plan with org → `organisation.logo_url`
- Pro plan, no org → `profile.logo_url`
- Free plan → no logo

### New component — `src/components/LogoUpload.tsx`

Client component. Props:
```typescript
{
  currentLogoUrl: string | null
  storagePath: string          // e.g. "{userId}/logo" or "{orgId}/logo"
  targetTable: 'profiles' | 'organisations'
  targetId: string             // userId or orgId
}
```

Renders:
- Logo preview (48×48 img with `object-contain`, or grey placeholder square if none)
- "Upload logo" button → triggers hidden `<input type="file" accept="image/png,image/jpeg">`
- "Remove" button (only when logo exists)
- Inline error message on failure

On upload:
1. Validate: must be `image/png` or `image/jpeg`, max 2 MB — reject client-side with error message
2. `supabase.storage.from('logos').upload(storagePath, file, { upsert: true, contentType: file.type })`
3. `const { publicUrl } = supabase.storage.from('logos').getPublicUrl(storagePath).data`
4. `supabase.from(targetTable).update({ logo_url: publicUrl }).eq('id', targetId)`
5. Update local preview state

On remove:
1. `supabase.storage.from('logos').remove([storagePath])`
2. `supabase.from(targetTable).update({ logo_url: null }).eq('id', targetId)`
3. Clear local preview state

No `router.refresh()` needed — logo preview updates locally; the PDF/email will use the new URL on next send.

### Settings page integration

**`AccountSettingsForm`** — add `LogoUpload` below the letterhead field. Shown only when `canEditInvoiceLetterhead` (pro plan). Receives `storagePath="{userId}/logo"`, `targetTable="profiles"`, `targetId={userId}`.

Settings server page adds `logo_url` to the profiles select query.

**`OrgBillingSettingsForm`** — add `LogoUpload` below the org letterhead field. Shown only for org admins (already gated). Receives `storagePath="{orgId}/logo"`, `targetTable="organisations"`, `targetId={orgId}`.

Settings server page adds `logo_url` to the organisations select query.

### Onboarding integration (`src/app/onboarding/page.tsx`)

Currently single-step: enter org name → create org → redirect to `/dashboard`.

Change to two-phase within the same page:
- **Phase 1**: org name form (existing). On success, store `orgId` in state and advance to phase 2.
- **Phase 2**: optional logo upload. Shows `LogoUpload` with the new org's id. "Skip for now" and "Done" both redirect to `/dashboard`.

Phase 2 is fully optional — skipping results in no logo, which is fine.

### PDF rendering (`src/components/invoices/InvoiceDocument.tsx`)

Add optional `logoUrl?: string` prop. In the header `<View>`, if `logoUrl` is set, render `<Image src={logoUrl} style={{ maxWidth: 80, maxHeight: 48, objectFit: 'contain' }} />` to the left of the business name text. react-pdf `Image` fetches HTTP URLs directly during server-side `renderToBuffer` — no CORS issues.

Invoice send route: pass `logoUrl` resolved from profile/org using the resolution logic above.

### Email HTML rendering

In the invoice send route HTML template, add before the paragraph block:
```html
${logoUrl ? `<img src="${logoUrl}" alt="" style="max-height:60px;max-width:200px;object-fit:contain;display:block;margin-bottom:16px;" />` : ''}
```

### Invoice detail page UI (`src/app/dashboard/invoices/[id]/page.tsx`)

Fetch `logo_url` for the invoice owner:
- From `profiles` (always, via `owner_id`)
- From `organisations` if the invoice has an `org_id`

Apply resolution logic (team → org logo, pro → profile logo, free → none).

Render a small `<img>` (max height 48px) above the letterhead name in the invoice header card.

---

## Out of scope

- Logo on quotes (invoices first; quotes reuse InvoiceDocument later)
- Crop/resize UI (accept as-is; owner's responsibility to upload a clean image)
- Logo in other email types (review notifications, digests, etc.)
