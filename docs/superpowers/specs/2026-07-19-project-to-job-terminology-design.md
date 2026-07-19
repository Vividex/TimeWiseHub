# Project → Job Terminology Design

## Goal
Give construction/trades/cleaning workspace profiles the word "Job" (and Real Estate the word
"Listing") everywhere the core UI currently hardcodes the literal word "Project" — nav, page
titles, buttons, back-links, breadcrumbs, tiles, panels, and generated documents — without
touching URLs, database/component/variable names, the AI assistant's own phrasing, notification
emails, the help page, or public marketing pages.

## Background
`projects.site_id` and the terminology-swap pattern for `client`/`session`/`program` already
exist and are wired through 14 files today (e.g. `SidebarNav` picks `clientLabel.plural` vs
`programLabel.plural` by matching the nav item's `href`). A fourth terminology key, `project`,
has existed in the `TerminologyKey` type and `WORKSPACE_PROFILES` registry since the Workspace
Profile Engine shipped — Tutoring already maps it to "Learning Plan" and Personal Training to
"Package" — but it is consumed in exactly one file across the whole codebase
(`src/lib/tutorial/steps/generic.ts`). Every other page hardcodes the literal word "Project."
This phase wires it up properly, which also activates the already-configured (but silently dead)
values for Tutoring and Personal Training as a side effect, and adds new values for four more
profiles.

## Terminology values
| Profile | `terminology.project` |
|---|---|
| `builder_construction` | Job / Jobs |
| `trades_field_services` | Job / Jobs |
| `cleaning_maintenance` | Job / Jobs |
| `real_estate` | Listing / Listings |
| `tutoring` | Learning Plan / Learning Plans *(already set, currently dead — activated by this phase)* |
| `personal_training` | Package / Packages *(already set, currently dead — activated by this phase)* |
| `generic`, `consulting`, `healthcare`, `creative_agencies` | Project / Projects *(unchanged)* |

## Mechanism
No new abstraction. Extend the exact pattern already used for `client`/`session`/`program`:
each server page that needs the label calls `getWorkspaceProfileForUser(supabase, user.id)`,
pulls `terminology.project` off the result (a `{ singular, plural }` pair), and passes it down as
a prop to whichever client component renders the word — same shape `SidebarNav` already takes for
`clientLabel`/`programLabel`. This codebase deliberately avoids lib-layer wrapper/context
abstractions (confirmed during the Client Sites phase — there is no such pattern anywhere), so a
shared React Context was considered and rejected in favour of staying consistent with precedent,
even though this phase's fan-out (~25-30 files) is larger than the 14-file precedent.

Two things never change regardless of which word is showing:
- **URLs** — `/dashboard/projects` stays `/dashboard/projects` even when it renders "Jobs," same
  as `/dashboard/clients` never becomes `/dashboard/members` for Personal Training today.
- **Database/component/variable names** — the `projects` table, `ProjectForm.tsx`,
  `project_id` columns, etc. all stay exactly as they are. Only the literal text a user reads
  changes.

## Scope

### In scope (core UI)
- **Registry** — add `Job`/`Jobs` and `Listing`/`Listings` to the four profiles in
  `src/lib/workspace-profiles/registry.ts`.
- **Nav & shell** — `SidebarNav.tsx` gains a `projectLabel` prop (same pattern as
  `clientLabel`/`programLabel`); `DashboardShell.tsx` and `dashboard/layout.tsx` thread it through.
- **Projects list & detail** — `dashboard/projects/page.tsx` (including its "Active projects"
  heading and empty-state copy), `dashboard/projects/[id]/page.tsx`,
  `clients/[id]/projects/page.tsx`, `clients/[id]/projects/[projectId]/page.tsx`,
  `ProjectForm.tsx` (including its hardcoded "Free plan is limited to N active projects" copy —
  client-side text, not the API's fallback string, see below), `ProjectCard.tsx`,
  `ProjectsGrid.tsx`, `NewClientProjectButton.tsx`, `DeleteProjectButton.tsx`.
- **Project detail sub-panels** — `ProjectSwmsPanel.tsx`, `ProjectCrewPanel.tsx`,
  `ProjectExpensesPanel.tsx`, `DocumentPanel.tsx`, `ProjectTaskGrid.tsx`, and the generated
  SWMS/JSA PDF (`SwmsDocumentPdf.tsx` prints "Project" as a field label on a real document
  someone reads/files — swapped too).
- **Cross-feature references** — `TimerWidget.tsx`, `CalendarView.tsx`, `DayPanel.tsx`,
  `VideoCalendar.tsx`, `ScheduleCallDialog.tsx`, `VideoPageClient.tsx`,
  `NewInvoiceForm.tsx`'s project picker, `TasksHub.tsx`, and the AI assistant widget's clickable
  suggestion chip "Show active projects" in `AssistantWidget.tsx` (a UI button label, not the
  assistant's own reasoning/system-prompt text, so it's in scope even though the assistant's
  phrasing generally isn't).
- **Dashboard & insights** — the "Active projects" dashboard tile (`DashboardMetrics.tsx`),
  `insights/OverviewPanel.tsx`, `ProjectHealthTable.tsx`, `ProjectBreakdown.tsx`,
  `ReportsClient.tsx`.
- **Client detail page** — the Projects tab/tile on `clients/[id]/page.tsx`.
- **In-app billing page** — `dashboard/billing/page.tsx`'s "Up to N active projects" plan-limit
  line. This is in-app text read by an already-onboarded user with a real profile, distinct from
  the public pricing page, which stays generic.

### Explicitly out of scope this phase
- The AI assistant's own reasoning/system-prompt text (`src/lib/assistant/tools.ts`,
  `src/app/api/assistant/route.ts`) and notification emails (`src/lib/email-notifications.ts`) —
  both would need new plumbing (neither currently resolves a workspace profile), deferred per your
  "core UI only" choice.
- The help/docs page (`src/app/help/page.tsx`).
- Public marketing/landing pages (`FeatureCarousel.tsx`, `PricingSection.tsx`, etc.) — not tied to
  a logged-in org's profile.
- Internal API routes with no rendered user-facing text (`api/projects/route.ts`,
  `api/project-expenses/route.ts`, `api/video/schedule/[callId]/route.ts`). One nuance:
  `api/projects/route.ts`'s 402 response body (`Free plan is limited to ${limit} active
  projects`) is technically user-facing, but `ProjectForm.tsx` never renders that server string —
  it already has its own hardcoded client-side copy for the same condition (checked before
  submission), which *is* in scope above. The server string is a rarely-hit defense-in-depth
  fallback and stays generic.

## Testing
No test runner in this project — the gate is `pnpm run build` (tsc + eslint) after each batch of
changes. Beyond that, a manual smoke pass: log in as a Builder & Construction (or Trades) org and
click through Projects list → detail → creation → SWMS panel → Dashboard tile → Insights,
confirming every one says "Job"/"Jobs"; check a Real Estate org shows "Listing"/"Listings" in the
same places; check an unaffected profile (Consulting, or Tutoring which now shows "Learning Plan")
to confirm nothing bled over. Given the size, a final `grep -ri "project"` sweep across the
in-scope files after implementation is a cheap safety net for anything missed — same self-review
habit used on prior large phases in this project.
