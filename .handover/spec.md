# Account deactivation

## Goal
Let an org owner (or a solo Pro user with no org) fully close their
TimeWiseHub account: login is blocked for everyone in the org, no data is
deleted, an exit reason is captured, and the operator gets an email
immediately.

## Key decisions
- Source spec: `docs/superpowers/specs/2026-07-14-account-deactivation-design.md`
- Source plan: `docs/superpowers/plans/2026-07-14-account-deactivation.md`
- Two flag columns (`organisations.deactivated_at`, `profiles.deactivated_at`)
  gate page access; a separate `account_deactivations` table records reason/
  feedback/who/when and survives multiple deactivate/reactivate cycles.
- Deactivate/reactivate writes go through `/api/account/deactivate` and
  `/api/account/reactivate` using the service-role client after an explicit
  server-side `role === 'owner'` check — **not** a direct client `.update()`,
  because the existing `organisations` UPDATE RLS policy allows admins as
  well as owners, which would silently let an admin bypass the "owner-only"
  requirement if the write went through the normal client. Same pattern
  already used by `src/app/api/team/role/route.ts`.
- Access gate (`deactivated_at` check) runs for every role, unlike the
  existing `setup_completed` gate it's added alongside, which is
  owner/admin-only — the whole point is that deactivation locks out the
  entire org. Both `dashboard/layout.tsx` and the standalone `/settings`
  route need their own copy of the check.
- Page-level gate only, not RLS-level — same documented limitation the
  existing `setup_completed` gate already has.
- Deviation from the approved spec, caught during planning: the spec's flow
  said "sign the user out" before redirecting to `/account-deactivated`, but
  that page needs to know whether the visitor is the owner (to show the
  Reactivate button) — impossible if they're already signed out. Dropped the
  explicit sign-out; the `deactivated_at` page-gate alone already blocks
  re-entry on every subsequent page load regardless of session state. A
  manual "Sign out" link is added to `/account-deactivated` instead so
  nothing is lost.

## Rules for Codex
- Text edits only. Do NOT run shell commands (pnpm, git, node, Supabase MCP) —
  the conductor handles those.
- Read every target file first, especially `src/app/dashboard/layout.tsx` and
  `src/app/settings/page.tsx` — both are modified in place, not replaced.
- After each turn, list the files changed/created.

## Rules for conductor (Claude)
- `pnpm run build` after each Codex turn — must pass before ticking the box
  and committing.
- C-1 is conductor-only (pure SQL) — apply via Supabase MCP `apply_migration`,
  no Codex dispatch for that item.
- Before dispatching C-3, confirm `OPERATOR_NOTIFICATION_EMAIL` is set in
  Vercel (`vercel env add OPERATOR_NOTIFICATION_EMAIL production`) — not a
  hard blocker (the route logs a warning and skips the email gracefully if
  unset), but the notification won't fire until it's set.
- Commit each verified item separately.

---

## C-1 — Database migration

*Conductor (no Codex turn — pure SQL):*
- [x] Write `supabase/schema-102-account-deactivation.sql` (plan Task 1, Step 1
  — exact SQL in the plan doc)
- [x] Apply via Supabase MCP `apply_migration` (name: `account_deactivation`)
- [x] Verify via the sanity-check queries in the plan (Step 3)
- [x] Commit: `git add supabase/schema-102-account-deactivation.sql && git commit -m "handover: C-1 account deactivation schema + RLS"`

---

## C-2 — Types and shared lib

*Codex edits:*
- [x] Create `src/types/account-deactivation.ts` (plan Task 2, Step 1)
- [x] Create `src/lib/account-deactivation.ts` (plan Task 2, Step 2)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/types/account-deactivation.ts src/lib/account-deactivation.ts && git commit -m "handover: C-2 account deactivation types and reason labels"`

---

## C-3 — API routes (deactivate, reactivate)

*Codex edits:*
- [x] Create `src/app/api/account/deactivate/route.ts` (plan Task 3, Step 1)
- [x] Create `src/app/api/account/reactivate/route.ts` (plan Task 3, Step 2)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [x] Commit: `git add src/app/api/account && git commit -m "handover: C-3 deactivate/reactivate account API routes"`

---

## C-4 — Settings Danger Zone UI + settings access gate

*Codex edits:*
- [x] Create `src/components/settings/DangerZoneDeactivate.tsx` (plan Task 4,
  Step 1)
- [x] Modify `src/app/settings/page.tsx` (plan Task 4, Step 2 — deactivation
  gate + Danger Zone tab wiring; exact before/after in the plan doc)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: as owner (free plan), confirm Danger Zone tab + full flow
  (reason → confirm modal, wrong text keeps button disabled). As admin,
  confirm tab is absent. As solo user, confirm own name is the confirm text.
- [x] Commit: `git add src/components/settings/DangerZoneDeactivate.tsx src/app/settings/page.tsx && git commit -m "handover: C-4 Danger Zone deactivation UI + settings access gate"`

---

## C-5 — Dashboard layout access gate

*Codex edits:*
- [x] Modify `src/app/dashboard/layout.tsx` (plan Task 5, Step 1 — replace the
  existing `setup_completed` block with the merged deactivated_at +
  setup_completed version; exact before/after in the plan doc)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean.
- [ ] Manual: confirm a non-deactivated org's `setup_completed` redirect still
  behaves exactly as before (role-scoped, unchanged).
- [x] Commit: `git add src/app/dashboard/layout.tsx && git commit -m "handover: C-5 block dashboard access for deactivated accounts (all roles)"`

---

## C-6 — `/account-deactivated` page + reactivation

*Codex edits:*
- [x] Create `src/components/account/ReactivateAccountButton.tsx` (plan Task
  6, Step 1)
- [x] Create `src/app/account-deactivated/page.tsx` (plan Task 6, Step 2)
- [x] Report back — list files changed.

*Conductor:*
- [x] `pnpm run build` — must pass clean; confirm `/account-deactivated`
  appears in the route table.
- [x] Commit: `git add src/app/account-deactivated src/components/account/ReactivateAccountButton.tsx && git commit -m "handover: C-6 account-deactivated page with owner-only reactivation"`

---

## Acceptance checklist
- [x] C-1: `account_deactivations` table + RLS + `deactivated_at` columns
  apply cleanly.
- [x] C-2/C-3: types/lib compile; both API routes return correct
  success/error shapes.
- [x] C-4: Danger Zone visible to owner/solo only, not admin; paid-plan block
  shows a Billing link; type-to-confirm actually blocks submission.
- [x] C-5: any role in a deactivated org is redirected from `/dashboard`;
  non-deactivated orgs unaffected.
- [x] C-6: owner sees a working Reactivate button; other members see the
  informational message only; reactivating restores `/dashboard` access with
  all prior data untouched.
- [x] Full `pnpm run build` passes clean end-to-end.
- [ ] Manual smoke test across the full flow (deactivate as owner on free
  plan, confirm email arrives if `OPERATOR_NOTIFICATION_EMAIL` is set,
  confirm other org members are locked out of both `/dashboard` and
  `/settings`, reactivate, confirm data intact) — requires the user's own
  authenticated sessions across multiple roles. **User follow-up, not the
  conductor's to complete.**

## Verification
No test runner in this project — verification is `pnpm run build` (tsc +
eslint) after every turn, full clean build after C-6, plus the "Manual
verification" checklist in
`docs/superpowers/plans/2026-07-14-account-deactivation.md`.
