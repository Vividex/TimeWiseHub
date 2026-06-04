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
