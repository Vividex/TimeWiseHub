# Phase 5.15–5.17 — Task Assignment Pool
**Date:** 2026-06-08
**Repo:** C:/GameForge/TimeWiseHub

## Context
`tasks.assignee_id` already exists (nullable UUID). The existing `FOR ALL` RLS
policy in schema-008 lets all org members read/update any task in an org project.
No new columns or policies are needed — only a DB performance index, two new
page/component trees, and small updates to the existing task creation flow to
allow unassigned tasks.

## Acceptance checklist

- [x] T1: Create `supabase/schema-033-task-pool.sql` with the SQL below and apply it
  to the live Supabase project via `supabase db push` (or the MCP apply_migration
  tool). Content:
  ```sql
  -- partial index to speed up the task-pool query
  CREATE INDEX IF NOT EXISTS tasks_pool
    ON public.tasks (project_id, created_at)
    WHERE assignee_id IS NULL AND status <> 'done';
  ```

- [x] T2: Update `src/components/projects/TaskForm.tsx`,
  `src/components/projects/TaskSection.tsx`, and
  `src/app/dashboard/projects/[id]/page.tsx` to support creating unassigned tasks:
  - **TaskForm.tsx** — add optional prop
    `orgMembers?: { userId: string; displayName: string }[]`.
    When provided, render an "Assignee" `<select>` below the Notes field with
    "Unassigned" (value `""`) as the first option, then each member. Change the
    insert payload: `assignee_id` = selected member's `userId` or `null` when
    "Unassigned" is selected. Default selected value: `""` (unassigned).
  - **TaskSection.tsx** — accept and forward the new optional `orgMembers` prop
    to `<TaskForm>`.
  - **`[id]/page.tsx`** — map the existing `orgMembers` query result to
    `{ userId: string; displayName: string }[]` (display name =
    `profile.full_name ?? profile.email`) and pass it as `orgMembers` to
    `<TaskSection>`. Only pass the prop when `orgId` is non-null.

- [x] T3: Create `src/app/dashboard/tasks/page.tsx` — async server component:
  1. Get the current user via `supabase.auth.getUser()`; `redirect('/login')` if
     missing.
  2. Query `organisation_members` for `user.id` → get `orgId` and `role`.
  3. If `orgId` is non-null:
     a. Fetch active org project IDs:
        ```ts
        supabase.from('projects').select('id').eq('org_id', orgId).eq('status', 'active')
        ```
     b. Fetch pool tasks (unassigned, non-done) in those projects:
        ```ts
        supabase.from('tasks')
          .select('*, projects(id, name, colour)')
          .is('assignee_id', null)
          .neq('status', 'done')
          .in('project_id', orgProjectIds)
          .order('created_at', { ascending: false })
        ```
     c. Fetch org members with profiles:
        ```ts
        supabase.from('organisation_members')
          .select('user_id, role, profiles!organisation_members_user_id_fkey(id, email, full_name)')
          .eq('org_id', orgId)
        ```
  4. Fetch the current user's assigned tasks (any status):
     ```ts
     supabase.from('tasks')
       .select('*, projects(id, name, colour)')
       .eq('assignee_id', user.id)
       .order('due_date', { ascending: true, nullsFirst: false })
     ```
  5. Render:
     ```tsx
     <TasksHub
       poolTasks={poolTasks ?? []}
       myTasks={myTasks ?? []}
       orgMembers={mappedOrgMembers}
       currentUserId={user.id}
       currentUserRole={membership?.role ?? 'employee'}
     />
     ```

- [x] T4: Create `src/components/tasks/TasksHub.tsx` (`'use client'`):
  - Props: `poolTasks`, `myTasks`, `orgMembers`, `currentUserId`, `currentUserRole`
  - State: `tab: 'pool' | 'mine'` (default `'pool'`)
  - Render two tab buttons: "Available (N)" and "My Tasks (N)" where N is the
    respective count. Active tab uses `bg-cyan-500 text-white`, inactive uses
    `text-gray-500 hover:text-gray-900`.
  - Render `<TaskPool>` when tab is `'pool'`, `<MyTasks>` when `'mine'`.

- [x] T5: Create `src/components/tasks/TaskPool.tsx` (`'use client'`):
  - Props: `initialTasks` (with `projects: { id, name, colour }` embedded),
    `orgMembers: { userId, displayName }[]`, `currentUserId`, `currentUserRole`
  - State: `tasks` (local copy of `initialTasks`), `assignTargets: Record<string, string>` (taskId → selected userId)
  - Group tasks by `projects.id`; render each group with a colour dot + project
    name heading.
  - Each task card: title, priority badge (use same `PRIORITY_COLOURS` map as
    `TaskList`), due date / overdue indicator, notes preview.
  - "Claim" button (all roles):
    ```ts
    supabase.from('tasks').update({ assignee_id: currentUserId }).eq('id', task.id)
    // then: setTasks(prev => prev.filter(t => t.id !== task.id))
    ```
  - Force-assign UI (only when `currentUserRole` is `owner`, `admin`, or `manager`):
    a `<select>` of org members + "Assign" button. On submit:
    ```ts
    supabase.from('tasks').update({ assignee_id: selectedUserId }).eq('id', task.id)
    // then: setTasks(prev => prev.filter(t => t.id !== task.id))
    ```
  - Empty state (tasks.length === 0):
    `<p className="...">No available tasks — all tasks are assigned.</p>`

- [x] T6: Create `src/components/tasks/MyTasks.tsx` (`'use client'`):
  - Props: `initialTasks` (with `projects: { id, name, colour }` embedded),
    `currentUserId`
  - Groups tasks by status in order: `['todo', 'in_progress', 'done']`
  - STATUS_LABELS: `{ todo: 'To Do', in_progress: 'In Progress', done: 'Done' }`
  - Each task card: colour dot + project name (small, grey), title (bold), priority
    badge, due date / overdue indicator (same logic as `TaskList`).
  - Status advance ("Start" / "Done") and revert ("Back") buttons — same
    `advanceStatus` / `revertStatus` pattern as `TaskList.tsx` using
    `supabase.from('tasks').update(...)`.
  - Uses local state so status changes reflect immediately without a full reload.
  - Empty state: `<p className="...">You have no assigned tasks.</p>`

- [x] T7: Edit `src/components/DashboardShell.tsx`:
  - Import `ListTodo` from `lucide-react` (add to the existing named import).
  - Add `{ label: 'Tasks', href: '/dashboard/tasks', icon: ListTodo }` to the
    `'Work'` group in `NAV_GROUPS`, immediately after the `Projects` entry.
  - Add `'/dashboard/tasks': 'Tasks'` to `PAGE_TITLES`.

## Verification
Each turn: `pnpm run build` must exit 0 with no TypeScript errors.
Final turn: build passes, all seven boxes ticked, committed to master.
