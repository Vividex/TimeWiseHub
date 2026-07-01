# Phase 18 — Role Clarity, Business Plan Rename, Manager Task Retrieval

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename "Team" plan to "Business" in UI, tighten roster/team edit to owner+admin only, add manager view of all assigned org tasks with a Retrieve button.

**Architecture:** Pure UI/component changes — no schema migrations, no new deps. Three areas: string substitution across 6 files; prop rename in 3 component pairs; new `TeamTasks.tsx` client component wired into the dashboard page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Supabase browser client.

---

### Task 1: "Business" plan label rename

**Files:**
- Modify: `src/lib/stripe.ts`
- Modify: `src/app/dashboard/billing/page.tsx`
- Modify: `src/app/api/invitations/route.ts`
- Modify: `src/app/api/projects/route.ts`
- Modify: `src/app/api/assistant/route.ts`
- Modify: `src/app/terms/page.tsx`

- [ ] **Step 1: stripe.ts — change label**

In `src/lib/stripe.ts`, change line 39:
```ts
    label: 'Team',
```
to:
```ts
    label: 'Business',
```
Do NOT change the key `team:` or any reference to `STRIPE_TEAM_PRICE_ID`.

- [ ] **Step 2: billing/page.tsx — three display changes**

In `src/app/dashboard/billing/page.tsx`:

Change the welcome toast line (currently `welcome to {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}!`):
```tsx
Subscription activated — welcome to {PLANS[sub.plan as keyof typeof PLANS]?.label ?? sub.plan}!
```

Change the Team card heading (line ~107):
```tsx
                <p className="text-lg font-black text-gray-900">Business</p>
```

Change the UpgradeButton label (line ~119):
```tsx
              <UpgradeButton plan="team" seats={1} label="Upgrade to Business" />
```

- [ ] **Step 3: invitations error message**

In `src/app/api/invitations/route.ts`, change:
```ts
return NextResponse.json({ error: 'Team plan required to invite members' }, { status: 402 })
```
to:
```ts
return NextResponse.json({ error: 'Business plan required to invite members' }, { status: 402 })
```

- [ ] **Step 4: projects error message**

In `src/app/api/projects/route.ts`, change:
```ts
return NextResponse.json({ error: 'Team plan required for organisation projects' }, { status: 402 })
```
to:
```ts
return NextResponse.json({ error: 'Business plan required for organisation projects' }, { status: 402 })
```

- [ ] **Step 5: assistant system prompt**

In `src/app/api/assistant/route.ts`, in the system prompt string:

Change: `(personal, pro, or team)` → `(personal, pro, or business)`

Change: `Owners and admins can invite new members from Settings` → `Admins can invite new members from Settings`

- [ ] **Step 6: terms page**

In `src/app/terms/page.tsx` line ~40:
```tsx
              <li>The Business plan is billed per seat. Adding members increases your monthly charge at the next billing cycle.</li>
```

---

### Task 2: Roster permission tightening

**Files:**
- Modify: `src/app/dashboard/roster/page.tsx`
- Modify: `src/components/roster/RosterGrid.tsx`

- [ ] **Step 1: roster/page.tsx — restrict to owner+admin**

Change line 16:
```ts
  const isManager = ['owner','admin','manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```
to:
```ts
  const canManageRoster = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```

Change the `<RosterGrid>` usage (line ~73):
```tsx
        <RosterGrid
          orgId={orgId}
          members={memberList}
          initialShifts={shifts ?? []}
          leaveBlocks={leaveData ?? []}
          canManageRoster={canManageRoster}
        />
```

- [ ] **Step 2: RosterGrid.tsx — rename prop**

Change the component signature (line 42):
```ts
export default function RosterGrid({ orgId, members, initialShifts, leaveBlocks, canManageRoster }: {
  orgId: string; members: OrgMember[]; initialShifts: RosterShift[]
  leaveBlocks: LeaveBlock[]; canManageRoster: boolean
}) {
```

Replace every occurrence of `isManager` inside the component body with `canManageRoster`. There are 3 uses:
- Line 86: `{isManager && unpublishedCount > 0 && (` → `{canManageRoster && unpublishedCount > 0 && (`
- Line 135: `onClick={() => isManager && setFormState(...)` → `onClick={() => canManageRoster && setFormState(...)`
- Line 140: `{isManager && (` → `{canManageRoster && (`

---

### Task 3: Team HR permission tightening

**Files:**
- Modify: `src/app/dashboard/team/page.tsx`
- Modify: `src/components/team/TeamGrid.tsx`
- Modify: `src/components/team/EmployeeDrawer.tsx`

- [ ] **Step 1: team/page.tsx — restrict to owner+admin**

Change line 17:
```ts
  const isManager = ['owner','admin','manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```
to:
```ts
  const canManageTeam = ['owner','admin'].includes(membership?.role ?? '') && isTeamPlan(subscription)
```

Change the `<TeamGrid>` usage (line ~73):
```tsx
        <TeamGrid orgId={orgId} canManageTeam={canManageTeam} members={members} expiring={expiring} />
```

- [ ] **Step 2: TeamGrid.tsx — rename prop**

Find the component signature line with `isManager: boolean` and change to `canManageTeam: boolean`. Update every use of `isManager` in the body to `canManageTeam`. Then pass it through to `<EmployeeDrawer>`:
```tsx
<EmployeeDrawer ... canManageTeam={canManageTeam} ... />
```

- [ ] **Step 3: EmployeeDrawer.tsx — rename prop**

Change the props interface: `isManager: boolean` → `canManageTeam: boolean`. Update every use of `isManager` in the body to `canManageTeam`. These control the Save / Add / Delete / Mark complete buttons inside the drawer tabs.

---

### Task 4: Manager task retrieval — TeamTasks component

**Files:**
- Create: `src/components/tasks/TeamTasks.tsx`

- [ ] **Step 1: Create TeamTasks.tsx**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type AssignedTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  assignee_id: string
  projects: { id: string; name: string; colour: string } | null
}

type OrgMember = { userId: string; displayName: string }

const PRIORITY_COLOURS: Record<string, string> = {
  urgent: 'bg-red-50 text-red-600',
  high:   'bg-amber-50 text-amber-600',
  normal: 'bg-cyan-50 text-cyan-600',
  low:    'bg-gray-100 text-gray-500',
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function TeamTasks({
  initialTasks,
  orgMembers,
}: {
  initialTasks: AssignedTask[]
  orgMembers: OrgMember[]
}) {
  const router = useRouter()
  const [tasks, setTasks] = useState(initialTasks)
  const [loading, setLoading] = useState<string | null>(null)

  function memberName(userId: string): string {
    return orgMembers.find(m => m.userId === userId)?.displayName ?? userId
  }

  async function retrieve(taskId: string) {
    setLoading(taskId)
    const supabase = createClient()
    await supabase.from('tasks').update({ assignee_id: null }).eq('id', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    setLoading(null)
    router.refresh()
  }

  if (tasks.length === 0) {
    return (
      <p className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-xs font-semibold text-gray-500">
        No tasks currently assigned to team members.
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {tasks.map(task => {
        const days = task.due_date ? daysUntil(task.due_date) : null
        const overdue = days !== null && days < 0
        return (
          <li
            key={task.id}
            className={`flex items-start gap-3 rounded-2xl border p-4 ${overdue ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}
          >
            <div className="flex-1 min-w-0">
              {task.projects && (
                <div className="mb-1 flex items-center gap-1.5">
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: task.projects.colour }}
                  />
                  <span className="text-xs font-semibold text-gray-400 truncate">
                    {task.projects.name}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-900">{task.title}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${PRIORITY_COLOURS[task.priority] ?? PRIORITY_COLOURS.normal}`}>
                  {task.priority}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold text-gray-500">
                Assigned to {memberName(task.assignee_id)}
              </p>
              {task.due_date && (
                <p className={`mt-0.5 text-xs font-bold ${overdue ? 'text-red-600' : 'text-gray-500'}`}>
                  {overdue
                    ? `${Math.abs(days!)}d overdue`
                    : days === 0 ? 'Due today' : `Due in ${days}d`}
                </p>
              )}
            </div>
            <button
              onClick={() => retrieve(task.id)}
              disabled={loading === task.id}
              className="shrink-0 rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
            >
              {loading === task.id ? 'Retrieving…' : 'Retrieve'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
```

---

### Task 5: Wire TeamTasks into dashboard page

**Files:**
- Modify: `src/app/dashboard/page.tsx`

- [ ] **Step 1: Import TeamTasks**

Add to the imports at the top of `src/app/dashboard/page.tsx`:
```ts
import TeamTasks from '@/components/tasks/TeamTasks'
```

- [ ] **Step 2: Add AssignedTask type**

After the existing `PoolTask` type definition, add:
```ts
type AssignedTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  assignee_id: string
  projects: { id: string; name: string; colour: string } | null
}
```

- [ ] **Step 3: Fetch assigned tasks**

In the `if (isManager && orgId)` block (after `orgProjectIds` is defined), add a parallel fetch alongside the unassigned pool. Change the block from:

```ts
    if (orgProjectIds.length > 0) {
      const { data: pool } = await supabase
        .from('tasks')
        .select('id, title, priority, status, due_date, notes, assignee_id, completed_at, projects(id, name, colour)')
        .is('assignee_id', null)
        .neq('status', 'done')
        .in('project_id', orgProjectIds)
        .order('created_at', { ascending: false })
      poolTasks = (pool ?? []) as unknown as PoolTask[]
    }
```

to:

```ts
    if (orgProjectIds.length > 0) {
      const [{ data: pool }, { data: assigned }] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, notes, assignee_id, completed_at, projects(id, name, colour)')
          .is('assignee_id', null)
          .neq('status', 'done')
          .in('project_id', orgProjectIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('tasks')
          .select('id, title, priority, status, due_date, assignee_id, projects(id, name, colour)')
          .not('assignee_id', 'is', null)
          .neq('status', 'done')
          .in('project_id', orgProjectIds)
          .order('due_date', { ascending: true, nullsFirst: false }),
      ])
      poolTasks = (pool ?? []) as unknown as PoolTask[]
      assignedTasks = (assigned ?? []) as unknown as AssignedTask[]
    }
```

Also declare `let assignedTasks: AssignedTask[] = []` just above the `if (isManager && orgId)` block (same pattern as `poolTasks`).

- [ ] **Step 4: Render TeamTasks section**

In the JSX, after the existing unassigned tasks `<div>`, add:

```tsx
        {isManager && assignedTasks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Team tasks</h2>
            <TeamTasks
              initialTasks={assignedTasks}
              orgMembers={mappedMembers ?? []}
            />
          </div>
        )}
```

---

### Verification

After every task, the conductor runs `pnpm run build`. It must pass clean (tsc + eslint, no test runner).

Manual smoke after all tasks:
- Billing page: plan card shows "Business", badge shows "Business", Upgrade button says "Upgrade to Business".
- Roster: log in as manager-role user → grid is visible but no + add buttons and no Publish button. Log in as admin → buttons appear.
- Team: log in as manager → drawer opens but Save / Add cert / Delete / Mark complete are hidden. Log in as admin → controls visible.
- Dashboard as manager: "Team tasks" section visible with Retrieve buttons; clicking Retrieve removes the task from the list and it appears in "Unassigned tasks".
- Dashboard as employee: no Team tasks section, no Unassigned tasks section.
