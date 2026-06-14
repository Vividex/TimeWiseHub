# Roster-Driven Timesheets + Recurring Roster — Design Spec
_2026-06-14_

## Goal

For Business-plan orgs, make the **published roster** the authoritative source of
weekly pay hours. Timesheets auto-generate from roster shifts at week-end with no
employee action required. Admins get a recurring-roster template so fixed schedules
only need to be entered once. The week boundary (which day "week start" falls on)
is org-configurable so businesses with Thu–Wed or Sat–Fri pay cycles are supported.

---

## Scope

**In scope:**
- `roster_shift_templates` table — recurring shift pattern per org member
- "Set as recurring" button in the roster grid
- `organisations.pay_week_start_day` — configurable week boundary
- Drop the Monday-only constraint on `timesheets.week_start`
- Two nightly pg_cron jobs: (1) generate next week's shifts from templates, (2) auto-submit timesheets from roster
- `POST /api/roster/generate-from-template` API route
- `POST /api/timesheets/generate-weekly` API route
- Update `derivePayPeriod()` to respect `pay_week_start_day`
- Update roster grid to anchor weeks to `pay_week_start_day`
- Update `getMondayDateStr()` → `getWeekStartStr()` in the Time page
- Hide the employee "Submit for approval" button for Business-plan org members
- Add "Pay week starts on" dropdown to org settings (`OrgBillingSettingsForm`)

**Out of scope:**
- Per-employee timezone handling for cron cutoff (UTC midnight cutoff is close enough for AU businesses; precision TZ handling is future work)
- Shift-swapping / employee-requested changes
- Overtime/penalty rate calculations
- Automatic leave-hours deduction from roster totals (leave pay remains a separate HR concern)

---

## Locked decisions

- **Roster = source of truth.** No employee submit step for Business orgs.
- **One-off shifts never touch the template.** "Set as recurring" reads only the
  shifts present in that week's grid at click time; any extra manually-added shifts
  that week are included only if they're in the grid when the button is clicked.
  Future one-off additions do not retroactively update the template.
- **Cron runs nightly (00:00 UTC).** Each run self-selects orgs whose week boundary
  falls on that UTC date. Both jobs (template generation + timesheet auto-submit)
  run nightly.
- **Auto-submit skips approved timesheets.** If a timesheet already has
  `status = 'approved'`, the cron does not overwrite it.
- **Members with no published shifts that week get no timesheet generated** — they
  are not penalised; admins can create a zero-hour timesheet manually if needed.
- **Recurring shifts generate as `published = true`** — employees can see their
  schedule immediately without admin needing to publish each week.
- **Authorization on API routes:** same `isAuthorized()` pattern used by
  `notifications/daily` — `CRON_SECRET` header; unauthenticated only in local dev.

---

## Data model

### schema-050 — `roster_shift_templates`

```sql
create table public.roster_shift_templates (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organisations on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  day_of_week  smallint not null check (day_of_week between 0 and 6), -- 0=Sun,1=Mon…6=Sat (JS getUTCDay())
  start_time   time not null,
  end_time     time not null,
  notes        text,
  created_at   timestamptz not null default now(),
  unique (org_id, user_id, day_of_week)
);

alter table public.roster_shift_templates enable row level security;

-- Employees can read their own template entries (so they know their recurring schedule)
create policy "employees read own templates"
  on public.roster_shift_templates for select
  using (user_id = auth.uid());

-- Managers read all org templates
create policy "managers read org templates"
  on public.roster_shift_templates for select
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

-- Owner/admin manage templates
create policy "admins manage templates"
  on public.roster_shift_templates for all
  using (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
  with check (
    org_id in (
      select org_id from public.organisation_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create index roster_templates_org on public.roster_shift_templates (org_id, user_id);
```

### schema-051 — `pay_week_start_day` + drop timesheets constraint

```sql
-- Add configurable week-start day to organisations
-- 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat. Default 1 (Monday).
alter table public.organisations
  add column pay_week_start_day smallint not null default 1
    check (pay_week_start_day between 0 and 6);

-- Drop the Monday-only constraint on timesheets.
-- Existing rows are all Mondays so no rows are invalidated.
alter table public.timesheets
  drop constraint if exists timesheets_week_start_check;
```

> **Note on constraint name:** the constraint was created inline in schema-020 as
> `check (extract(isodow from week_start) = 1)`. PostgreSQL auto-names inline
> constraints `<table>_<column>_check`; the full name is `timesheets_week_start_check`.
> Verify with `\d timesheets` before applying; adjust name if needed.

### schema-052 — nightly cron jobs

```sql
-- Job 1: generate next week's shifts from templates (runs at 00:00 UTC nightly)
-- Self-selects orgs whose week STARTS tomorrow.
select cron.schedule(
  'roster-template-generate-nightly',
  '0 0 * * *',
  $$
  select net.http_post(
    url     := 'https://timewisehub.vercel.app/api/roster/generate-from-template',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body    := '{}'::jsonb
  )
  $$
);

-- Job 2: auto-submit timesheets from roster (runs at 00:05 UTC nightly)
-- Self-selects orgs whose week ENDED yesterday.
select cron.schedule(
  'roster-timesheet-generate-nightly',
  '5 0 * * *',
  $$
  select net.http_post(
    url     := 'https://timewisehub.vercel.app/api/timesheets/generate-weekly',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body    := '{}'::jsonb
  )
  $$
);
```

> **`app.cron_secret`:** set via `alter system set app.cron_secret = '...'` or as a
> Supabase secret, then `select pg_reload_conf()`. Must match `CRON_SECRET` env var
> on Vercel. Same pattern as cert-expiry-notify in schema-049.

---

## API routes

### `GET /api/roster/generate-from-template`

Called by cron job 1 at 00:00 UTC. Determines which orgs have their week starting
tomorrow (UTC), then for each org inserts the upcoming week's shifts from templates.

**Logic:**
1. `isAuthorized(req)` check (same helper as `notifications/daily`).
2. `tomorrow = today + 1 day` (UTC).
3. `tomorrowDow = tomorrow.getUTCDay()` (0=Sun … 6=Sat).
4. Fetch all Business-plan orgs where `pay_week_start_day = tomorrowDow`.
5. For each such org, fetch `roster_shift_templates` rows.
6. For each template row, compute `date` as: tomorrow + `(template.day_of_week - tomorrowDow + 7) % 7` days.
   Both values are 0–6 (JS `getUTCDay()` convention) so no conversion needed.
   Example: org week starts Monday (tomorrowDow=1); a template row with day_of_week=3 (Wed) lands on tomorrow+2.
7. Before inserting each shift, check whether a non-deleted `roster_shifts` row already exists for
   that `(org_id, user_id, date, start_time)`. If it does, skip. There is no unique constraint on
   `roster_shifts` covering that combination, so bare `ON CONFLICT DO NOTHING` cannot be used.
8. Return `{ ok: true, orgsProcessed, shiftsCreated }`.

**Business-plan gate:** fetch `subscriptions` table (same as `isTeamPlan()` in
`src/lib/subscription.ts`) keyed by `org_id`. Only generate for active Business orgs.

### `GET /api/timesheets/generate-weekly`

Called by cron job 2 at 00:05 UTC. Determines which orgs had their week end
yesterday, then auto-submits timesheets.

**Logic:**
1. `isAuthorized(req)` check.
2. `yesterday = today - 1 day` (UTC).
3. `yesterdayDow = yesterday.getUTCDay()`.
4. Fetch all Business-plan orgs where
   `(pay_week_start_day + 6) % 7 = yesterdayDow`
   — i.e. the day before the week starts is the week end.
5. For each such org, compute `weekStart = yesterday - 6 days` (the Monday-equivalent
   for that org's week).
6. Fetch all published, non-deleted `roster_shifts` in `[weekStart, yesterday]`
   grouped by `user_id`.
7. For each user with shifts: `rosterSeconds = sum of (end_time - start_time)` in seconds.
8. `UPSERT timesheets (user_id, org_id, week_start = weekStart)`
   - `total_seconds = rosterSeconds`
   - `status = 'submitted'`
   - Skip (do not upsert) if existing row has `status = 'approved'`.
9. Return `{ ok: true, orgsProcessed, timesheetsCreated, timesheetsSkipped }`.

> **HTTP method note:** use `GET` (not `POST`) to match the pattern of
> `notifications/daily/route.ts` which also uses `GET` for its cron-called route.

---

## `derivePayPeriod()` update

`src/lib/payroll/period.ts` currently hard-codes Monday (`mondayOffset = (day + 6) % 7`).
Update signature to accept `weekStartDay: number` (0–6, default 1):

```ts
export function derivePayPeriod(
  cadence: PayCadence,
  anchorISO: string,
  weekStartDay = 1,   // 0=Sun…6=Sat, default Monday
): { periodStart: string; periodEnd: string }
```

For weekly/fortnightly, replace `mondayOffset` with:
```ts
const offset = (day - weekStartDay + 7) % 7
```

All existing callers pass only two args — the default of `1` keeps them identical
to current behaviour. The pay-runs route (`/api/pay-runs/route.ts`) should be
updated to fetch `organisations.pay_week_start_day` and pass it through.

---

## Roster grid changes

### Week anchor

`getWeekDates(anchor: Date)` in `RosterGrid.tsx` currently snaps to Monday:
```ts
monday.setDate(anchor.getDate() - ((day + 6) % 7))
```

Replace with a `weekStartDay` prop (0–6) passed from `RosterPage`:
```ts
const offset = (day - weekStartDay + 7) % 7
start.setDate(anchor.getDate() - offset)
```

`RosterPage` fetches `organisations.pay_week_start_day` (already fetching the org row
for membership) and passes it as a prop to `RosterGrid`.

### "Set as recurring" button

Owner/admin only. Appears in the grid header alongside "Publish week". On click:
1. Collects all shifts visible in the current week grid (published + draft; all members).
2. Calls `POST /api/roster/set-template` with `{ orgId, shifts: [{ userId, dayOfWeek, startTime, endTime, notes }] }`.
3. API route: deletes existing templates for that org, inserts new ones. Returns `{ ok: true, count }`.
4. Grid shows a brief "Recurring schedule saved" toast.

`dayOfWeek` for each shift = `new Date(shift.date + 'T12:00:00Z').getUTCDay()` (0=Sun, 1=Mon…6=Sat).
Use noon UTC to avoid date-boundary edge cases, same pattern as `getMondayDateStr`.

### Visual distinction

Template-generated shifts (created by the cron) are visually the same as manually
created shifts — no special styling needed. They are functionally identical; the
template is simply the pattern that produced them.

---

## Time page changes

`getMondayDateStr(timezone)` in `src/app/dashboard/time/page.tsx` is renamed
`getWeekStartStr(timezone, weekStartDay)` and generalises the Monday-snap:

```ts
function getWeekStartStr(timezone: string, weekStartDay: number): string {
  // same structure as getMondayDateStr but replace the diff calculation:
  const diff = ((day - weekStartDay) % 7 + 7) % 7   // 0=already on start day
  d.setUTCDate(d.getUTCDate() - (diff === 0 ? 0 : diff))
  ...
}
```

`TimePage` fetches `membership.org_id` (already does) and then fetches
`organisations.pay_week_start_day` to pass into `getWeekStartStr`. If the user is
not in an org, default `weekStartDay = 1` (Monday).

---

## `TimesheetSection` — hide submit for Business org members

Add a `rosterManaged: boolean` prop to `TimesheetSection`. When `true`:
- Hide the "Submit for approval" / "Resubmit" button entirely.
- Replace with a read-only note: "Your timesheet is submitted automatically from your roster."

`rosterManaged = isTeamPlan(subscription) && !!orgId` — i.e. any member of a
Business-plan org no longer self-submits.

---

## Org settings changes

`OrgBillingSettingsForm` gains a **"Pay week starts on"** field (select):

```
Sunday | Monday* | Tuesday | Wednesday | Thursday | Friday | Saturday
```
(* = current default)

Persisted to `organisations.pay_week_start_day`. The settings page already fetches
and passes through `pay_cadence` and `super_rate`; `pay_week_start_day` follows the
same pattern.

---

## New API route — `POST /api/roster/set-template`

Called by the "Set as recurring" button. Uses the session Supabase client (RLS
enforces owner/admin only — the `admins manage templates` policy).

1. Re-verify caller is owner/admin for the org (defence in depth).
2. Delete existing `roster_shift_templates` for `org_id`.
3. Insert new template rows from the submitted shifts array.
4. Return `{ ok: true, count }`.

---

## File list

### New files
- `supabase/schema-050-roster-templates.sql`
- `supabase/schema-051-pay-week-start.sql`
- `supabase/schema-052-roster-cron.sql`
- `src/app/api/roster/generate-from-template/route.ts`
- `src/app/api/roster/set-template/route.ts`
- `src/app/api/timesheets/generate-weekly/route.ts`

### Modified files
- `src/lib/payroll/period.ts` — add `weekStartDay` param
- `src/app/api/pay-runs/route.ts` — pass `pay_week_start_day` to `derivePayPeriod`
- `src/components/roster/RosterGrid.tsx` — `weekStartDay` prop, "Set as recurring" button
- `src/app/dashboard/roster/page.tsx` — fetch + pass `pay_week_start_day`
- `src/app/dashboard/time/page.tsx` — `getWeekStartStr`, fetch `pay_week_start_day`
- `src/components/time/TimesheetSection.tsx` — `rosterManaged` prop, hide submit
- `src/components/OrgBillingSettingsForm.tsx` — add `pay_week_start_day` field
- `src/app/settings/page.tsx` — fetch + pass `pay_week_start_day`

---

## Error handling

| Scenario | Behaviour |
|---|---|
| Org has no templates set | Cron job 1 finds no rows, inserts nothing, no error |
| Timesheet already `approved` | Cron job 2 skips that user for the week |
| Shift `end_time <= start_time` | Existing DB constraint prevents it; cron skips negative-duration rows |
| Cron called outside schedule (manual test) | Idempotent — `ON CONFLICT DO NOTHING` for shifts; upsert guard for timesheets |
| Non-Business org | Filtered out at step 4 of both cron routes; no timesheets generated |
| `app.cron_secret` not set | Both routes return 401; jobs are no-ops; same behaviour as `notifications/daily` |

---

## Verification

No test runner. Verify with:
1. `pnpm run build` after each checklist item — must pass clean.
2. **Constraint drop:** `select constraint_name from information_schema.table_constraints where table_name = 'timesheets'` — confirm `timesheets_week_start_check` is gone.
3. **Template RLS:** simulate employee role — can read own templates, cannot read others'.
4. **Manual smoke:** set Thu as week start; create a template; trigger both API routes manually; confirm shifts generate for the correct week dates; confirm timesheet appears as `submitted` for those users.
5. **Settings smoke:** change "Pay week starts on" to Thursday; confirm roster grid now shows Thu–Wed.
6. **Payroll smoke:** run a pay run after an auto-submitted timesheet is approved; confirm `total_seconds` matches roster hours.

---

## Resolved facts (verified against codebase)

1. `pay_cadence` and `super_rate` already on `organisations` (schema-030); `pay_week_start_day` is a third column in the same pattern.
2. `OrgBillingSettingsForm` already receives `initialPayCadence` and `initialSuperRate`; same prop pattern for `initialPayWeekStartDay`.
3. `isAuthorized()` helper pattern lives in `notifications/daily/route.ts` — copy verbatim into each new cron route.
4. `isTeamPlan(subscription)` and `getSubscription()` are in `src/lib/subscription.ts` — reuse to gate Business-plan orgs.
5. `timesheets` constraint name to drop: auto-named `timesheets_week_start_check` (confirm before applying).
6. Next migration numbers: 050, 051, 052.
7. `roster_shifts` has no unique constraint on `(org_id, user_id, date, start_time)`. The generate-from-template route uses a pre-insert select-based existence check (not `ON CONFLICT DO NOTHING`). See route logic step 7 above.
8. Settings page: `src/app/settings/page.tsx` (not `/dashboard/settings`). Already fetches `pay_cadence` and `super_rate` for `OrgBillingSettingsForm`.
