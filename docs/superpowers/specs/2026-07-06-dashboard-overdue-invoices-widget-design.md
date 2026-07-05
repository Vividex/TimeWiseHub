# Dashboard: Overdue Invoices Widget

## Origin

Raised as "let's look at dashboard personalisation" (Phase 5 of the Workspace Profile roadmap,
previously deferred). Scoped down during brainstorming: the user confirmed "personalisation" here
means checking the dashboard's *content* against industry norms via competitive research, not
building a per-user customization mechanism (reorder/hide widgets) — that idea is explicitly
rejected for this phase.

## Competitive research summary

A research pass (tutoring-specific: TutorCruncher, Teachworks, My Music Staff, TutorBird;
general-SMB: Jobber, Housecall Pro) found several dashboard patterns TimeWiseHub's current fixed
home dashboard doesn't have. Of these, the user picked exactly one to act on this phase:

- **Overdue/unpaid invoices widget** (dollar total + visibility) — present in Teachworks, Jobber,
  and Housecall Pro. Strongest, most consistent finding across both tutoring-specific and
  general-SMB tools.

Explicitly deferred (found, not selected — no action this phase, no design below covers them):
revenue snapshot with period comparison, uncompleted-session tracking, lesson-package usage
indicator, unscheduled-work count, new-client growth panel, recent-activity feed. Also flagged but
not actioned: the dashboard's single merged "Today's agenda" feed is unusual compared to
competitors (who keep schedule/open-items/activity as separate cards) — noted for future
discussion, not a decision this phase.

## Pre-existing gap found during design (not created by this phase)

`invoices.status` (schema-019) has an `'overdue'` enum value, and multiple existing pages/queries
read `status IN ('sent', 'overdue')` (dashboard/invoices, clients/[id], clients/[id]/invoices,
clients/[id]/payments, the AI assistant's invoice-filter tool). **Nothing in the codebase ever
writes `status = 'overdue'`** — no cron, no on-read computation, no manual action. An invoice
issued and never paid stays at `status = 'sent'` forever, indistinguishable from one due tomorrow.

Decision (confirmed with user): don't fix this system-wide (that would mean a new cron plus
touching every existing page that reads invoice status — out of scope for "one dashboard widget").
Instead, compute "overdue" at read time wherever it's actually needed right now.

## Data logic

New shared helper, `src/lib/invoices.ts`:

```typescript
export function isOverdue(invoice: { status: string; due_date: string | null }): boolean {
  if (invoice.status !== 'sent' && invoice.status !== 'overdue') return false
  if (!invoice.due_date) return false
  return invoice.due_date < new Date().toISOString().slice(0, 10)
}
```

Used in exactly two places, so the definition can't drift:

1. **Dashboard query** (`src/app/dashboard/page.tsx`): fetch invoices scoped the same way the
   existing `/dashboard/invoices` page already scopes visibility — `org_id.eq.<org> OR
   owner_id.eq.<user>` when the user belongs to an org, else `owner_id.eq.<user>` for a solo Pro
   (this is *not* manager-gated — any org member already sees all org invoices today, per the
   existing invoices page; the new card matches that, doesn't restrict it further). Filter with
   `isOverdue`, sum `subtotal` for the card's dollar value. Currency: same shortcut the existing
   invoices page already uses (`find(...)?.currency ?? 'AUD'`, i.e. assume one currency per scope).
2. **`/dashboard/invoices` page**: read a `?overdue=1` search param; when present, filter the
   already-fetched `invoices` array with `isOverdue` before passing to `InvoiceTable`. No change to
   `InvoiceTable` itself.

No schema change. No new table. No cron.

## Widget UI

`src/components/dashboard/DashboardMetrics.tsx` gains a 5th `MetricCard`:

- **Value:** dollar total (e.g. `$540`), not a count — the research found the dollar amount owed
  is the headline figure competitors lead with.
- **Label:** "Overdue invoices"
- **Icon/color:** a red/warning tone, distinct from the existing cyan/violet/emerald/amber cards —
  reads as "needs attention" rather than a neutral count.
- **Click-through:** `/dashboard/invoices?overdue=1`
- **Zero-state:** always rendered, including `$0` when nothing is overdue — consistent with the
  other four cards, which never hide themselves based on count. No "hide if empty" logic (would be
  a step toward the personalization mechanism explicitly ruled out this phase).
- **Layout:** grid changes from `grid-cols-2 lg:grid-cols-4` to `grid-cols-2 lg:grid-cols-5` so all
  five cards sit in one row on desktop; mobile keeps `grid-cols-2` (5 wraps 2+2+1, an already-common
  uneven-last-row pattern, not new to this codebase).

`src/app/dashboard/page.tsx` passes the new `overdueTotal`/`overdueCurrency` values into
`DashboardMetrics`, computed alongside the existing metric queries in the same
`Promise.all` stage.

## Non-goals (explicit)

- No per-user dashboard customization (reorder, hide/show widgets) — ruled out at the start of
  brainstorming for this phase.
- No fix to the underlying dead `status = 'overdue'` write-path — deliberately deferred, see above.
- No action on the other research findings (revenue snapshot, uncompleted sessions, lesson-package
  usage, unscheduled-work count, new-client growth, activity feed, merged-agenda-feed question) —
  found and recorded, not designed or built this phase.

## Verification

- `pnpm run build` must pass clean (this project's only gate — no test runner).
- Manual smoke: an org with at least one invoice past its `due_date` and still `status = 'sent'`
  shows a non-zero Overdue Invoices card; clicking it lands on `/dashboard/invoices?overdue=1`
  showing only that invoice; an org/solo-pro with nothing overdue shows `$0` and the same
  click-through shows an empty (but not broken) filtered list. Confirm a solo Pro user (no org)
  only ever sees their own invoices in the total, matching the existing invoices page's own scoping.
