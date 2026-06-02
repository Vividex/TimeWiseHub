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
- [ ] 1.5 — Provision cloud infrastructure (hosting, database, storage for receipts)
- [ ] 1.6 — Configure environment variables and secrets management
- [ ] 1.7 — Establish local dev environment documentation

---

## Phase 2 — Authentication & Account System
> Goal: Secure login and the org/employee account model before any feature is built on top.

- [ ] 2.1 — User registration and login (email + password)
- [ ] 2.2 — Password reset and email verification flows
- [ ] 2.3 — JWT or session-based auth with refresh tokens
- [ ] 2.4 — Organisation (parent) account creation
- [ ] 2.5 — Employee (sub) account creation and invitation flow
- [ ] 2.6 — Role-based access control (admin, manager, employee, individual)
- [ ] 2.7 — Data isolation — confirm no cross-account data leakage
- [ ] 2.8 — Account settings (profile, timezone, notification preferences)

---

## Phase 3 — Time Tracking (MVP)
> Goal: Core work hour logging that individuals and employees can use immediately.

- [ ] 3.1 — Manual time entry (start time, end time, description, project/tag)
- [ ] 3.2 — Timer (start/stop/pause) with live elapsed display
- [ ] 3.3 — Idle detection — alert user after configurable inactivity period
- [ ] 3.4 — Edit and delete time entries
- [ ] 3.5 — Daily/weekly time summary view
- [ ] 3.6 — Export time logs (CSV, PDF)
- [ ] 3.7 — Manager view — see employee time logs within org

---

## Phase 4 — Expense Management
> Goal: Let users log, categorise, and upload receipts for business expenses.

- [ ] 4.1 — Create expense entry (amount, currency, category, date, notes)
- [ ] 4.2 — Receipt image upload (photo or PDF)
- [ ] 4.3 — Receipt storage with secure, user-scoped access
- [ ] 4.4 — Expense categories (configurable per org)
- [ ] 4.5 — Expense list view with filters (date range, category, status)
- [ ] 4.6 — Approval workflow — employee submits, manager approves/rejects
- [ ] 4.7 — Export expense reports (CSV, PDF)

---

## Phase 5 — Task Management & To-Do List
> Goal: A prioritised task system that integrates with the calendar and triggers focus prompts.

- [ ] 5.1 — Create, edit, delete tasks (title, due date, priority, notes)
- [ ] 5.2 — Priority levels (urgent, high, normal, low)
- [ ] 5.3 — Task status (to-do, in progress, done)
- [ ] 5.4 — Assign tasks to self or (org admins) to employees
- [ ] 5.5 — Focus prompts — notify user when a high-priority task needs attention
- [ ] 5.6 — Task list views (today, upcoming, by priority, by project)
- [ ] 5.7 — Link tasks to time entries

---

## Phase 6 — Calendar
> Goal: A scheduling layer that surfaces deadlines, meetings, and focus-shift prompts.

- [ ] 6.1 — Calendar view (day, week, month)
- [ ] 6.2 — Create and manage calendar events
- [ ] 6.3 — Task due dates appear on calendar
- [ ] 6.4 — Focus-shift alerts — prompt user to switch to upcoming important items
- [ ] 6.5 — (Optional) Google Calendar / Outlook sync
- [ ] 6.6 — Org shared calendar (team events, deadlines)

---

## Phase 7 — Productivity Insights & Reporting
> Goal: Analytics that help users and managers understand time use and output.

- [ ] 7.1 — Individual dashboard (hours logged, tasks completed, expenses this period)
- [ ] 7.2 — Productivity trends (daily/weekly/monthly charts)
- [ ] 7.3 — Time-by-project breakdown
- [ ] 7.4 — Org dashboard — aggregate employee hours, expenses, task completion
- [ ] 7.5 — Idle time and active time ratio reporting
- [ ] 7.6 — Scheduled reports (weekly email summary)

---

## Phase 8 — Monetisation & Subscription System
> Goal: Implement billing before public launch.

- [ ] 8.1 — Define tier limits (free, pro, team/org — features and seat caps)
- [ ] 8.2 — Integrate payment provider (Stripe or equivalent)
- [ ] 8.3 — Subscription management (upgrade, downgrade, cancel)
- [ ] 8.4 — Billing history and invoice downloads
- [ ] 8.5 — Trial period logic (freemium gate enforcement)
- [ ] 8.6 — Org seat billing (per-user monthly)
- [ ] 8.7 — Grace period and dunning (failed payment handling)

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
