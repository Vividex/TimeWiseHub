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
- [ ] 1.3 — Configure version control (git, branching strategy)
- [ ] 1.4 — Set up CI/CD pipeline (build, test, deploy)
- [~] 1.5 — Provision cloud infrastructure (hosting, database, storage for receipts)
  - Supabase project created — URL and anon key in .env.local
  - Vercel not yet set up (needed before deployment)
- [~] 1.6 — Configure environment variables and secrets management
  - .env.local created with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
  - SUPABASE_SERVICE_ROLE_KEY still needs to be filled in
- [ ] 1.7 — Establish local dev environment documentation

---

## Phase 2 — Authentication & Account System
> Goal: Secure login and the org/employee account model before any feature is built on top.

- [x] 2.1 — User registration and login (email + password)
- [x] 2.2 — Password reset and email verification flows
- [x] 2.3 — JWT or session-based auth with refresh tokens
- [x] 2.4 — Organisation (parent) account creation
- [x] 2.5 — Employee (sub) account creation and invitation flow
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

### Smart Nudges & Alerts
- [x] 5.11 — Deadline alerts — notify user when a project or task deadline is approaching (configurable threshold, e.g. 24h, 48h)
- [x] 5.12 — Priority escalation nudge — alert user when a higher-priority task exists while they are working on a lower one
- [x] 5.13 — Idle nudge — prompt user to resume work if no activity logged against an active project
- [!] 5.14 — Daily digest — optional morning summary of today's deadlines and top priorities
  - Preference setting exists (notification_preferences.daily_digest); email sending blocked on email service setup (Resend/SendGrid)

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
- [!] 7.7 — Scheduled reports (weekly email summary) — blocked on email service setup

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

- [ ] 9.1 — Confirm cross-platform approach (PWA vs React Native vs Flutter vs Electron)
- [ ] 9.2 — Responsive web — fully usable on mobile browser
- [ ] 9.3 — Progressive Web App (PWA) packaging
- [ ] 9.4 — Android app (Play Store submission)
- [ ] 9.5 — iOS app (App Store submission — requires macOS/Xcode)
- [ ] 9.6 — Windows desktop app (if warranted)
- [ ] 9.7 — Push notifications (task reminders, idle alerts, focus prompts)

---

## Phase 10 — Accountability & Transparency Tools
> Goal: Features that build trust between employees and organisations.

- [ ] 10.1 — Activity log — timestamped record of logins, time entries, edits
- [ ] 10.2 — Idle detection transparency report (visible to both user and manager)
- [ ] 10.3 — Screenshot or activity capture (optional, opt-in, privacy-respecting)
- [ ] 10.4 — Audit trail for expense approvals
- [ ] 10.5 — Data export for employees (GDPR/right-to-access compliance)

---

## Phase 11 — Launch Readiness
> Goal: Everything needed to ship publicly and list on app stores.

- [ ] 11.1 — Legal: Privacy Policy, Terms of Service, Cookie Policy
- [ ] 11.2 — GDPR / data residency compliance review
- [ ] 11.3 — App store listings (name, screenshots, descriptions)
- [ ] 11.4 — Unique app store name confirmed (trademark/availability check)
- [ ] 11.5 — Onboarding flow (first-run wizard for individuals and orgs)
- [ ] 11.6 — Help centre / FAQ
- [ ] 11.7 — Security audit and penetration testing
- [ ] 11.8 — Load testing and performance baseline
- [ ] 11.9 — Backup and disaster recovery plan confirmed

---

## Parking Lot (Future / Unscheduled)
- SSO / SAML integration for enterprise orgs
- API access for third-party integrations (Jira, Slack, QuickBooks)
- AI-powered productivity suggestions
- Multi-currency and multi-language support
- White-label / reseller option
