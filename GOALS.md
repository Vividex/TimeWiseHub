# TimeWiseHub — Goals & Milestones

## Status Key
- [ ] Not started
- [~] In progress
- [x] Complete
- [!] Blocked

---

## Phase 1 — Foundation & Tech Stack
> Goal: Establish the project skeleton, hosting, and development pipeline before any feature work.

- [x] 1.1 — Choose and document tech stack (frontend, backend, database, cloud provider)
  - Frontend: Next.js + TypeScript + Tailwind CSS, hosted on Vercel
  - Backend/DB/Auth/Storage/Realtime: Supabase (PostgreSQL + Supabase Auth + Supabase Storage + Supabase Realtime)
  - Payments: Stripe
  - Mobile (later): Capacitor wrapping Next.js web app
  - Desktop (later): Tauri wrapping Next.js web app
  - See TECHSTACK.md for full reference
- [ ] 1.2 — Set up monorepo or multi-repo structure
- [x] 1.3 — Configure version control (git, branching strategy)
- [x] 1.4 — Set up CI/CD pipeline (build, test, deploy)
- [x] 1.5 — Provision cloud infrastructure (hosting, database, storage for receipts)
  - Supabase project connected — URL, anon key, service role key all in .env.local and Vercel env vars
  - Vercel (Hobby) deployed at https://timewisehub.vercel.app; auto-deploys on push to master
- [x] 1.6 — Configure environment variables and secrets management
  - .env.local: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, STRIPE_*, RESEND_*
  - All vars mirrored in Vercel environment variables
- [x] 1.7 — Establish local dev environment documentation

---

## Phase 2 — Authentication & Account System
> Goal: Secure login and the org/employee account model before any feature is built on top.

- [x] 2.1 — User registration and login (email + password)
- [x] 2.2 — Password reset and email verification flows
- [x] 2.3 — JWT or session-based auth with refresh tokens
- [x] 2.4 — Organisation (parent) account creation
- [x] 2.5 — Employee (sub) account creation and invitation flow
  - Invitation token lookup moved to service-role API route; public authenticated invitation enumeration policy removed in schema-026
- [x] 2.6 — Role-based access control (admin, manager, employee, individual)
- [x] 2.7 — Data isolation — confirm no cross-account data leakage
- [x] 2.8 — Account settings (profile, timezone, notification preferences)

---

## Phase 3 — Time Tracking (MVP)
> Goal: Core work hour logging that individuals and employees can use immediately.

- [x] 3.1 — Manual time entry (start time, end time, description, project/tag)
- [x] 3.2 — Timer (start/stop/pause) with live elapsed display
- [x] 3.3 — Idle detection — alert user after configurable inactivity period
- [x] 3.4 — Edit and delete time entries
- [x] 3.5 — Daily/weekly time summary view
- [x] 3.6 — Export time logs (CSV, PDF)
- [x] 3.7 — Manager view — see employee time logs within org

---

## Phase 4 — Expense Management
> Goal: Let users log, categorise, and upload receipts for business expenses.

- [x] 4.1 — Create expense entry (amount, currency, category, date, notes)
- [x] 4.2 — Receipt image upload (photo or PDF)
- [x] 4.3 — Receipt storage with secure, user-scoped access
- [x] 4.4 — Expense categories (configurable per org)
- [x] 4.5 — Expense list view with filters (date range, category, status)
- [x] 4.6 — Approval workflow — employee submits, manager approves/rejects
- [x] 4.7 — Export expense reports (CSV, PDF)

---

## Phase 5 — Projects, Tasks & Smart Nudges
> Goal: A project-centric workspace where each project is a digital pigeonhole containing tasks, documents, and deadlines. Smart alerts surface priority shifts and approaching deadlines.

### Projects
- [x] 5.1 — Create, edit, archive projects (name, description, colour/icon, due date)
- [x] 5.2 — Project list view — active (inbox) and completed (outbox) separated
- [x] 5.3 — Assign projects to self or (org admins) to employees
- [x] 5.4 — Project document uploads — attach files, PDFs, images to a project
- [x] 5.5 — Project-level deadline with countdown indicator

### Tasks (inside projects)
- [x] 5.6 — Create, edit, delete tasks within a project (title, due date, priority, notes)
- [x] 5.7 — Priority levels (urgent, high, normal, low)
- [x] 5.8 — Task status: to-do → in progress → done (moves to completed list)
- [x] 5.9 — Assign tasks to self or org members
- [x] 5.10 — Link tasks to time entries

### Task Assignment Pool
- [ ] 5.15 — Public task pool — unassigned org tasks visible to all org members in a shared "available tasks" view; tasks with no `assigned_to` appear here
- [ ] 5.16 — Claim & assign — employees can self-claim a pooled task (moves it to their personal bucket); managers/admins/owners can force-assign any pooled task to a specific employee
- [ ] 5.17 — Personal task bucket — "my tasks" view filtered to tasks assigned to the current user; replaces the current self-only view

### Smart Nudges & Alerts
- [x] 5.11 — Deadline alerts — notify user when a project or task deadline is approaching (configurable threshold, e.g. 24h, 48h)
- [x] 5.12 — Priority escalation nudge — alert user when a higher-priority task exists while they are working on a lower one
- [x] 5.13 — Idle nudge — prompt user to resume work if no activity logged against an active project
- [x] 5.14 — Daily digest — optional morning summary of today's deadlines and top priorities
  - Resend-backed cron route added at /api/notifications/daily; controlled by notification_preferences.daily_digest

---

## Phase 6 — Calendar
> Goal: A scheduling layer that surfaces project deadlines, task due dates, meetings, and focus-shift prompts in one view.

- [x] 6.1 — Calendar view (day, week, month)
- [x] 6.2 — Create and manage calendar events
- [x] 6.3 — Project and task due dates appear on calendar automatically
- [x] 6.4 — Focus-shift alerts — prompt user to switch to upcoming high-priority items
- [ ] 6.5 — (Optional) Google Calendar / Outlook sync
- [x] 6.6 — Org shared calendar (team events, project deadlines)

---

## Phase 7 — Productivity Insights & Reporting
> Goal: Analytics that help users and managers understand time use, project progress, and output.

- [x] 7.1 — Individual dashboard (hours logged, tasks completed, expenses this period)
- [x] 7.2 — Productivity trends (daily/weekly/monthly charts)
- [x] 7.3 — Time-by-project breakdown
- [x] 7.4 — Project health view — active vs completed tasks, time logged, deadline status per project
- [x] 7.5 — Org dashboard — aggregate employee hours, expenses, task and project completion
- [x] 7.6 — Idle time and active time ratio reporting
- [x] 7.7 — Scheduled reports (weekly email summary)
  - Resend-backed weekly report route added at /api/notifications/reports; controlled by notification_preferences.scheduled_reports

---

## Phase 8 — Monetisation & Subscription System
> Goal: Implement billing before public launch.

- [x] 8.1 — Define tier limits (free: 3 projects/30d history; pro: unlimited; team: per-seat)
- [x] 8.2 — Integrate Stripe (checkout sessions, customer portal, webhook handler)
- [x] 8.3 — Subscription management (upgrade, downgrade, cancel via Stripe portal)
- [ ] 8.4 — Billing history and invoice downloads (available in Stripe portal; no custom page)
- [x] 8.5 — Trial period logic (freemium gate via subscription.plan check)
- [x] 8.6 — Org seat billing (Team plan at $7.99/seat/month)
- [x] 8.7 — Grace period and dunning (past_due status + warning banner + portal redirect)

---

## Phase 9 — Cross-Platform & Mobile
> Goal: Extend the web app to native or PWA mobile and Windows.

- [x] 9.1 — Confirm cross-platform approach (PWA now; Capacitor for Android/iOS later; Tauri for Windows)
- [x] 9.2 — Responsive web — fixed non-responsive grids in ManualEntryForm and ExpenseForm
- [x] 9.3 — Progressive Web App (PWA) packaging — manifest, service worker, icons generated
- [!] 9.4 — Android app (Play Store submission) — external/deferred; requires Capacitor + Android Studio, store assets, and Play Console submission
- [!] 9.5 — iOS app (App Store submission) — external/deferred; requires macOS + Xcode, Apple Developer account, store assets, and App Store Connect submission
- [x] 9.6 — Windows desktop app — Tauri v2 wrapper; loads https://timewisehub.com.au; builds NSIS installer via `pnpm tauri:build`
- [x] 9.7 — Push notifications — VAPID keys, service worker push handler, subscribe/unsubscribe API, PushPermission component on dashboard

---

## Phase 10 — Accountability & Transparency Tools
> Goal: Features that build trust between employees and organisations.

- [x] 10.1 — Activity log — Postgres triggers on time_entries, expenses, tasks, projects; timeline view at /dashboard/activity
- [x] 10.2 — Idle detection transparency report — 5-week heatmap with active/idle/weekend day breakdown
- [!] 10.3 — Screenshot or activity capture — external/deferred; requires desktop app support (Tauri/Phase 9.6)
- [x] 10.4 — Audit trail for expense approvals — activity log captures expense status changes; visible in activity feed
- [x] 10.5 — Data export for employees — /api/export returns full JSON download (GDPR); "Download my data" in settings

---

## Phase 11 — Launch Readiness
> Goal: Everything needed to ship publicly and list on app stores.

- [x] 11.1 — Legal: Privacy Policy (/privacy), Terms of Service (/terms), Cookie Policy (/cookies)
- [x] 11.2 — GDPR compliance: cookie consent banner, data export in settings, deletion instructions in privacy policy
- [ ] 11.3 — App store listings — deferred; requires screenshots, store accounts, marketing copy
- [ ] 11.4 — App store name check — deferred; manual trademark/availability research
- [x] 11.5 — Onboarding flow — WelcomeBanner with quick-start actions for new users; org onboarding already existed
- [x] 11.6 — Help centre — /help with 6 sections covering all major features
- [!] 11.7 — Security audit — external/deferred; recommend a professional penetration test before public launch
- [!] 11.8 — Load testing — external/deferred; use k6 or similar against production URL before launch
- [x] 11.9 — Backup plan — Supabase Pro tier includes daily backups and PITR; document in runbook before launch

---

---

## Phase 12 — Team Chat
> Goal: In-app messaging so employees and managers can communicate privately or as a team, with file sharing, without leaving the platform.

- [ ] 12.1 — Direct messages — 1:1 private chat between any two org members; message history persisted in Supabase
- [ ] 12.2 — Team channels — org-wide broadcast channel visible to all members; managers/admins can post announcements
- [ ] 12.3 — Real-time delivery — Supabase Realtime subscriptions for live message updates without polling
- [ ] 12.4 — File sharing — attach and send documents, PDFs, and images via Supabase Storage; inline preview for images
- [ ] 12.5 — Unread indicators — badge counts on chat nav item and per-conversation; mark as read on open
- [ ] 12.6 — Notification on new message — push/email notification for unread messages (respects notification_preferences)

---

## Parking Lot (Future / Unscheduled)
- SSO / SAML integration for enterprise orgs
- API access for third-party integrations (Jira, Slack, QuickBooks)
- AI-powered productivity suggestions
- Multi-currency and multi-language support
- White-label / reseller option
