# Tutoring: Per-Lesson Billing (second deep-dive feature for the Tutoring workspace profile)

## Background

Research and direct user knowledge (2026-07-05) established that tutoring billing needs two
distinct rhythms: per-lesson/weekly billing (many families prefer paying as lessons happen) and
prepaid packages/credits (buy a block upfront). Brainstorming settled on building per-lesson
billing first — the simpler, more commonly-needed mode per the user's own framing — with
packages/credits deferred to a later pass.

**Key realization during exploration:** lesson content/difficulty is entirely independent of
billing mechanics — a tutor can always pivot material or run an improvised lesson regardless of
how credits/billing are tracked. This clarified that the billing question is purely about *how
payment is structured*, not a constraint on what gets taught.

**A second key finding:** the existing `/api/invoices` route already has the exact extension
point needed. `invoice_items.time_entry_id` marks which tracked time entry a line item came from,
and the route already marks referenced `time_entries` as invoiced (`invoice_id` set) once the
invoice is created. Extending this same route to also accept a `session_id` per item — rather
than building a parallel invoice-creation path — is both smaller and more consistent with how the
app already works.

## Scope for this phase

- `sessions.invoice_id` (nullable, additive) — mirrors `time_entries.invoice_id` exactly. A
  completed session with `invoice_id = null` is billable and not yet invoiced.
- `invoice_items.session_id` (nullable, additive) — mirrors `invoice_items.time_entry_id` exactly.
- Extend the existing `/api/invoices` POST route to accept an optional `session_id` per line item
  and mark referenced sessions as invoiced, alongside its existing `time_entry_id` handling.
- Pricing reuses the existing `clients.default_rate` (hourly) × session duration — no new pricing
  field. A student's own project/session terminology and content are unaffected; this is purely a
  billing mechanism.
- New UI: a "Billable lessons" panel on the client's Sessions page, showing completed sessions
  with `invoice_id = null` as a checklist (not the existing Tile-based history grid — a separate,
  simple list, matching the established pattern already used for Students/Archived clients).
  Selecting lessons and submitting creates one invoice with one line item per lesson.
- **Not gated to the tutoring profile.** Unlike the Student entity, billing sessions directly
  isn't an inherently tutoring-only concept — a personal trainer might equally want to bill
  per-session rather than by tracked time. This feature is available to any profile with completed,
  uninvoiced sessions.

## Out of scope (explicitly deferred)

- Packages/credits (the prepaid model) — a separate future brainstorm/spec/plan cycle.
- Bundling multiple lessons into a single line item (e.g. "4 lessons this week" as one row) —
  every selected lesson gets its own line item this pass; bundling can be added later if the
  one-line-per-lesson granularity turns out to be too noisy in practice.
- Any change to the existing time-entry-based invoicing flow (`NewInvoiceForm.tsx`) — left
  completely untouched. This is a parallel, simpler path, not a replacement.
- A flat, non-hourly per-lesson price distinct from `clients.default_rate` — no demonstrated need
  yet; revisit if tutors report that hourly-derived pricing doesn't match how they actually charge.

## Known pre-existing limitation, not introduced by this change

The `/api/invoices` route uses the service-role client and only checks that the caller is
authenticated (`auth.getUser()`) — it does not verify the caller actually owns or has org access
to the `clientId`/`time_entry_id`s/`orgId` being billed before inserting. This is an existing gap
in the route today (confirmed by reading it), not something this feature introduces or worsens —
extending it to also accept `session_id` inherits the same trust level as the existing
`time_entry_id` handling, no more and no less. Flagging for transparency; fixing this route's
authorization model is a separate, larger conversation out of scope here.

## Architecture

### Schema (`supabase/schema-085-tutoring-lesson-billing.sql`)

```sql
alter table public.sessions
  add column invoice_id uuid references public.invoices on delete set null;

create index sessions_invoice on public.sessions (invoice_id) where invoice_id is not null;

alter table public.invoice_items
  add column session_id uuid references public.sessions on delete set null;
```

### API route extension (`src/app/api/invoices/route.ts`)

The `POST` handler's request body gains an optional `session_id` per item (alongside the existing
`time_entry_id`), and an optional `invoicedSessionIds` array (alongside the existing
`invoicedEntryIds`) for sessions that don't map 1:1 to a line item but should still be marked
invoiced. Line item insertion adds `session_id: item.session_id || null`. After the existing
`time_entries` invoiced-marking block, an equivalent block marks `sessions`:

```typescript
const allSessionIds = [
  ...(invoicedSessionIds ?? []),
  ...items.map((i: { session_id?: string }) => i.session_id).filter(Boolean),
]
const uniqueSessionIds = [...new Set(allSessionIds)] as string[]
if (uniqueSessionIds.length > 0) {
  await service.from('sessions').update({ invoice_id: invoice.id }).in('id', uniqueSessionIds)
}
```

No ownership/ID-scoping filter is added beyond what the existing `time_entries` block already
does (see the "known pre-existing limitation" section above) — this matches, not exceeds, the
existing trust level.

### UI (`src/components/clients/BillableSessionsPanel.tsx`, new client component)

Props: `clientId: string`, `orgId: string | null`, `defaultRate: number` (the sessions page passes
`client.default_rate ?? 0` — matching the existing fallback `NewInvoiceForm.tsx`'s own
`loadEntries()` already uses for the same nullable field), `currency: string`,
`sessions: { id: string; title: string; scheduled_at: string; duration_minutes: number;
studentName: string | null }[]` (already-filtered to `status = 'completed' AND invoice_id IS
NULL`, fetched server-side by the sessions page).

- Renders a checklist (checkbox, lesson title, date, student name if present, computed price
  `defaultRate × (duration_minutes / 60)`), a running subtotal, and a "Create invoice" button
  (disabled until at least one lesson is checked).
- On submit: `POST /api/invoices` with `clientId`, `orgId`, `currency`, `issueDate` (today),
  `items: selected.map(s => ({ description: '<title> — <date>', quantity: duration_minutes/60,
  unit_price: defaultRate, session_id: s.id }))`.
- On success: redirect to `/dashboard/invoices/<id>`, matching `NewInvoiceForm`'s own existing
  success behaviour.
- Renders nothing (not even an empty state) when `sessions` is empty — this panel should be
  invisible until there's actually something billable, not add visual noise to every client's
  Sessions page.

**Modify `src/app/dashboard/clients/[id]/sessions/page.tsx`:** fetch the client's `default_rate`/
`currency` (not currently selected on this page) and a second sessions query scoped to
`status = 'completed' AND invoice_id IS NULL`, join `students(name)` the same way the main
sessions query already does, and render `BillableSessionsPanel` above or below the existing
`TileGrid`.

## Verification

No test runner in this project — verification is `pnpm run build` plus manual testing:
1. SQL check post-migration: `sessions.invoice_id` and `invoice_items.session_id` exist, both
   nullable.
2. Mark a completed test session as billable (i.e. just create one, mark it completed), confirm
   it appears in the new "Billable lessons" panel with the correct computed price.
3. Select it, create an invoice, confirm: the invoice appears in `/dashboard/invoices`, the
   session no longer appears in the billable panel (its `invoice_id` is now set), and the
   invoice's line item is correct.
4. Confirm a client/student with zero completed-uninvoiced sessions shows no panel at all.
5. Confirm this works identically regardless of workspace profile (not gated to tutoring) —
   spot-check with the real account still set to a non-tutoring profile.
