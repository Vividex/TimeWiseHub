# MEMORY

## Repo Working Notes
- TimeWiseHub is a Next.js App Router app using TypeScript, Tailwind v4, Supabase, and pnpm.
- Verification gate is `pnpm run build`; there is no test runner.
- On this Windows host, sandboxed subprocesses can fail with `CreateProcessAsUserW failed: 5`; use approved/escalated read-only commands when needed.
- Do not add npm dependencies or touch billing, Stripe, or auth code unless the current task explicitly requires it.
- Handover-specific standing decisions live in `.handover/decisions.md`; do not edit `.handover/spec.md` or tick checklist boxes during handover turns.

## Recent Work
- Pushed commit `0a33b9f` to `origin/master`: `fix: improve mobile client project layouts`.
- Pushed commit `75a6643` to `origin/master`: `fix: repair invoice print page`.
- Pushed commit `fffa90e` to `origin/master`: `feat: add invoice letterhead settings`.
- Pushed commit `0c377ae` to `origin/master`: `feat: add invoice bank payment details`.
- Mobile tile layout was adjusted in `src/components/ui/Tile.tsx` so task/session titles do not overlap status badges.
- Selected client project header now wraps project actions inside the card, and delete confirmation wraps on mobile.
- Client project count now uses `projects.status = active`, matching the visible client projects page.
- Client financial details now include a `Create invoice` action.
- Invoice creation supports `?clientId=...` and preselects that client in `NewInvoiceForm`.
- Invoice print/PDF route was fixed by moving browser print controls into `src/components/invoices/InvoicePrintControls.tsx` and bypassing the dashboard shell on print routes.
- Invoice letterheads use `src/lib/invoice-letterhead.ts`: Free defaults to TimeWiseHub, Pro can use a personal letterhead, Team uses organisation letterhead or organisation name.
- Invoice payment details use `src/lib/invoice-payment-details.ts`: account name, BSB, account number, PayID, and optional instructions.
- Invoice detail, print/PDF, and email should all include saved bank/PayID details.
- Stripe is optional for invoice sending. If Stripe is unavailable, invoices should still be marked sent and emailed with bank/PayID details.
- Session checklist add-item UI was restyled in `src/components/clients/SessionDetailClient.tsx` so it remains visible in mobile/dark views.

## Pending Local Work
- Current uncommitted work after `0c377ae` adds direct invoice email sending and expands bank/PayID handling in settings, invoice detail, print/PDF, and email.
- New migration in local changes: `supabase/schema-041-invoice-payment-details.sql`. Apply it in Supabase before using payment-detail settings.
- Previously pushed but still migration-dependent: `supabase/schema-040-invoice-letterheads.sql`.

## Supabase Schema Notes
- If org settings save fails with `Could not find the 'invoice_letterhead' column of 'organisations' in the schema cache`, the production database is missing the invoice settings migrations.
- Required manual SQL:
```sql
alter table public.profiles
  add column if not exists invoice_letterhead text;

alter table public.organisations
  add column if not exists invoice_letterhead text;

alter table public.profiles
  add column if not exists invoice_payment_details jsonb not null default '{}'::jsonb;

alter table public.organisations
  add column if not exists invoice_payment_details jsonb not null default '{}'::jsonb;
```
- After applying, refresh/retry the app; Supabase schema cache can take a short moment to notice new columns.

## Untracked Files Observed
- The working tree has had unrelated untracked files such as `.playwright-mcp/`, image assets, and a dark-mode finance plan doc. They were not included in recent commits.
