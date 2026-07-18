# Site Sign-In (SWMS/JSA Access Gate) — Design

## Goal

Let a worker sign into a job site for the day and, by doing so, get access to that site's
relevant SWMS/JSA safety documents — without needing a manager to have pre-assigned them as
Project Crew first. When a new SWMS/JSA is generated, everyone who should sign it (the formally
assigned crew, plus anyone who's signed into the site that day) gets notified and sees it on their
Dashboard under "Today."

Raised directly by the user as part of a batch of feedback after live-testing the JSA feature:
"all workers should also need a site sign in area, anyone who signs into a site then has access to
relevant Jsa's and swms... necessary workers should receive a notification to sign (they should
also appear on the main dashboard under today)."

**Explicitly scoped to access, not attendance.** This is not a clock-in/payroll feature — it
doesn't touch time entries, timesheets, or pay. It's a lightweight daily access grant, decided
directly with the user before designing further.

## Architecture

**New link: `projects.site_id`.** Nullable FK to `client_sites`. `client_sites` today is
client-scoped (a client can have several projects; a site has no project link at all), so there's
currently no way to resolve "which project's SWMS/JSA applies at this site" — this column is that
resolution. Nullable and optional: projects with no site, or workspace profiles that don't use
multi-site, are completely unaffected. A site can have more than one active project pointed at it
(e.g. multiple trade contractors on the same job) — sign-in surfaces all of them, not just one.

**New table: `site_sign_ins`.**

```sql
create table public.site_sign_ins (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.client_sites(id),
  user_id uuid not null references auth.users,
  sign_in_date date not null default current_date,
  signed_in_at timestamptz not null default now(),
  unique (site_id, user_id, sign_in_date)
);
```

Sign-in is fresh each day, not persistent — the `sign_in_date` column plus the unique constraint
makes "have I signed in today" a single indexed lookup, and re-signing-in the same day is a no-op
rather than a duplicate row. This resets daily by design, matching the "Today" framing rather than
requiring an explicit sign-out.

## Access model

Site sign-in **supplements** the existing Project Crew (`project_members`) access model, it
doesn't replace it. A worker gets SWMS/JSA access if they're *either* an assigned Project Crew
member *or* have signed into the project's site today. This covers the case the current model
misses: a casual or one-off worker nobody thought to formally assign.

Three existing RLS policies each gain one additional `OR` clause:

```sql
exists (
  select 1 from public.site_sign_ins ssi
  where ssi.site_id = p.site_id
    and ssi.user_id = auth.uid()
    and ssi.sign_in_date = current_date
)
```

- `project_swms_documents` SELECT policy — can view the document
- `project_swms_acknowledgments` INSERT policy — can actually acknowledge it, not just view
- `project-swms` storage SELECT policy — "View" (and the live-signed PDF route) works for them too

The clause above is the shape for the `project_swms_documents`-level check, where `p` is already
joined. The other two policies reach `projects` through one extra hop (acknowledgments →
`swms_document_id` → `project_swms_documents.project_id` → `projects`; storage objects → path's
first segment as `project_id` → `projects`) — same semantic condition, different join depth per
policy. The implementation plan writes out each policy's exact SQL rather than pasting one snippet
three times.

This clause only ever queries `site_sign_ins`, keyed on `p.site_id` (from the already-joined
`projects p` row) — it doesn't reference `project_members` or `project_swms_documents`
recursively, so it can't reintroduce the `project_members` infinite-recursion bug fixed earlier
this session (schema-107). `site_sign_ins` itself needs no recursive-feeling policies: a user can
insert/view their own rows; org owner/admin/manager can view all sign-ins for their org's sites
(consistent with the view-access pattern used everywhere else in this codebase, even though no UI
consumes that visibility yet).

App-side: the project detail page's `isCrewMember` boolean (already passed into
`ProjectSwmsPanel` and already gating the acknowledge button) becomes
`isCrewMember || hasSignedInToday`.

## Sign-in widget (Dashboard)

New card on the Dashboard home page. Fetches the org's active (non-archived) `client_sites` and
shows the **3 most recently relevant** — ordered by the worker's own most-recent sign-in history,
falling back to newest-created site for a worker with no sign-in history yet — with a "Show more
sites" expansion revealing the rest. Every active org site is available to sign into (not
restricted to sites tied to projects the worker's already assigned to) — a worker can sign into
anywhere they're actually standing, which is the point of supplementing Project Crew rather than
requiring pre-assignment.

Each site shows a "Sign In" button; a site already signed into today shows "✓ Signed in" instead —
no confirmation dialog needed, the daily-unique constraint makes it a safe one-tap idempotent
action.

## Dashboard "Today" item

New item alongside the existing `certsDue`/`incidentReportsDue`-style entries in
`DashboardUpcoming`: `swmsAwaitingSignature` — active projects the worker has access to (Project
Crew *or* signed in today) with an authored SWMS/JSA they haven't yet acknowledged. Same
fetch-shape as the existing items: one more parallel query in the dashboard's `Promise.all` stage,
mapped to a typed array, passed as a new prop.

This is the *reliable* channel — it doesn't depend on push permission being granted.

## Notification

New `notifySwmsAwaitingSignature(documentId)`, same shape as the existing `notifyTaskAssigned`
(`src/lib/task-notifications.ts` → `sendPushToUser`). Called once, right after a new
`project_swms_documents` row is inserted in the SWMS/JSA POST route — **not** on an in-place edit
before acknowledgment (matches the existing "crew acknowledges the new version fresh" supersede
behavior; nobody's re-notified for a typo fix that never touched anyone's acknowledgment).

Recipients: `project_members` for that project, unioned with `site_sign_ins` rows for that
project's site dated today (deduplicated by user id). Each gets a push via the existing
`sendPushToUser(userId, { title, body, url, tag })` — same delivery path already proven for task
assignment. Push delivery isn't guaranteed (depends on the browser permission grant, and the
existing `PushAutoPrompt` explicitly no-ops on Tauri desktop) — the Dashboard "Today" item above is
the fallback every recipient sees regardless of push status.

## Explicitly out of scope this phase

- Any attendance, timesheet, or payroll integration — this is access-gating only
- QR-code check-in — the user's stated intent is to build this as a v2 on top of the same
  `site_sign_ins` table (e.g. an optional `method: 'manual' | 'qr'` column later); v1 is the
  Dashboard widget only
- An admin-facing "who's on site right now" viewer — the RLS groundwork supports it (managers can
  already view all their org's sign-ins), but no UI is built for it this phase
- Sign-out / ending a sign-in early — sign-in resets automatically at the next calendar day
- Any change to how uploaded (non-authored) SWMS documents work — the access-model changes apply
  identically regardless of source, no special-casing needed

## Verification

`pnpm run build` after every implementation task, per house convention. Manual smoke (deferred to
the user): sign into a site as a worker with no Project Crew assignment on its project, confirm
the project's SWMS/JSA become visible and acknowledgeable; confirm access disappears the next day
without a fresh sign-in; generate a new JSA and confirm both the assigned crew and anyone signed
in that day appear on their Dashboard "Today" and (if push-enabled) receive a notification;
confirm a worker who never signs in and isn't Project Crew still can't see the project's SWMS/JSA.
