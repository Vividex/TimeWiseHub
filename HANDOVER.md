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
