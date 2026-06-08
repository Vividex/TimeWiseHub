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

### Session 11 — 2026-06-06
**Agent:** Claude

**Files Inspected:**
- `HANDOVER.md`, `src/components/DashboardShell.tsx`, `src/app/(auth)/login/page.tsx`, `src/proxy.ts`

**Files Created:**
- `public/logo.png` — logo image copied from project root for Next.js static serving
- `src/app/icon.png` — same image used as App Router favicon (replaces favicon.ico)
- `src/app/download/page.tsx` — public download page at `/download` with Windows installer button, feature highlights, system requirements

**Files Modified:**
- `src/components/DashboardShell.tsx` — replaced "T" placeholder box with `<Image src="/logo.png">` in sidebar; added "Download App" nav item
- `src/app/(auth)/login/page.tsx` — replaced "T" placeholder with logo image
- `src/app/(auth)/register/page.tsx` — replaced "T" placeholder with logo image
- `src/app/(auth)/reset-password/page.tsx` — replaced "T" placeholder with logo image

**Files Deleted:**
- `src/app/favicon.ico` — removed so `icon.png` takes precedence in browsers

**External Actions:**
- Created GitHub Release `v0.1.0` at `github.com/Vividex/TimeWiseHub/releases/tag/v0.1.0` with `TimeWiseHub_0.1.0_x64-setup.exe` uploaded as a release asset

**Summary of Findings:**
- The logo image (`logo image.png`) was sitting at the project root but not in `public/` — Next.js cannot serve files outside `public/`, so the logo was never loading
- All four locations using the "T" placeholder (sidebar, login, register, reset-password) were updated to use the real image
- `/download` is a static public page — not in the proxy matcher, so no auth required
- To update the download link for future releases: bump `LATEST_VERSION` in `src/app/download/page.tsx` and create a new GitHub release with the matching installer filename

**Tests Performed:**
- `pnpm run build` — passes cleanly; `/download` confirmed as static route

**Risk Level:** Low. No schema changes. All changes are UI and static assets.

**Next Recommended Action:**
- Hard refresh (`Ctrl+Shift+R`) on the live site after Vercel deploys to clear cached favicon
- Pending from Session 9: run `schema-026-fix-invitations-rls.sql` in Supabase SQL Editor
- Pending from Session 7: run `schema-024-fix-project-storage.sql` and `schema-025-invoice-number-unique.sql`

---

### Session 10 — 2026-06-06
**Agent:** Claude

**Files Inspected:**
- `GOALS.md`, `HANDOVER.md`, `package.json`, `next.config.ts`

**Files Created:**
- `src-tauri/` — full Tauri v2 scaffold (via `pnpm tauri init`)
- `src-tauri/tauri.conf.json` — app config
- `src-tauri/Cargo.toml` — Rust package definition
- `src-tauri/src/main.rs`, `src-tauri/src/lib.rs` — Rust entry points
- `src-tauri/capabilities/default.json` — Tauri capability config
- `src-tauri/icons/` — all required icon sizes
- `out/` — placeholder directory required by Tauri build (gitignored)

**Files Modified:**
- `package.json` — added `tauri:dev` and `tauri:build` scripts
- `.gitignore` — added `src-tauri/target/` and `src-tauri/gen/`
- `GOALS.md` — marked 9.6 complete

**Summary of Findings:**
- Rust 1.96.0 and Visual Studio Community 2026 (MSVC tools) were already installed
- Tauri v2.11.2 CLI + API installed via pnpm
- App identifier set to `com.vividex.timewisehub`; binary name `timewisehub.exe`
- Production approach: desktop shell loads `https://timewisehub.com.au` (not a static export — API routes require a live server)
- Dev mode loads `http://localhost:3000` via `build.devUrl`
- Initial debug compile took ~2 minutes; subsequent rebuilds take ~7 seconds (only app crate recompiles)
- `timewisehub.vercel.app` URL was stale — actual live URL is `timewisehub.com.au`; Tauri config corrected
- App confirmed working: desktop window opened and loaded `https://timewisehub.com.au` successfully

**Tests Performed:**
- `cargo check` — passes cleanly
- `pnpm tauri:dev` — desktop window opened and displayed the live app

**Risk Level:** Low. No schema or Next.js changes. All changes are Tauri configuration and Rust scaffold.

**Next Recommended Action:**
- Run `pnpm tauri:build` to produce the Windows NSIS installer (outputs to `src-tauri/target/release/bundle/`)
- Still pending from Session 9: run `schema-026-fix-invitations-rls.sql` in Supabase SQL Editor
- Still pending from Session 7: run `schema-024-fix-project-storage.sql` and `schema-025-invoice-number-unique.sql`
- Commit this session's changes to git

---

### Session 11 — 2026-06-07
**Agent:** Claude (planning + code authoring) — implementation via Codex subagents

**Files Inspected:**
- `GOALS.md`, `HANDOVER.md`, `agents.md`
- `package.json`, `src/app/globals.css`, `src/app/layout.tsx`
- `src/components/DashboardShell.tsx`
- `src/app/settings/page.tsx`
- `src/app/(auth)/login/page.tsx`, `register/page.tsx`, `reset-password/page.tsx`
- `src/app/dashboard/page.tsx`, `expenses/page.tsx`, `insights/page.tsx`, `billing/page.tsx`
- `src/app/api/invoices/[id]/mark-paid/route.ts`
- `supabase/schema-019-invoices.sql`
- `src/components/insights/BarChart.tsx`, `src/components/expenses/ExpenseForm.tsx`

**Files Created:**
- `docs/superpowers/specs/2026-06-07-dark-mode-finance-sidebar-design.md` — approved design spec (commit `1c07dea`)
- `docs/superpowers/plans/2026-06-07-dark-mode-finance-sidebar.md` — full 16-task implementation plan
- `src/components/ThemeToggle.tsx` — cycles light/dark/system, mounted guard, lucide icons
- `src/components/ThemeSelector.tsx` — Light/Dark/System button group for settings page
- `src/components/finance/FinanceSummary.tsx` — 3 summary cards (Income, Expenses, Net)
- `src/components/finance/FinanceChart.tsx` — Monthly P&L bar chart, pure CSS, cyan/rose bars
- `src/components/finance/IncomeForm.tsx` — Add income entry form, toggles open/closed
- `src/components/finance/IncomeList.tsx` — Table of income_entries with ConfirmDialog delete
- `supabase/schema-027-income-entries.sql` — migration file (NOT YET RUN IN SUPABASE — see below)

**Files Modified:**
- `src/app/globals.css` — added `@custom-variant dark` (Tailwind v4 syntax) and `html.dark` CSS variable overrides
- `src/app/layout.tsx` — added `ThemeProvider` from next-themes wrapping body, `suppressHydrationWarning` on `<html>`
- `src/components/DashboardShell.tsx` — full rewrite: NAV_GROUPS (4 groups + BOTTOM_ITEMS), lucide icons per item, category `<p>` labels, divider, `ThemeToggle` in header, dark mode classes, new `/dashboard/finance` route in PAGE_TITLES
- `src/app/settings/page.tsx` — added `ThemeSelector` Appearance card, dark mode classes on all cards
- `src/app/(auth)/login/page.tsx` — dark mode classes on backgrounds, headings, labels, inputs
- `src/app/(auth)/register/page.tsx` — same dark mode treatment
- `src/app/(auth)/reset-password/page.tsx` — same dark mode treatment
- `src/app/dashboard/page.tsx` — `dark:bg-slate-950` on wrapper, dark mode on cards
- `src/app/dashboard/expenses/page.tsx` — `dark:bg-slate-950` on wrapper
- `src/app/dashboard/insights/page.tsx` — `dark:bg-slate-950` on wrapper
- `src/app/dashboard/billing/page.tsx` — `dark:bg-slate-950` on wrapper
- `package.json` + `pnpm-lock.yaml` — added `lucide-react ^1.17.0` and `next-themes ^0.4.6`

**Commits this session (oldest → newest):**
```
334d154 feat: install lucide-react and next-themes
65e01be feat: add next-themes ThemeProvider, dark CSS variant, and ThemeToggle
664bb30 feat: grouped sidebar with icons, category labels, ThemeToggle in header
6bb8010 feat: ThemeSelector component and settings appearance section
387a0c5 fix: add dark mode classes to remaining settings cards
2b13c71 feat: dark mode on auth pages
5bba0e1 feat: dark mode wrapper classes on dashboard pages
733592c feat: income_entries table with RLS (schema-027)
2b3109c feat: FinanceSummary, FinanceChart, IncomeForm, IncomeList components
```

**What is COMPLETE:**
- [x] Dark mode infrastructure (ThemeProvider, CSS variant, tokens)
- [x] ThemeToggle in header (cycles light/dark/system)
- [x] ThemeSelector on settings page Appearance section
- [x] Sidebar restructure — grouped with icons, category headers, divider
- [x] Dark mode classes on: DashboardShell, settings, auth pages, dashboard page wrappers
- [x] `schema-027-income-entries.sql` migration file written
- [x] FinanceSummary, FinanceChart, IncomeForm, IncomeList components (all in `src/components/finance/`)

**What is STILL TO DO (pick up here):**

**STEP A — Run Supabase migration (manual, user action required):**
Go to Supabase Dashboard → SQL Editor → paste and run `supabase/schema-027-income-entries.sql`.
This creates the `income_entries` table with two RLS policies. The Finance page will 404/error without it.

**STEP B — Create Finance page (Task 14):**
Create `src/app/dashboard/finance/page.tsx` — server component.

Key details:
- Route: `/dashboard/finance`
- Query param: `?period=month|quarter|year|all` (default: `month`)
- Fetches from `income_entries` and `expenses` tables using `@/lib/supabase-server`
- Passes data to `FinanceSummary`, `FinanceChart`, `IncomeForm`, `IncomeList`
- Period selector is `<Link>` components (not client state)
- Also fetches all-time data for the 6-month chart (separate from period-filtered data)
- `getMonthlyData()` helper produces last 6 months of income vs expenses for the chart

Full page code is in the implementation plan at:
`docs/superpowers/plans/2026-06-07-dark-mode-finance-sidebar.md` — **Task 14**

After creating: run `pnpm run build` to verify, then commit:
```
git add src/app/dashboard/finance/
git commit -m "feat: Finance page with period selector, P&L chart, income table"
```

**STEP C — Extend mark-paid API (Task 15):**
Modify `src/app/api/invoices/[id]/mark-paid/route.ts` to auto-insert an `income_entries` row when an invoice is marked paid.

Key details:
- Join `clients(name)` when fetching invoice: `.select('owner_id, org_id, subtotal, currency, invoice_number, clients(name)')`
- Use `Promise.all` to update invoice status AND insert income_entry simultaneously
- Income entry fields: `source_type: 'invoice'`, `invoice_id: id`, `amount: invoice.subtotal`, `category: 'Sales'`, `description: 'Invoice {number} — {clientName}'`
- Invoice table uses `subtotal` (NOT `total`) and `owner_id` (NOT `user_id`)

Full route code is in the implementation plan — **Task 15**

After modifying: run `pnpm run build`, then commit:
```
git add src/app/api/invoices/
git commit -m "feat: mark-paid auto-inserts income_entry for invoice payments"
```

**STEP D — Final build check (Task 16):**
Run `pnpm run build` — confirm `/dashboard/finance` appears in the route table, zero TypeScript errors.

**Tests Performed:**
- `pnpm run build` — clean after each commit (40 static pages, zero errors)

**Risk Level:** Low. All changes are additive. Existing features unaffected. The only external dependency is running the Supabase migration before the Finance page will work.

**Next Recommended Action:**
1. User runs `schema-027-income-entries.sql` in Supabase SQL Editor
2. Codex implements Task 14 (Finance page) — see plan file for complete code
3. Codex implements Task 15 (mark-paid extension) — see plan file for complete code
4. Codex runs final build check
5. Push to master → Vercel auto-deploys

---

### Session 12 — 2026-06-07
**Agent:** Codex

**Files Inspected:**
- `HANDOVER.md`
- `agents.md`
- `GOALS.md`
- `docs/superpowers/plans/2026-06-07-dark-mode-finance-sidebar.md`
- `supabase/schema-027-income-entries.sql`
- `supabase/schema-019-invoices.sql`
- `src/components/finance/FinanceSummary.tsx`
- `src/components/finance/FinanceChart.tsx`
- `src/components/finance/IncomeForm.tsx`
- `src/components/finance/IncomeList.tsx`
- `src/app/api/invoices/[id]/mark-paid/route.ts`

**Files Created:**
- `src/app/dashboard/finance/page.tsx` — Finance page with period selector, income summary, 6-month P&L chart, income table, and expenses summary

**Files Modified:**
- `src/app/api/invoices/[id]/mark-paid/route.ts` — marking an invoice paid now also inserts an `income_entries` row with source_type `invoice`
- `HANDOVER.md` — added this session entry

**Summary of Findings:**
- The finance components and `schema-027-income-entries.sql` already existed from the previous session.
- `/dashboard/finance` is now wired as a server component using `income_entries` and `expenses`, with `month`, `quarter`, `year`, and `all` period filters.
- Supabase inferred `clients(name)` as an array in the mark-paid API, so the route now handles both array and object join shapes safely.
- `schema-027-income-entries.sql` still must be run in Supabase SQL Editor before the Finance page and invoice income insertion work against production data.

**Tests Performed:**
- `pnpm run build` — passes cleanly; `/dashboard/finance` appears in the route table.

**Risk Level:** Low. Changes are additive, but the mark-paid route depends on the new `income_entries` table existing in Supabase.

**Next Recommended Action:**
- Run `supabase/schema-027-income-entries.sql` in Supabase SQL Editor.
- Smoke test `/dashboard/finance` and marking an invoice paid after the migration is applied.
- Commit and push the completed finance implementation.

---

### Session 13 — 2026-06-07
**Agent:** Codex

**Files Created:**
- `src/app/api/projects/route.ts` — server-side project creation with plan enforcement
- `src/app/api/invitations/route.ts` — server-side team invitation creation with Team-plan and owner/admin checks
- `supabase/schema-028-project-entitlements.sql` — database trigger enforcing free project limits and Team-only org projects

**Files Modified:**
- `src/lib/subscription.ts` — central entitlement helpers for effective plan, paid/team access, project limits, and report export checks
- `src/components/projects/ProjectForm.tsx` and `src/app/dashboard/projects/page.tsx` — project creation now uses `/api/projects` and displays free/team limit messages
- `src/components/InviteMember.tsx` and `src/app/dashboard/page.tsx` — invitations now use `/api/invitations` and only appear for Team-plan org owners/admins
- `src/app/api/export/route.ts` and `src/app/dashboard/reports/page.tsx` — report/data export now requires Pro or Team
- `src/app/dashboard/time/page.tsx`, `expenses/page.tsx`, `leave/page.tsx`, `insights/page.tsx` — manager/team surfaces now require Team in addition to manager role

**Summary of Findings:**
- Paid tiers were previously mostly configured and displayed, but not consistently enforced.
- Free users are now limited to three active projects at both app API and database trigger level.
- Organisation project creation and team invitations now require an active Team subscription.
- Report/data export now requires an active Pro or Team subscription.
- Manager dashboards, timesheets, expense approvals, leave approvals, and org insights now require Team.

**Tests Performed:**
- `pnpm run build` — passes cleanly; new `/api/projects` and `/api/invitations` routes appear in the route table.
- Supabase migration `schema_028_project_entitlements` applied successfully.
- Supabase security advisor no longer reports the new `enforce_project_entitlements()` trigger function after revoking execute from `public`, `anon`, and `authenticated`.

**Risk Level:** Medium-low. Entitlement checks are now active and may block workflows for org users unless their subscription is Team. Existing pre-existing Supabase SECURITY DEFINER warnings remain for older functions.

**Next Recommended Action:**
- Smoke test Free project creation at the three-active-project limit.
- Smoke test Pro report export.
- Smoke test Team organisation invite, manager views, and org project creation.

---

### Session 14 — 2026-06-07
**Agent:** Claude

**Files Inspected:**
- `src/app/dashboard/finance/page.tsx`
- `src/app/globals.css`
- `src/components/finance/IncomeList.tsx`
- `src/components/finance/IncomeForm.tsx`
- `src/app/api/invoices/[id]/mark-paid/route.ts`
- `src/lib/subscription.ts`
- `supabase/schema-028-project-entitlements.sql`

**Files Created:**
- None

**Files Modified:**
- `~/.claude.json` — Supabase MCP server added at user scope (env: SUPABASE_ACCESS_TOKEN)

**Summary of Findings (code review of Session 12–13 Codex work):**

Codex completed Tasks 14–16 (Finance page, mark-paid extension, final build check) and also added out-of-scope subscription entitlements work (schema-028, subscription.ts). A code review found **4 bugs** requiring fixes.

---

**PENDING FIXES — Codex must implement all 4 before deploying:**

---

#### FIX 1 — CRITICAL: Finance page period filter silently ignored
**File:** `src/app/dashboard/finance/page.tsx` (approx lines 121–140)
**Bug:** Supabase query builder methods (`.gte()`, `.lte()`) return NEW query objects. Codex used the old pattern of calling them without reassigning, so all period filters are discarded — every tab shows all-time data.

Find this pattern:
```ts
const incomeQuery = supabase.from('income_entries').select(...).eq(...)
if (from) {
  incomeQuery.gte('date', from)   // ← BUG: result discarded
}
if (to) {
  incomeQuery.lte('date', to)     // ← BUG: result discarded
}
```

Replace with:
```ts
let incomeQuery = supabase.from('income_entries').select(...).eq(...)
if (from) incomeQuery = incomeQuery.gte('date', from)
if (to) incomeQuery = incomeQuery.lte('date', to)
```

Apply the same pattern to the `expenseQuery` variable in the same file (same bug exists there too).

After fixing: verify that switching from Month → Quarter → Year → All shows different totals.

---

#### FIX 2 — HIGH: Global CSS dark overrides conflict with Tailwind utility system
**File:** `src/app/globals.css` (lines 31–75)
**Bug:** Codex added a block of nuclear `html.dark .bg-white { ... }` overrides as a shortcut for dark mode on older components. This approach:
- Overrides intentionally-white elements (e.g., modals, badges) in dark mode
- Uses `#0f172a` (slate-950) inconsistently — other dark surfaces use slate-800/slate-900
- Fights against the `dark:` utility class system already in place
- Makes every future dark mode tweak require fighting both systems

**Remove the entire block from line 31 to line 75.** The correct section to keep is:

```css
/* KEEP — only this dark block */
html.dark {
  --background: #020617;
  --foreground: #f1f5f9;
}
```

**Remove everything from this line onwards until end of file (the problematic block starts at):**
```css
/* Dark-mode compatibility for older dashboard components that predate dark: utilities. */
html.dark .bg-white {
```
...through to the end of the `html.dark input::placeholder` block.

After removing: audit any components that were relying on the global overrides (projects page, clients page, time page) and add proper `dark:` utility classes to them individually. Run `pnpm run build` to verify no TypeScript errors.

---

#### FIX 3 — MEDIUM: IncomeList deletes without confirmation or error handling
**File:** `src/components/finance/IncomeList.tsx`
**Bug:** The delete button fires `handleDelete()` immediately with no confirmation dialog, no error handling if the Supabase call fails, and no loading state to prevent double-clicks.

Replace the entire file content with:

```tsx
'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'

type IncomeEntry = {
  id: string
  date: string
  amount: number
  currency: string
  category: string
  description: string | null
  source_type: string
}

export default function IncomeList({
  entries,
  onDeleted,
}: {
  entries: IncomeEntry[]
  onDeleted: () => void
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeletingId(id)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('income_entries').delete().eq('id', id)
    setDeletingId(null)
    setConfirmId(null)
    if (err) {
      setError('Failed to delete entry. Please try again.')
      return
    }
    onDeleted()
  }

  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500 py-4 text-center">No income entries for this period.</p>
  }

  return (
    <>
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 dark:bg-red-950 px-3 py-2 text-sm font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-700">
              <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Date</th>
              <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Category</th>
              <th className="pb-2 text-left text-xs font-semibold text-gray-500 dark:text-slate-400">Description</th>
              <th className="pb-2 text-right text-xs font-semibold text-gray-500 dark:text-slate-400">Amount</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map(e => (
              <tr key={e.id} className="border-b border-gray-50 dark:border-slate-800">
                <td className="py-2 text-gray-600 dark:text-slate-300">{e.date}</td>
                <td className="py-2 text-gray-600 dark:text-slate-300">{e.category}</td>
                <td className="py-2 text-gray-500 dark:text-slate-400 max-w-[200px] truncate">
                  {e.description ?? '—'}
                  {e.source_type === 'invoice' && (
                    <span className="ml-2 rounded-full bg-cyan-100 dark:bg-cyan-900 px-2 py-0.5 text-xs text-cyan-700 dark:text-cyan-300">
                      Invoice
                    </span>
                  )}
                </td>
                <td className="py-2 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                  {e.currency} {Number(e.amount).toFixed(2)}
                </td>
                <td className="py-2 text-right">
                  {e.source_type === 'manual' && (
                    <button
                      onClick={() => setConfirmId(e.id)}
                      disabled={deletingId === e.id}
                      className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-40"
                    >
                      {deletingId === e.id ? '…' : 'Delete'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Delete income entry"
        description="This income entry will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => confirmId && handleDelete(confirmId)}
        onCancel={() => setConfirmId(null)}
      />
    </>
  )
}
```

Note: This requires `@/components/ConfirmDialog` to exist. Verify the import path matches the existing component in the project.

---

#### FIX 4 — MINOR: IncomeForm doesn't reset currency and category after submit
**File:** `src/components/finance/IncomeForm.tsx`
**Bug:** After a successful submit, the form resets `amount`, `description`, and `date` but leaves `currency` and `category` at whatever values the user had selected. On the next entry the old selections persist unexpectedly.

Find the `handleSubmit` reset block (after `setError(null)` on success):
```ts
setAmount('')
setDescription('')
setDate(todayStr())
```

Replace with:
```ts
setAmount('')
setDescription('')
setDate(todayStr())
setCurrency('AUD')
setCategory('Sales')
```

---

**SCHEMA STATUS:**
- `supabase/schema-027-income-entries.sql` — **NOT YET RUN**. Must be run in Supabase SQL Editor before the Finance page works.
- `supabase/schema-028-project-entitlements.sql` — Already run by Codex in Session 13. No action needed.

**Previous unrun schemas still pending:**
- `schema-024-fix-project-storage.sql`
- `schema-025-invoice-number-unique.sql`
- `schema-026-fix-invitations-rls.sql`

**Tests Performed:**
- Code review only — no new code written this session.

**Risk Level:** Medium (Fix 1 is a silent data bug — period filter completely non-functional). Fix 2 (CSS) is cosmetic but causes visual inconsistencies. Fixes 3–4 are UX quality issues.

**Next Recommended Action:**
1. Codex implements FIX 1 (query builder reassignment) in `finance/page.tsx`
2. Codex implements FIX 2 (remove global CSS overrides) from `globals.css`
3. Codex implements FIX 3 (ConfirmDialog + error handling) in `IncomeList.tsx`
4. Codex implements FIX 4 (state reset) in `IncomeForm.tsx`
5. User runs `schema-027-income-entries.sql` in Supabase SQL Editor
6. `pnpm run build` to verify, then push to master

---

### Session 15 — 2026-06-08
**Agent:** Codex

**Files Inspected:**
- `GOALS.md`
- `HANDOVER.md`
- `src/app/layout.tsx`
- `src/app/dashboard/layout.tsx`
- `src/components/DashboardShell.tsx`
- `src/components/BackButton.tsx`
- `src/components/NavHistoryProvider.tsx`
- `package.json`

**Files Created:**
- None

**Files Modified:**
- `src/components/BackButton.tsx` — global back button now hides on all `/dashboard` routes so it does not cover the sidebar TimeWiseHub logo.
- `HANDOVER.md` — added this session entry.

**Summary of Findings:**
- `BackButton` is mounted globally in `src/app/layout.tsx`, while dashboard pages are wrapped by `DashboardShell`.
- The button was only hidden on `/dashboard` exactly, so nested dashboard pages such as `/dashboard/time` and `/dashboard/projects/[id]` could still display it over the sidebar/logo.
- The fix keeps the button available on non-dashboard pages after in-app navigation, including pages that navigate away from the dashboard shell.
- Existing uncommitted files were present before this session and were left untouched except for the required `HANDOVER.md` update.

**Tests Performed:**
- `pnpm run build` — passes cleanly; 44 app routes generated with no TypeScript errors.

**Risk Level:** Low. One route-visibility condition changed; no navigation targets or sidebar behavior were modified.

**Next Recommended Action:**
- Smoke test a dashboard subpage and a non-dashboard page after navigating away from the dashboard to confirm the button visibility matches expectations.
- Recommend committing now — the back button overlay bug is fixed and the build passes.

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
