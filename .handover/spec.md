# Phase 15 — Navigation & Client Drill-Down Redesign

## Goal
Rebuild navigation around a client-centred drill-down (Client ▸ Projects/Sessions/Notes
▸ Project ▸ Tasks), rendered through one shared tile component, with a reorganised
sidebar and a mobile hamburger drawer replacing the horizontal scroll strip.

## Source plan
`docs/superpowers/plans/2026-06-10-navigation-client-drilldown-redesign.md`
Each checklist item maps to a Task there — implement the code VERBATIM from the plan.

## Source spec
`docs/superpowers/specs/2026-06-10-navigation-client-drilldown-redesign-design.md`

## Division of labor
- **Codex**: all text file creation/edits (.ts/.tsx).
- **Conductor**: runs all shell (`pnpm run build`, `git`); verifies diffs; ticks boxes; commits.
  No DB migration this phase (no schema changes).

## Acceptance checklist

### Task 1 — Shared Tile primitive
- [x] C1-1: Create `src/components/ui/Tile.tsx` (`Tile` + `TileGrid`) per plan Task 1
- [x] C1-2: Build check (`pnpm run build`)
- [x] C1-3: Commit

### Task 2 — Task drawer
- [x] C2-1: Create `src/components/projects/TaskDrawer.tsx` per plan Task 2
- [x] C2-2: Build check
- [x] C2-3: Commit

### Task 3 — Project task grid
- [x] C3-1: Create `src/components/projects/ProjectTaskGrid.tsx` per plan Task 3
- [x] C3-2: Build check
- [x] C3-3: Commit

### Task 4 — Nested project home route
- [x] C4-1: Create `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx` per plan Task 4
- [x] C4-2: Build check
- [x] C4-3: Commit

### Task 5 — Client projects grid
- [x] C5-1: Read `src/components/projects/ProjectForm.tsx` props; create `src/app/dashboard/clients/[id]/projects/page.tsx` per plan Task 5 (creation must bind client)
- [x] C5-2: Build check
- [x] C5-3: Commit

### Task 6 — Client sessions grid
- [x] C6-1: Create `src/app/dashboard/clients/[id]/sessions/page.tsx` per plan Task 6
- [x] C6-2: Build check
- [x] C6-3: Commit

### Task 7 — Client notes feed
- [x] C7-1: Create `src/app/dashboard/clients/[id]/notes/page.tsx` per plan Task 7
- [x] C7-2: Build check
- [x] C7-3: Commit

### Task 8 — Client home category tiles
- [ ] C8-1: Replace `src/app/dashboard/clients/[id]/page.tsx` with category tiles per plan Task 8
- [ ] C8-2: Build check
- [ ] C8-3: Commit

### Task 9 — Clients list as tiles
- [ ] C9-1: Modify `src/app/dashboard/clients/page.tsx` to render client tiles per plan Task 9
- [ ] C9-2: Build check
- [ ] C9-3: Commit

### Task 10 — Retire project/task routes (redirects)
- [ ] C10-1: Convert `projects/[id]`, `projects`, `tasks` pages to redirects per plan Task 10
- [ ] C10-2: Build check
- [ ] C10-3: Commit

### Task 11 — Sidebar reorg + mobile drawer
- [ ] C11-1: Create `src/components/nav/SidebarNav.tsx` + `src/components/nav/MobileSidebar.tsx`; rewrite `src/components/DashboardShell.tsx` per plan Task 11
- [ ] C11-2: Build check
- [ ] C11-3: Commit

### Task 12 — Merge Reports + Activity into Insights tabs
- [ ] C12-1: Extract Overview/Activity/Export panels; create `src/components/insights/InsightsTabs.tsx`; rewire insights page; redirect reports + activity per plan Task 12
- [ ] C12-2: Build check
- [ ] C12-3: Commit

### Task 13 — Home as "My Work"
- [ ] C13-1: Create `src/components/home/MyWork.tsx`; rewrite `src/app/dashboard/page.tsx`; carry over manager unassigned-pool per plan Task 13
- [ ] C13-2: Build check
- [ ] C13-3: Commit

## Verification
After each item: `pnpm run build` must pass clean (tsc + eslint).
Final smoke: Clients grid → client category tiles → projects grid → project task grid →
task drawer edits persist; sessions grid → existing session detail; notes feed; old routes
(`/projects`, `/tasks`, `/projects/[id]`, `/reports`, `/activity`) redirect; new sidebar
groups with no Projects/Tasks; mobile hamburger opens/closes; Insights three tabs render.

## Out of scope
- No DB schema changes, no new npm dependencies.
- No billing/Stripe/auth changes.
- No task comments/subtasks/attachments (drawer stays light).
- Do not drop the manager unassigned-task pool (must survive into Home).
