# Phase 18 — Role Clarity, Business Plan Rename, Manager Task Retrieval

## Goal

Three coherent improvements confirmed in session:
1. Rename the "Team" plan label to "Business" everywhere in the UI (internal key `'team'` is unchanged).
2. Tighten permissions so roster management and HR team management are restricted to owner/admin only (not manager).
3. Add a "Team Tasks" view for managers: see all org-assigned tasks and "Retrieve" a task (set `assignee_id = null`) so it returns to the unassigned pool for re-assignment.

## Scope

**No database changes.** No new npm packages. No Stripe config changes. No auth changes.

---

## 1 — "Business" Plan Label Rename

The internal plan key `'team'` in DB, Stripe, and all code identifiers **stays unchanged** — only the display label changes. The guardrail around `STRIPE_TEAM_PRICE_ID` is respected.

Files:
- `src/lib/stripe.ts` — `label: 'Team'` → `label: 'Business'`
- `src/app/dashboard/billing/page.tsx` — hardcoded "Team" heading and UpgradeButton label
- `src/app/api/invitations/route.ts` — error message
- `src/app/api/projects/route.ts` — error message
- `src/app/api/assistant/route.ts` — system prompt reference
- `src/app/terms/page.tsx` — "The Team plan" sentence

### Exact changes

**`src/lib/stripe.ts` line 39:** `label: 'Team'` → `label: 'Business'`

**`src/app/dashboard/billing/page.tsx` line 107:** `<p className="text-lg font-black text-gray-900">Team</p>` → `…>Business</p>`

**`src/app/dashboard/billing/page.tsx` line 119:** `label="Upgrade to Team"` → `label="Upgrade to Business"`

**`src/app/api/invitations/route.ts` line 26:** `'Team plan required to invite members'` → `'Business plan required to invite members'`

**`src/app/api/projects/route.ts` line 55:** `'Team plan required for organisation projects'` → `'Business plan required for organisation projects'`

**`src/app/api/assistant/route.ts`:** In the system prompt string, update: `(personal, pro, or team)` → `(personal, pro, or business)` — one occurrence on the billing line.

**`src/app/terms/page.tsx` line 40:** `The Team plan is billed per seat` → `The Business plan is billed per seat`

**Not changing:** `PLANS.team.label` is now `'Business'` but `sub.plan` still equals `'team'` and the `{sub.plan === 'team'}` conditional stays. The PlanBadge renders `PLANS[sub.plan].label` which is now 'Business'. The success message `welcome to {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}` will still say "Team" — that's a lowercase concatenation of the key, not the label. Update that line too: use `PLANS[sub.plan].label` instead.

---

## 2 — Permission Tightening

### Roster management: owner + admin only

In `roster/page.tsx`, the `isManager` variable currently includes `'manager'`. Rename to `canManageRoster` and restrict:

```ts
const canManageRoster = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```

Pass as `canManageRoster` to `RosterGrid`. In `RosterGrid.tsx` rename the prop from `isManager` to `canManageRoster` (same boolean, same behaviour — add button, publish button, shift click-to-edit).

### Team HR management: owner + admin only

Same pattern in `team/page.tsx`:

```ts
const canManageTeam = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```

Rename `isManager` → `canManageTeam` prop in `TeamGrid` and `EmployeeDrawer`. Managers (and employees) become read-only viewers of the team page; they cannot edit profiles, add certs, or update onboarding.

---

## 3 — Manager Task Retrieval

### Data model

No schema change. Re-use `tasks` table. A "retrieved" task is simply one whose `assignee_id` is set back to `null` via a Supabase update on the client.

### New component: `src/components/tasks/TeamTasks.tsx`

Client component. Props:
```ts
{
  initialTasks: AssignedTask[]   // all org-assigned tasks (assignee_id != null)
  orgMembers: OrgMember[]        // { userId, displayName }
  currentUserId: string
}
```

Where:
```ts
type AssignedTask = {
  id: string; title: string; priority: string; status: string
  due_date: string | null; assignee_id: string
  projects: { id: string; name: string; colour: string } | null
}
type OrgMember = { userId: string; displayName: string }
```

Renders a flat list of tasks (no grouping) sorted by due date asc nulls last. Each card shows: project colour dot + name, task title, priority badge, assignee name, due date. A "Retrieve" button per task calls:

```ts
supabase.from('tasks').update({ assignee_id: null }).eq('id', taskId)
```

then removes the task from local state. On success, `router.refresh()` so the unassigned pool updates.

Empty state: "No tasks currently assigned to team members."

### Server-side changes: `src/app/dashboard/page.tsx`

Add a parallel fetch for assigned org tasks when `isManager && orgId`:

```ts
const { data: assignedPool } = await supabase
  .from('tasks')
  .select('id, title, priority, status, due_date, assignee_id, completed_at, projects(id, name, colour)')
  .not('assignee_id', 'is', null)
  .neq('status', 'done')
  .in('project_id', orgProjectIds)
  .order('due_date', { ascending: true, nullsFirst: false })
```

Pass to a `<TeamTasks>` section rendered below the unassigned pool, visible to managers only.

### Access control

Only `['owner','admin','manager']` see the Team Tasks section (same as the unassigned pool). Employees never see it. The `isManager` flag on `dashboard/page.tsx` already handles this — the component is conditionally rendered.

---

## Role Display Labels

The `OrgBillingSettingsForm.tsx` already uses `text-xs font-bold capitalize` on the role cell (line 245), which renders `owner` → "Owner", etc. No code change needed here.

Check assistant system prompt — it says "Owners and admins can invite new members". Update: "Admins can invite new members from Settings" (owner-as-admin framing).

---

## Acceptance Criteria

- Billing page shows "Business" (not "Team") in all three display locations; welcome toast shows "Business"; plan key `'team'` is unchanged in Stripe/DB/conditionals.
- Roster: manager-role users see the grid read-only (no add/publish buttons); owner/admin can edit.
- Team: manager-role users can open the drawer but all edit controls (Save profile, Add cert, Delete cert, Mark complete) are hidden; only owner/admin can edit.
- Dashboard: managers see a "Team Tasks" section listing all assigned org tasks; Retrieve button returns to pool; employees see nothing new.
- `pnpm run build` passes clean.
