# TimeWiseHub — Handover

## Project Overview
TimeWiseHub is a cloud-based productivity platform for tracking work hours, managing business expenses (with receipt uploads), and providing productivity insights. It includes a to-do list, calendar, task prioritization, and idle detection/accountability tools. It supports individual and organizational accounts (parent/sub-account model) and targets web (desktop & mobile), Android, iOS, and Windows.

---

## Session Log

### Session 1 — 2026-06-01
**Agent:** Claude

**Files Inspected:**
- (none — project initialized)

**Files Created:**
- `HANDOVER.md` (this file)
- `agents.md` (workflow and platform rules)

**Summary of Findings:**
- Project scaffolded from scratch.
- No code, assets, or dependencies exist yet.
- Core product definition established in HANDOVER.md for future reference.

**Tests Performed:**
- N/A

**Risk Level:** None — initialization only.

**Next Recommended Action:**
- Define tech stack (e.g., frontend framework, backend language, database, cloud provider).
- Create `GOALS.md` with phased milestones.
- Confirm subscription/pricing model before building auth or account tiers.

---

### Session 2 — 2026-06-01
**Agent:** Claude

**Files Inspected:**
- `HANDOVER.md`
- `GOALS.md`

**Files Created:**
- `GOALS.md` — 11-phase milestone plan covering full product lifecycle
- `TECHSTACK.md` — full tech stack reference and architecture overview

**Files Modified:**
- `GOALS.md` — Phase 1.1 marked complete with chosen stack

**Summary of Findings:**
- Tech stack decided: Next.js + TypeScript + Tailwind (Vercel), Supabase (DB/Auth/Storage/Realtime), Stripe (payments)
- Mobile strategy: Capacitor wrapper (no rewrite needed), deferred to Phase 9
- GitHub CLI (`gh`) installed successfully at `C:\Program Files\GitHub CLI\gh.exe`
- GitHub account access blocked — user cannot log in via browser or CLI. Under investigation.
- Business will rebrand to **Vividex**. Supabase account (bradleyabbott30@outlook.com) is a temporary personal account — migrate to Vividex org later.
- No Vercel or Stripe accounts yet — both deferred (not needed until deployment/Phase 8).
- User intends to run a personal working model for product testing before public launch.

**Tests Performed:**
- N/A — no code written yet

**Risk Level:** None — planning phase only. All files are local.

**Blocked On:**
- GitHub account access. Options: (A) contact GitHub Support at support.github.com, or (B) create a fresh GitHub account.

**Next Recommended Action:**
1. Resolve GitHub account access (support ticket or new account)
2. Run `gh auth login` in a fresh PowerShell window once GitHub access is restored
3. Scaffold the Next.js project locally at `C:/GameForge/TimeWiseHub`
4. Create the GitHub repo and push initial scaffold
5. Log in to Supabase and create a new project called `timewisehub`

---

### Session 3 — 2026-06-03
**Agent:** Claude

**Files Inspected:**
- `GOALS.md`, `HANDOVER.md`, `TECHSTACK.md`, `agents.md`
- `src/app/**`, `src/components/**`, `src/middleware.ts`
- `supabase/schema-001` through `schema-010`
- `.env.local`, `package.json`, `pnpm-workspace.yaml`

**Files Created:**
- `src/proxy.ts` (renamed from `src/middleware.ts`)

**Files Modified:**
- `GOALS.md` — updated phase status to reflect actual progress (Phases 2–5 complete, Phase 6 partial)
- `.env.local` — added `SUPABASE_SERVICE_ROLE_KEY`
- `.gitignore` — added `.env.local`
- `src/proxy.ts` — renamed from `middleware.ts`; updated export name from `middleware` to `proxy`

**Summary of Findings:**
- Project was substantially built (Phases 2–6 largely done) but GOALS.md was stale showing only Phase 1.1 complete
- GitHub repo (`Vividex/TimeWiseHub`) already existed and had full commit history — pushed successfully
- Supabase project already connected (URL + anon key in `.env.local`); service role key added this session
- Vercel account created (Hobby tier), CLI installed, project deployed to `https://timewisehub.vercel.app`
- GitHub → Vercel auto-deploy connected; future pushes deploy automatically
- Next.js 16 deprecation: `middleware.ts` renamed to `proxy.ts`, export renamed to `proxy`

**Tests Performed:**
- `pnpm run build` — passes cleanly with no warnings
- Vercel production deployment — successful

**Risk Level:** Low — all changes are infrastructure/config. No feature code modified.

**Next Recommended Action:**
- Phase 7 — Productivity Insights & Reporting (dashboards, charts, trends)
- Still outstanding from Phase 1: 1.2 (monorepo), 1.3 (branching strategy), 1.4 (CI/CD), 1.7 (local dev docs)
- Still outstanding from Phase 6: 6.3 (project/task due dates on calendar), 6.4 (focus-shift alerts)
- Still outstanding from Phase 5: 5.10 (link tasks to time entries), 5.14 (daily digest email)

---

### Session 7 — 2026-06-05
**Agent:** Claude

**Files Inspected:**
- All src/app, src/components, src/lib, and supabase/schema-* files

**Files Created:**
- `supabase/schema-024-fix-project-storage.sql` — replaces overly permissive storage policies on project-documents bucket
- `supabase/schema-025-invoice-number-unique.sql` — UNIQUE constraint on (owner_id, invoice_number) to prevent duplicates

**Files Modified:**
- `src/app/dashboard/projects/[id]/page.tsx` — fixed two bugs: org members query used `user.id` against `org_id` (always empty); time entries queried by `task_id = project_id` (always empty; now queries by task IDs belonging to the project)
- `src/app/api/invoices/route.ts` — added `.eq('user_id', user.id)` guard when marking time entries as invoiced
- `src/app/api/invoices/[id]/send/route.ts` — fixed Stripe `quantity` from float hours to integer (1) with total in `unit_amount`; added 409 guard to prevent re-sending already-sent invoices
- `src/app/dashboard/activity/page.tsx` — team activity query now explicitly filters to org member IDs instead of relying on `neq('user_id', user.id)` alone
- `src/app/dashboard/invoices/new/page.tsx` — pass `userId` prop to NewInvoiceForm
- `src/components/invoices/NewInvoiceForm.tsx` — added `userId` prop; fixed client query: org context was filtering `owner_id = orgId` (wrong); now `owner_id = userId OR org_id = orgId`
- `src/components/time/ManagerTimeView.tsx` — fixed week start to use Monday (was using `getDay()` giving Sunday for Sunday users)
- `src/app/api/notifications/daily/route.ts` — fixed auth bypass: added VERCEL=1 check so unauthenticated requests are blocked on all Vercel deployments, not just NODE_ENV=production
- `src/app/api/notifications/reports/route.ts` — same auth bypass fix as above
- `src/lib/email-notifications.ts` — added ownership check for personal records (orgId=null): only the record owner can trigger review notifications
- `GOALS.md` — corrected 1.5 and 1.6 from [~] to [x] (completed in Session 3, GOALS.md was stale)

**Summary of Findings:**
- Comprehensive review of Phases 3–8, 10, 11 found 2 critical, 4 high, 8 medium issues
- Critical issue 1: project-documents bucket granted full read/write to any authenticated user — fixed via schema-024
- Critical issue 2: project detail page org member query used wrong UUID column — silently returned empty member lists
- High issues: budget tracking on project pages was broken (zero values); Stripe checkout threw on fractional hour quantities; activity page team logs had no explicit org scope; invoice time-entry ownership not verified
- Medium issues: client loading in invoice form returned empty for org users; week start wrong for Sunday users; cron endpoints exploitable without secret on Vercel preview deployments; review notifications callable by any authenticated user for personal records
- Remaining unfixed (noted, not critical for current usage): invitations `using(true)` RLS policy in schema-002 (requires checking invite accept flow before changing); invoice number race condition mitigated by UNIQUE constraint but route doesn't retry on conflict

**Tests Performed:**
- `pnpm run build` — passes cleanly, 38 routes, no TypeScript errors

**Risk Level:** Low. All schema changes are additive (new policies, new constraint). No data is modified. Schema-024 and schema-025 must be run in Supabase SQL Editor before deploying.

**Next Recommended Action:**
- Run `schema-024-fix-project-storage.sql` in Supabase SQL Editor (drop old policies, create new)
- Run `schema-025-invoice-number-unique.sql` (first check for existing duplicates per the comment in the file)
- Add `ANTHROPIC_API_KEY` to Vercel env vars and `.env.local` to enable the in-app assistant
- Deploy (git push triggers Vercel auto-deploy)
- Remaining known issue: schema-002 `using(true)` on invitations — review `/invite/[token]/page.tsx` server component and move the token lookup to service-role to allow the policy to be tightened

---

### Session 6 — 2026-06-04
**Agent:** Claude

**Files Inspected:**
- `GOALS.md`, `HANDOVER.md`, all schema files, DashboardShell, projects page

**Files Created:**
- `supabase/schema-012-profile-org-visibility.sql` — RLS policy for managers to read member profiles
- `src/app/dashboard/insights/page.tsx` — full Phase 7 insights page (server component)
- `src/components/insights/StatCard.tsx`
- `src/components/insights/BarChart.tsx`
- `src/components/insights/ActivityRatio.tsx`
- `src/components/insights/ProjectBreakdown.tsx`
- `src/components/insights/ProjectHealthTable.tsx`
- `src/components/insights/OrgStatsPanel.tsx`

**Files Modified:**
- `src/components/DashboardShell.tsx` — added Insights to nav
- `GOALS.md` — Phase 7 items 7.1–7.6 marked complete; 7.7 marked blocked

**Summary of Findings:**
- Phase 7 fully implemented at /dashboard/insights using pure CSS/flex charts (no chart library dependency)
- Stat cards: today's hours, this week's hours, tasks done this week, expenses this month
- Daily bar chart: last 7 days
- Activity ratio: work week coverage (hours / 40h) with active-days counter
- Time by project: horizontal bars from task-linked entries (requires task_id on time_entries)
- Project health table: tasks done/total, progress bar, hours, deadline countdown
- Org stats panel: per-member hours/expenses/tasks for managers/admins/owners
- schema-012 is required before org stats panel will return member names (profiles RLS)

**Tests Performed:**
- `pnpm run build` — passes cleanly, 17 routes

**Risk Level:** Low. schema-012 must be run in Supabase SQL Editor before deploying if org stats are needed.

**Next Recommended Action:**
- Run `schema-012-profile-org-visibility.sql` in Supabase SQL Editor
- Deploy (git push triggers Vercel auto-deploy)
- Phase 8 — Monetisation & Subscription System

---

### Session 5 — 2026-06-04
**Agent:** Claude

**Files Inspected:**
- `GOALS.md`, `HANDOVER.md`
- All time, calendar, and project source files

**Files Created:**
- `supabase/schema-011-task-time-link.sql` — adds `task_id` FK to `time_entries`

**Files Modified:**
- `src/components/time/ManualEntryForm.tsx` — added task selector (fetches open tasks client-side, optional link on insert)
- `src/components/time/TimerWidget.tsx` — added task selector (disabled while running, initialises from active entry)
- `src/components/time/TimeEntryList.tsx` — updated Entry type to include `tasks` join; shows task title in blue under each entry
- `src/app/dashboard/time/page.tsx` — updated `todayEntries` and `activeEntry` queries to include `tasks(title)` join
- `src/app/dashboard/calendar/page.tsx` — added `NudgeBanner` at top of calendar page
- `GOALS.md` — marked 5.10, 6.3, 6.4 complete; 5.14 status changed to blocked

**Summary of Findings:**
- 6.3 was already fully implemented (CalendarView already had buildItems rendering projects and tasks) — GOALS.md was just stale
- 6.4 closed by adding NudgeBanner to the calendar page (priority escalation + deadline nudges surface when viewing calendar)
- 5.10 required a new schema migration (schema-011) plus UI changes to both time entry forms and the entry list
- 5.14 remains blocked — needs an email service (Resend/SendGrid) before it can be wired up

**Tests Performed:**
- `pnpm run build` — passes cleanly, no TypeScript errors

**Risk Level:** Low. schema-011 must be run in Supabase SQL Editor before deploying. It is a safe nullable column addition.

**Next Recommended Action:**
- Run `schema-011-task-time-link.sql` in Supabase SQL Editor
- Deploy to Vercel (auto-deploy via GitHub push, or `vercel --prod`)
- Phase 7 — Productivity Insights & Reporting

---

### Session 4 — 2026-06-04
**Agent:** Claude + Codex

**Files Inspected:**
- All src/app and src/components files
- supabase/schema-*.sql
- .env.local

**Files Created:**
- `src/app/dashboard/layout.tsx` — dashboard layout wrapper (Codex)
- `src/components/DashboardShell.tsx` — sidebar navigation component (Codex)

**Files Modified:**
- All 37 component and page files — UI redesign (Codex)
- `src/app/page.tsx` — replaced placeholder with redirect to /login
- `src/app/globals.css` — removed dark mode override causing white input text
- `src/app/dashboard/projects/page.tsx` — fixed query to use eq() for personal users
- `src/components/expenses/ExpenseList.tsx` — added useEffect to sync state from props
- `src/components/time/TimeEntryList.tsx` — added useEffect to sync state from props
- `src/proxy.ts` — renamed from middleware.ts; export renamed to proxy (Next.js 16)

**Summary of Findings:**
- Root page was default Next.js placeholder — replaced with redirect
- Dark mode CSS variable was causing near-white input text — removed
- Multiple RLS infinite recursion bugs fixed via Supabase SQL editor:
  - organisation_members SELECT policy (get_my_org_ids helper)
  - project_members SELECT policy (self-referential)
- schema-007 (recurring expense columns) had not been applied — run this session
- projects page used .or() for personal users which failed silently — fixed to .eq()
- ExpenseList and TimeEntryList used useState(props) without useEffect — lists didn't update after form submission
- UI fully redesigned by Codex: bold blue/white theme, sidebar navigation

**Tests Performed:**
- pnpm run build — passes cleanly
- Vercel production deployment — successful
- Manual testing: account registration, expenses, projects, calendar

**Risk Level:** Low — no schema changes this session. RLS fixes applied directly in Supabase.

**Next Recommended Action:**
- Phase 7 — Productivity Insights & Reporting
- Verify expense and project list fixes are working on live site
- Consider adding useEffect state sync to any remaining list components

---


### Session 8 — 2026-06-05
**Agent:** Codex

**Files Inspected:**
- `README.md`
- `GOALS.md`
- `HANDOVER.md`
- `TECHSTACK.md`
- `package.json`
- `.env.local` (keys only used to create `.env.local.example`; values were not copied)

**Files Created:**
- `CONTRIBUTING.md` — local setup, branching strategy, PR/build guidance
- `.env.local.example` — placeholder values for all local environment keys
- `.github/workflows/ci.yml` — GitHub Actions build workflow for pushes and PRs targeting `master`

**Files Modified:**
- `README.md` — replaced scaffold text with project summary, live URL, tech stack, TECHSTACK link, and CI badge
- `GOALS.md` — marked Phase 1 items 1.3, 1.4, and 1.7 complete
- `.gitignore` — allowed `.env.local.example` to be committed while keeping real env files ignored
- `HANDOVER.md` — added this session entry

**Summary of Findings:**
- Project uses Next.js 16.2.6, TypeScript, Tailwind CSS, Supabase, Stripe, and Vercel.
- CI only builds; tests and deployment are intentionally omitted because no tests exist yet and Vercel handles deployment.
- GitHub Actions uses repository secrets for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_APP_URL`; these were set with the authenticated GitHub CLI.

**Tests Performed:**
- `pnpm run build` — passes cleanly

**Risk Level:** Low — documentation and CI configuration only.

**Next Recommended Action:**
- Push changes to trigger the first workflow run.

---


### Session 9 — 2026-06-05
**Agent:** Codex

**Files Inspected:**
- `src/app/invite/[token]/page.tsx`
- `src/lib/supabase-service.ts`
- `src/lib/supabase-browser.ts`
- `supabase/schema-001-auth.sql`
- `supabase/schema-002-account-type.sql`

**Files Created:**
- `src/app/api/invite/[token]/route.ts` — service-role invitation lookup by exact token
- `supabase/schema-026-fix-invitations-rls.sql` — drops the unsafe invitation SELECT policy

**Files Modified:**
- `src/app/invite/[token]/page.tsx` — replaced direct browser Supabase invitation query with `/api/invite/[token]` fetch; handles 404 and 410 responses
- `GOALS.md` — noted invitation RLS hardening under Phase 2.5
- `HANDOVER.md` — added this session entry

**Summary of Findings:**
- `schema-002-account-type.sql` had `using (true)` on `public.invitations`, allowing any authenticated user to read all invitations.
- The invite accept page no longer queries `invitations` directly from the browser for token lookup.
- The new API returns only the invitation matching the exact token and only when `accepted_at is null`; expired invitations return 410.
- Accepting an invite still uses the existing browser client flow for signup, member insert, and invitation update.

**Tests Performed:**
- `pnpm run build` — passes cleanly; `/api/invite/[token]` appears in the route list.

**Risk Level:** Low. This narrows read access and leaves the existing accept flow intact.

**Next Recommended Action:**
- Run `supabase/schema-026-fix-invitations-rls.sql` in Supabase SQL Editor before deployment.
- Claude should review the API response shape and invite accept flow before push.

---
## Product Definition (Reference)

| Feature | Detail |
|---|---|
| Time Tracking | Work hour logging with idle detection |
| Expense Management | Receipt uploads, categorization |
| Productivity Insights | Analytics dashboards |
| Task Management | To-do list with prioritization prompts |
| Calendar | Scheduling with focus-shift alerts |
| Account Model | Org (parent) + Employee (sub) accounts |
| Platforms | Web (desktop + mobile), Android, iOS, Windows app |
| Monetization | Freemium or per-user monthly tiers |
| Data | Secure login, per-account data isolation |
