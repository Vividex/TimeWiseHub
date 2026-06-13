# Phase 18 — Role Clarity, Business Plan Rename, Manager Task Retrieval

## Goal
Three improvements: rename "Team" plan label to "Business" in UI; tighten
roster + team HR editing to owner/admin only (managers become read-only);
add a "Team Tasks" section for managers to see and retrieve assigned org tasks.

## Source plan
`docs/superpowers/plans/2026-06-14-role-clarity-business-rename.md`
Each checklist item maps to a Step there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-14-role-clarity-business-rename.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx).
- **Conductor**: runs `pnpm run build`; commits; no migrations needed this phase.

## Acceptance checklist

### Task 1 — "Business" plan label rename
- [x] C1-1: Edit `src/lib/stripe.ts` — change `label: 'Team'` to `label: 'Business'`
- [x] C1-2: Edit `src/app/dashboard/billing/page.tsx` — welcome toast, Team card heading, UpgradeButton label, PlanBadge label (4 changes)
- [x] C1-3: Edit `src/app/api/invitations/route.ts` — error message
- [x] C1-4: Edit `src/app/api/projects/route.ts` — error message
- [x] C1-5: Edit `src/app/api/assistant/route.ts` — system prompt (2 changes)
- [x] C1-6: Edit `src/app/terms/page.tsx` — "Team plan" → "Business plan"
- [x] C1-7: [CONDUCTOR] `pnpm run build`
- [x] C1-8: [CONDUCTOR] Commit

### Task 2 — Roster permission tightening
- [x] C2-1: Edit `src/app/dashboard/roster/page.tsx` — `isManager` → `canManageRoster`, restrict to `['owner','admin']`
- [x] C2-2: Edit `src/components/roster/RosterGrid.tsx` — rename prop `isManager` → `canManageRoster`, update 3 internal uses
- [x] C2-3: [CONDUCTOR] `pnpm run build`
- [x] C2-4: [CONDUCTOR] Commit

### Task 3 — Team HR permission tightening
- [x] C3-1: Edit `src/app/dashboard/team/page.tsx` — `isManager` → `canManageTeam`, restrict to `['owner','admin']`
- [x] C3-2: Edit `src/components/team/TeamGrid.tsx` — rename prop `isManager` → `canManageTeam`
- [x] C3-3: Edit `src/components/team/EmployeeDrawer.tsx` — rename prop `isManager` → `canManageTeam`, update all internal uses
- [x] C3-4: [CONDUCTOR] `pnpm run build`
- [x] C3-5: [CONDUCTOR] Commit

### Task 4 — TeamTasks component
- [x] C4-1: Create `src/components/tasks/TeamTasks.tsx` per plan Task 4 Step 1
- [x] C4-2: [CONDUCTOR] `pnpm run build`
- [x] C4-3: [CONDUCTOR] Commit

### Task 5 — Wire TeamTasks into dashboard
- [ ] C5-1: Edit `src/app/dashboard/page.tsx` — import TeamTasks, add AssignedTask type, fetch assigned tasks in parallel, render TeamTasks section
- [ ] C5-2: [CONDUCTOR] `pnpm run build`
- [ ] C5-3: [CONDUCTOR] Commit

## Verification
`pnpm run build` must pass clean after every [CONDUCTOR] build check.
Manual smoke after final commit:
- Billing page shows "Business" in card heading, badge, and upgrade button; welcome toast says "Business"
- Roster: manager-role user sees grid read-only (no add/publish); admin sees buttons
- Team: manager sees drawer read-only (no edit controls); admin sees edit controls
- Dashboard as manager: "Team tasks" section appears with assigned tasks + Retrieve buttons
- Dashboard as employee: no Team tasks, no Unassigned tasks
