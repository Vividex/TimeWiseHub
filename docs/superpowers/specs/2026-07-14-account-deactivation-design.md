# Account Deactivation — Design

## Goal
Let an org owner (or a solo Pro user with no org) fully close their
TimeWiseHub account: login is blocked for everyone in the org, but no data
is deleted. Captures why they're leaving, and emails the operator (you)
immediately, since at low customer counts losing even one matters.

## Explicitly out of scope (raised and declined during brainstorming)
- **A team member leaving an org on their own** — a smaller, different
  feature (an employee/manager removing just their own membership). Not
  built here.
- **Email/notification preferences (unsubscribe from specific emails)** —
  unrelated to account closure, not built here.
- **Hard delete / permanent data erasure** — deliberately not built. This is
  a soft-deactivate: data is retained indefinitely (no scheduled auto-purge)
  so a business's financial records (invoices, expenses) aren't destroyed —
  Australian businesses generally need to retain these for ~5 years (ATO).
  A genuine "delete everything" request is a separate future decision, not
  a side effect of this feature.
- **Auto-cancelling an active Stripe subscription** — deliberately not
  built. Deactivation is blocked while a paid plan is active; the owner
  must cancel via the existing Stripe Billing Portal first. This is a
  considered choice, not a shortcut: requiring a distinct cancellation step
  is a legitimate anti-churn pattern used by mature SaaS products, not
  something only small/unsophisticated products do.
- **Notifying on Stripe subscription cancellation itself** (a separate,
  earlier churn signal via the `customer.subscription.deleted` webhook,
  which already exists) — a good future idea, explicitly not this phase.

## Data model

**Fast-path flag** — checked on every dashboard/settings page load, so it
stays a plain column on rows already being fetched (no extra query):
- `organisations.deactivated_at timestamptz` (nullable)
- `profiles.deactivated_at timestamptz` (nullable, for solo Pro users with
  no org)

**New table `account_deactivations`** — the exit-data record, written once
per deactivation event (and updated once on reactivation), kept as its own
table (not just overwritten columns) so history survives multiple
deactivate/reactivate cycles over an account's lifetime:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `org_id` | uuid, nullable | references `organisations` |
| `user_id` | uuid, nullable | references `auth.users` — set for solo Pro (no org) |
| `deactivated_by` | uuid not null | references `auth.users` — always the owner |
| `reason` | text not null | one of: `too_expensive`, `missing_features`, `switched_tools`, `no_longer_needed`, `other` |
| `feedback` | text, nullable | optional free text |
| `deactivated_at` | timestamptz not null default now() | |
| `reactivated_at` | timestamptz, nullable | set when/if reactivated |

Exactly one of `org_id`/`user_id` is set, matching the existing dual-ownership
pattern already used elsewhere in this schema (e.g. `invoice_letterhead` on
both `organisations` and `profiles`).

## Deactivation flow

1. **Settings → Danger Zone** (visible only to: org owner, or a solo Pro
   user with no org — nobody else, not even org admins).
2. If the account is on a paid plan (`isPaidPlan(subscription)`), the
   "Deactivate account" action is disabled with a message pointing to
   Billing → Manage subscription to cancel first.
3. Clicking "Deactivate account" opens a form: **Reason** (required
   dropdown, the five values above) and **Feedback** (optional free text) —
   collected before the confirmation step.
4. **Type-to-confirm**: a modal asks them to type the exact organisation
   name (or their own full name for solo Pro) before the final "Deactivate"
   button enables.
5. On confirm, in one server action:
   - Set `deactivated_at = now()` on the `organisations` row (or `profiles`
     row for solo Pro).
   - Insert the `account_deactivations` row (`deactivated_by` = current
     user).
   - Send an email to the operator notification address (new env var
     `OPERATOR_NOTIFICATION_EMAIL`, not hardcoded) via the existing
     `sendEmail()`/Resend helper — no new dependency, no new cost. Contents:
     org/account name, reason, feedback, and how long they'd been a
     customer (derived from `organisations.created_at` / the user's
     `profiles.created_at`, not stored separately).
   - Sign the user out.
6. Redirect to `/account-deactivated` (see below).

## Access blocking

The existing `setup_completed` gate in `src/app/dashboard/layout.tsx`
(`if (org && !org.setup_completed) redirect('/setup')`, and the equivalent
solo-Pro branch) is the precedent to extend — but with one real difference
worth flagging: that existing check only runs for `owner`/`admin` roles.
**The deactivation check must run for every role** (owner, admin, manager,
employee) — the whole point is that deactivating locks out the entire org,
not just its owner/admin. Add a `deactivated_at` check unconditionally
(before the role-scoped `setup_completed` block, using the org/profile row
already being fetched), redirecting to `/account-deactivated`.

**`/settings` needs its own copy of this check.** It's a separate top-level
route (`src/app/settings/page.tsx`), not nested under
`src/app/dashboard/layout.tsx` — so the dashboard gate alone would leave
Settings (where the Danger Zone itself lives) reachable by a deactivated
org. Both places need the check.

**This is a page-level gate, not an RLS-level one** — same limitation the
existing `setup_completed` gate already has. A deactivated org's data isn't
additionally locked at the database layer; `deactivated_at` isn't checked by
`clients`/`invoices`/etc.'s own RLS policies, only by the page redirects
above. Retrofitting every table's RLS to also check org-deactivation status
would be a much larger, riskier change (touching RLS across the whole app)
for a marginal gain — the actual goal here is "locked out of the product,"
not "cryptographically impossible to query your own data via the raw API,"
and this matches the existing precedent rather than introducing a new,
weaker guarantee. Documented here so it's a deliberate boundary, not a
silent gap.

## Reactivation

`/account-deactivated` — a plain page, no sidebar:
- Shows when the account was deactivated.
- **If the viewer is the account owner** (or the solo Pro user themself):
  a "Reactivate account" button. Clears `deactivated_at`, sets
  `reactivated_at` on the matching `account_deactivations` row, redirects to
  `/dashboard`.
- **If the viewer is any other org member**: an informational message only
  ("This account has been deactivated — contact the account owner"), no
  reactivate action. Reactivation stays owner-only, symmetric with
  deactivation itself — a team member shouldn't be able to unilaterally
  reverse a decision only the owner is meant to make.

## Manual verification (no test runner in this project)
1. As a non-owner org member, confirm no "Deactivate account" option is
   visible in Settings.
2. As the owner, on a paid plan, confirm deactivation is blocked with a
   link to Billing.
3. Downgrade to free, deactivate as the owner: confirm the type-to-confirm
   gate actually blocks submission until the exact name is typed, confirm
   the `account_deactivations` row is written correctly, confirm the
   notification email arrives, confirm you're signed out and redirected.
4. As a different member of that same (now-deactivated) org, confirm login
   redirects to `/account-deactivated` with the informational (no-button)
   view, and that `/settings` and `/dashboard` both redirect there too, not
   just one of them.
5. As the owner, reactivate from `/account-deactivated`; confirm
   `/dashboard` is reachable again and all prior data (clients, invoices,
   vehicles, etc.) is untouched.
