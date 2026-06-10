# Navigation & Client Drill-Down Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild navigation around a client-centred drill-down (Client ▸ Projects/Sessions/Notes ▸ Project ▸ Tasks), rendered through one shared tile component, with a reorganised sidebar and a mobile hamburger drawer replacing the horizontal scroll strip.

**Architecture:** A shared `<Tile>`/`<TileGrid>` primitive backs every grid. Client sub-pages are nested App Router routes under `/dashboard/clients/[id]/…`. The sidebar nav is extracted into one `<SidebarNav>` rendered by both the desktop aside and a new mobile slide-over. Retired routes become server redirects. Home is repurposed as "My Work"; Insights absorbs Reports + Activity as tabs.

**Tech Stack:** Next.js 16 App Router (server + client components), Supabase (`@/lib/supabase-server`, `@/lib/supabase-browser`), TypeScript strict, Tailwind v4, lucide-react, pnpm.

**Verification convention (this repo has no test runner):** every task ends with `pnpm run build` (runs tsc + eslint, must pass clean) plus the stated manual smoke. Do not add a test framework.

**Spec:** `docs/superpowers/specs/2026-06-10-navigation-client-drilldown-redesign-design.md`

---

## File map

**Create:**
- `src/components/ui/Tile.tsx` — shared `Tile` + `TileGrid`.
- `src/components/projects/TaskDrawer.tsx` — slide-over task editor.
- `src/components/projects/ProjectTaskGrid.tsx` — tile grid of a project's tasks + drawer + add.
- `src/components/nav/SidebarNav.tsx` — the nav body (logo, groups, bottom, user card).
- `src/components/nav/MobileSidebar.tsx` — mobile slide-over wrapper.
- `src/app/dashboard/clients/[id]/projects/page.tsx` — project tiles for a client.
- `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx` — project home (task tiles).
- `src/app/dashboard/clients/[id]/sessions/page.tsx` — session tiles for a client.
- `src/app/dashboard/clients/[id]/notes/page.tsx` — progress-notes feed.
- `src/components/insights/InsightsTabs.tsx` — tab switcher for the merged analytics page.
- `src/components/home/MyWork.tsx` — Home "My Work" client wrapper.

**Modify:**
- `src/components/DashboardShell.tsx` — use `SidebarNav` + `MobileSidebar`; update `NAV_GROUPS`, `PAGE_TITLES`, `getTitle`.
- `src/app/dashboard/clients/page.tsx` — render client tiles via `TileGrid`.
- `src/app/dashboard/clients/[id]/page.tsx` — replace body with category tiles.
- `src/app/dashboard/projects/[id]/page.tsx` — convert to redirect.
- `src/app/dashboard/projects/page.tsx` — convert to redirect.
- `src/app/dashboard/tasks/page.tsx` — convert to redirect.
- `src/app/dashboard/reports/page.tsx` — convert to redirect.
- `src/app/dashboard/activity/page.tsx` — convert to redirect.
- `src/app/dashboard/insights/page.tsx` — host the three tab panels.
- `src/app/dashboard/page.tsx` — render `MyWork`.

---

## Task 1: Shared `Tile` + `TileGrid` primitive

**Files:**
- Create: `src/components/ui/Tile.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/ui/Tile.tsx
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

type Tone = 'blue' | 'amber' | 'green' | 'gray' | 'red' | 'cyan'

const BADGE_TONES: Record<Tone, string> = {
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  green: 'bg-green-100 text-green-700',
  gray: 'bg-gray-100 text-gray-600',
  red: 'bg-red-100 text-red-700',
  cyan: 'bg-cyan-100 text-cyan-700',
}

export type TileProps = {
  title: string
  meta?: string
  stat?: string | number
  icon?: LucideIcon
  accent?: string
  progress?: { done: number; total: number }
  badge?: { label: string; tone: Tone }
  href?: string
  onClick?: () => void
}

function TileInner({ title, meta, stat, icon: Icon, accent, progress, badge }: TileProps) {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {(Icon || accent) && (
            <span
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={accent ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
            >
              {Icon ? <Icon size={18} /> : <span className="h-3 w-3 rounded-full" style={{ backgroundColor: accent }} />}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-bold text-gray-900 dark:text-slate-100">{title}</p>
            {meta && <p className="mt-0.5 text-sm text-gray-500 dark:text-slate-400">{meta}</p>}
          </div>
        </div>
        {badge && (
          <span className={`shrink-0 rounded-xl px-2 py-0.5 text-xs font-bold ${BADGE_TONES[badge.tone]}`}>
            {badge.label}
          </span>
        )}
      </div>

      {stat !== undefined && (
        <p className="text-2xl font-black text-gray-900 dark:text-slate-100">{stat}</p>
      )}

      {progress && progress.total > 0 && (
        <div className="mt-auto">
          <div className="mb-1 flex justify-between text-xs font-semibold text-gray-400">
            <span>{progress.done}/{progress.total} done</span>
            <span>{Math.round((progress.done / progress.total) * 100)}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
            <div
              className="h-1.5 rounded-full bg-cyan-500"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

const SHELL =
  'rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30'

export function Tile(props: TileProps) {
  if (props.href) {
    return (
      <Link href={props.href} className={`block ${SHELL}`}>
        <TileInner {...props} />
      </Link>
    )
  }
  return (
    <button type="button" onClick={props.onClick} className={SHELL}>
      <TileInner {...props} />
    </button>
  )
}

export function TileGrid({
  children,
  empty,
}: {
  children: React.ReactNode
  empty?: React.ReactNode
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children
  if (isEmpty && empty) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-200 px-6 py-10 text-center text-sm font-semibold text-gray-400 dark:border-slate-700">
        {empty}
      </p>
    )
  }
  return <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS (no type/lint errors). The component is unused so far — that is fine.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Tile.tsx
git commit -m "feat: shared Tile + TileGrid primitive"
```

---

## Task 2: Task drawer

**Files:**
- Create: `src/components/projects/TaskDrawer.tsx`

Reuses the same `tasks` update path used in `src/components/projects/TaskList.tsx` (Supabase `tasks` table; status values `todo`/`in_progress`/`done`; priorities `low`/`normal`/`high`/`urgent`).

- [ ] **Step 1: Write the drawer**

```tsx
// src/components/projects/TaskDrawer.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'

export type DrawerTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
}

const STATUSES = ['todo', 'in_progress', 'done'] as const
const STATUS_LABELS: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const

export default function TaskDrawer({
  task,
  orgMembers,
  onClose,
  onSaved,
}: {
  task: DrawerTask
  orgMembers?: { userId: string; displayName: string }[]
  onClose: () => void
  onSaved: (t: DrawerTask) => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes ?? '')
  const [priority, setPriority] = useState(task.priority)
  const [status, setStatus] = useState(task.status)
  const [dueDate, setDueDate] = useState(task.due_date ?? '')
  const [assignee, setAssignee] = useState(task.assignee_id ?? '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const supabase = createClient()
    const updates = {
      title: title.trim(),
      notes: notes.trim() || null,
      priority,
      status,
      due_date: dueDate || null,
      assignee_id: assignee || null,
      completed_at: status === 'done' ? (task.completed_at ?? new Date().toISOString()) : null,
    }
    const { error } = await supabase.from('tasks').update(updates).eq('id', task.id)
    setSaving(false)
    if (error) return
    onSaved({ ...task, ...updates })
    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">Edit task</h2>
          <button onClick={onClose} className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
          className="mb-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Due date</label>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />

        {orgMembers && orgMembers.length > 0 && (
          <>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Assignee</label>
            <select value={assignee} onChange={e => setAssignee(e.target.value)}
              className="mb-4 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <option value="">Unassigned</option>
              {orgMembers.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
            </select>
          </>
        )}

        <button onClick={save} disabled={saving || !title.trim()}
          className="mt-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS. Drawer unused so far.

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/TaskDrawer.tsx
git commit -m "feat: slide-over task drawer"
```

---

## Task 3: Project task grid (tiles + drawer)

**Files:**
- Create: `src/components/projects/ProjectTaskGrid.tsx`

Renders a project's tasks as tiles (status → badge tone, priority/due → meta), opens `TaskDrawer` on click, and keeps the existing `TaskForm` for adding.

- [ ] **Step 1: Write the grid**

```tsx
// src/components/projects/ProjectTaskGrid.tsx
'use client'

import { useState } from 'react'
import { Tile, TileGrid } from '@/components/ui/Tile'
import TaskForm from '@/components/projects/TaskForm'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const STATUS_TONE: Record<string, 'gray' | 'amber' | 'green'> = {
  todo: 'gray', in_progress: 'amber', done: 'green',
}
const STATUS_LABEL: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }

function meta(task: DrawerTask): string {
  const parts = [task.priority]
  if (task.due_date) parts.push(`due ${new Date(task.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`)
  return parts.join(' · ')
}

export default function ProjectTaskGrid({
  projectId,
  assigneeId,
  initialTasks,
  orgMembers,
}: {
  projectId: string
  assigneeId: string
  initialTasks: DrawerTask[]
  orgMembers?: { userId: string; displayName: string }[]
}) {
  const [tasks, setTasks] = useState<DrawerTask[]>(initialTasks)
  const [active, setActive] = useState<DrawerTask | null>(null)

  function handleAdd(task: DrawerTask) {
    setTasks(prev => [...prev, task])
  }
  function handleSaved(updated: DrawerTask) {
    setTasks(prev => prev.map(t => (t.id === updated.id ? updated : t)))
  }

  return (
    <div className="space-y-5">
      <TaskForm projectId={projectId} assigneeId={assigneeId} orgMembers={orgMembers} onAdd={handleAdd} />
      <TileGrid empty="No tasks yet. Add the first one.">
        {tasks.map(t => (
          <Tile
            key={t.id}
            title={t.title}
            meta={meta(t)}
            badge={{ label: STATUS_LABEL[t.status], tone: STATUS_TONE[t.status] }}
            onClick={() => setActive(t)}
          />
        ))}
      </TileGrid>
      {active && (
        <TaskDrawer
          task={active}
          orgMembers={orgMembers}
          onClose={() => setActive(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS. (`TaskForm`'s `onAdd` passes a task object whose fields are a superset of `DrawerTask`; if tsc complains about the `onAdd` type, widen `ProjectTaskGrid`'s `handleAdd` param to `DrawerTask` — it already is.)

- [ ] **Step 3: Commit**

```bash
git add src/components/projects/ProjectTaskGrid.tsx
git commit -m "feat: project task grid with tiles + drawer"
```

---

## Task 4: Project home route (task tiles)

**Files:**
- Create: `src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx`

Server component mirroring the data fetch from `src/app/dashboard/projects/[id]/page.tsx`, but rendering the header + `ProjectTaskGrid` (documents/budget kept).

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ProjectTaskGrid from '@/components/projects/ProjectTaskGrid'
import DocumentPanel from '@/components/projects/DocumentPanel'
import ArchiveButton from '@/components/projects/ArchiveButton'

export default async function ClientProjectPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>
}) {
  const { id, projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    supabase.from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
  ])
  if (!project) notFound()

  const orgId = membership?.org_id ?? null
  const canManageConfidential = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const isOrgProject = project.org_id !== null

  const orgMembers = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(id, email, full_name)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedOrgMembers = orgId && orgMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembers as any[]).map((m: any) => ({
        userId: m.user_id as string,
        displayName: (m.profiles?.full_name ?? m.profiles?.email ?? m.user_id) as string,
      }))
    : undefined

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}/projects`} className="text-sm font-semibold text-cyan-600 hover:underline">← Projects</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-5 w-5 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: project.colour }} />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">{project.name}</h1>
                {project.description && <p className="mt-2 text-sm font-semibold text-gray-500">{project.description}</p>}
              </div>
            </div>
            <div className="shrink-0">
              <ArchiveButton projectId={project.id} currentStatus={project.status} />
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Tasks</h2>
          <ProjectTaskGrid projectId={project.id} assigneeId={user.id} initialTasks={tasks ?? []} orgMembers={mappedOrgMembers} />
        </div>

        <DocumentPanel
          projectId={project.id}
          userId={user.id}
          initialDocuments={documents ?? []}
          isOrgProject={isOrgProject}
          canManageConfidential={canManageConfidential}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Visit `/dashboard/clients/<clientId>/projects/<projectId>` (use a real id pair from your data). Expected: project header, task tiles, clicking a tile opens the drawer, saving persists and the tile updates.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx"
git commit -m "feat: nested project home with task tiles"
```

---

## Task 5: Client projects grid route

**Files:**
- Create: `src/app/dashboard/clients/[id]/projects/page.tsx`

Lists the client's projects as tiles (with task progress) plus a "New project" entry. Reuses the existing `ClientForm`/project creation pattern via the existing `NewProjectButton` if present; otherwise link to creation. This task assumes project creation already exists on the standalone projects page component `ProjectForm` at `src/components/projects/ProjectForm.tsx` — confirm its props by reading it, and render it with the client pre-bound.

- [ ] **Step 1: Read the project creation component**

Run: read `src/components/projects/ProjectForm.tsx` and note its props (especially how `client_id` and `org_id` are passed). Use those exact prop names below in place of `clientId`/`orgId` if they differ.

- [ ] **Step 2: Write the page**

```tsx
// src/app/dashboard/clients/[id]/projects/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import ProjectForm from '@/components/projects/ProjectForm'

export default async function ClientProjectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, colour, due_date, status, tasks(status)')
    .eq('client_id', id)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const items = (projects ?? []).map(p => {
    const tasks = (p.tasks as { status: string }[]) ?? []
    return {
      id: p.id,
      name: p.name,
      colour: p.colour as string,
      due_date: p.due_date as string | null,
      done: tasks.filter(t => t.status === 'done').length,
      total: tasks.length,
    }
  })

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Projects</h1>

        <ProjectForm orgId={orgId} clientId={id} />

        <TileGrid empty="No projects yet for this client.">
          {items.map(p => (
            <Tile
              key={p.id}
              title={p.name}
              accent={p.colour}
              meta={p.due_date ? `due ${new Date(p.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : undefined}
              progress={p.total > 0 ? { done: p.done, total: p.total } : undefined}
              href={`/dashboard/clients/${id}/projects/${p.id}`}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  )
}
```

> If `ProjectForm` does not accept `clientId`/`orgId` with those names, adjust to the names found in Step 1. If `ProjectForm` cannot bind a client, wrap creation in a small client component that calls the same insert with `client_id: id`; do NOT leave creation out.

- [ ] **Step 3: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 4: Manual smoke**

Visit `/dashboard/clients/<clientId>/projects`. Expected: project tiles with progress bars; "New project" creates a project bound to this client and it appears as a tile linking into its task grid.

- [ ] **Step 5: Commit**

```bash
git add "src/app/dashboard/clients/[id]/projects/page.tsx"
git commit -m "feat: client projects grid"
```

---

## Task 6: Client sessions grid route

**Files:**
- Create: `src/app/dashboard/clients/[id]/sessions/page.tsx`

Lists the client's sessions as tiles (datetime meta, status badge, todo progress), reusing the existing `NewSessionModal`. Mirrors the sessions query already in `src/app/dashboard/clients/[id]/page.tsx`.

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/clients/[id]/sessions/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import NewSessionModal from '@/components/clients/NewSessionModal'

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'green'> = {
  scheduled: 'blue', in_progress: 'amber', completed: 'green',
}
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
}

export default async function ClientSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, status, session_todos(id, completed)')
    .eq('client_id', id)
    .order('scheduled_at', { ascending: true })

  const items = (sessions ?? []).map(s => {
    const todos = (s.session_todos as { completed: boolean }[]) ?? []
    return {
      id: s.id,
      title: s.title as string,
      scheduled_at: s.scheduled_at as string,
      duration: s.duration_minutes as number,
      status: s.status as string,
      done: todos.filter(t => t.completed).length,
      total: todos.length,
    }
  })

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sessions</h1>
          <NewSessionModal clientId={id} orgId={orgId} />
        </div>

        <TileGrid empty="No sessions yet.">
          {items.map(s => (
            <Tile
              key={s.id}
              title={s.title}
              meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min`}
              badge={{ label: STATUS_LABEL[s.status], tone: STATUS_TONE[s.status] }}
              progress={s.total > 0 ? { done: s.done, total: s.total } : undefined}
              href={`/dashboard/clients/${id}/sessions/${s.id}`}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Visit `/dashboard/clients/<clientId>/sessions`. Expected: session tiles; "New session" works; tile links to the existing session detail page.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/clients/[id]/sessions/page.tsx"
git commit -m "feat: client sessions grid"
```

---

## Task 7: Client notes feed route

**Files:**
- Create: `src/app/dashboard/clients/[id]/notes/page.tsx`

Reuses `AddProgressNote` and the notes query already in `src/app/dashboard/clients/[id]/page.tsx`.

- [ ] **Step 1: Write the page**

```tsx
// src/app/dashboard/clients/[id]/notes/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import AddProgressNote from '@/components/clients/AddProgressNote'

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function ClientNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: notes } = await supabase
    .from('progress_notes')
    .select('id, body, created_at, profiles!progress_notes_created_by_fkey(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const notesData = notes ?? []

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Progress notes</h1>

        <AddProgressNote clientId={id} orgId={orgId} />

        <div className="space-y-3">
          {notesData.map(n => {
            const author = (n.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Unknown'
            return (
              <div key={n.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold text-gray-500">{author}</span>
                  <span className="text-xs text-gray-400">{fmtDateTime(n.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-slate-300">{n.body}</p>
              </div>
            )
          })}
          {notesData.length === 0 && <p className="text-sm font-semibold text-gray-400">No notes yet.</p>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/clients/[id]/notes/page.tsx"
git commit -m "feat: client progress-notes feed route"
```

---

## Task 8: Client home → category tiles

**Files:**
- Modify: `src/app/dashboard/clients/[id]/page.tsx` (replace body)

Replaces the sessions/notes/financials layout with three category tiles (Projects, Sessions, Notes) showing counts, plus the existing admin financials `<details>` retained.

- [ ] **Step 1: Replace the page**

```tsx
// src/app/dashboard/clients/[id]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { FolderKanban, CalendarClock, NotebookPen } from 'lucide-react'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'

const fmt = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase
    .from('clients').select('id, name, email, phone, address').eq('id', id).maybeSingle()
  if (!client) notFound()

  const [{ count: projectCount }, { count: sessionCount }, { count: noteCount }] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('client_id', id).eq('archived', false),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('client_id', id),
    supabase.from('progress_notes').select('id', { count: 'exact', head: true }).eq('client_id', id),
  ])

  let invoices: { id: string; invoice_number: string; status: string; issue_date: string; subtotal: number }[] = []
  let sales: { id: string; date: string; amount: number; description: string | null; source_type: string }[] = []
  let outstanding = 0
  let paid = 0
  if (isAdmin) {
    const [{ data: inv }, { data: inc }] = await Promise.all([
      supabase.from('invoices').select('id, invoice_number, status, issue_date, subtotal').eq('client_id', id).order('issue_date', { ascending: false }),
      supabase.from('income_entries').select('id, date, amount, description, source_type').eq('client_id', id).order('date', { ascending: false }),
    ])
    invoices = (inv ?? []) as typeof invoices
    sales = (inc ?? []) as typeof sales
    outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.subtotal), 0)
    paid = sales.reduce((s, r) => s + Number(r.amount), 0)
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">← Clients</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{client.name}</h1>
          {client.email && <p className="mt-1 text-sm text-gray-500">{client.email}</p>}
          {client.phone && <p className="text-sm text-gray-500">{client.phone}</p>}
          {client.address && <p className="mt-1 text-xs text-gray-400">{client.address}</p>}
        </div>

        <TileGrid>
          <Tile title="Projects" icon={FolderKanban} accent="#2563eb" stat={projectCount ?? 0} href={`/dashboard/clients/${id}/projects`} />
          <Tile title="Sessions" icon={CalendarClock} accent="#0891b2" stat={sessionCount ?? 0} href={`/dashboard/clients/${id}/sessions`} />
          <Tile title="Progress notes" icon={NotebookPen} accent="#7c3aed" stat={noteCount ?? 0} href={`/dashboard/clients/${id}/notes`} />
        </TileGrid>

        {isAdmin && (
          <details className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <summary className="cursor-pointer select-none px-6 py-4 text-sm font-bold uppercase tracking-wide text-gray-500">Financial details</summary>
            <div className="space-y-6 px-6 pb-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
                  <p className="mt-1 text-xl font-black text-amber-600">{fmt(outstanding)}</p>
                </div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid</p>
                  <p className="mt-1 text-xl font-black text-green-600">{fmt(paid)}</p>
                </div>
              </div>
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Invoices</h3>
                {invoices.length === 0 ? <p className="text-sm font-semibold text-gray-400">No invoices.</p> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                      {invoices.map(i => (
                        <tr key={i.id}>
                          <td className="py-2"><Link href={`/dashboard/invoices/${i.id}`} className="font-bold text-slate-900 hover:text-cyan-600 dark:text-slate-100">{i.invoice_number}</Link></td>
                          <td className="py-2 text-gray-500">{i.issue_date}</td>
                          <td className="py-2 text-right font-bold">{fmt(Number(i.subtotal))}</td>
                          <td className="py-2 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-gray-400">Sales &amp; payments</h3>
                {sales.length === 0 ? <p className="text-sm font-semibold text-gray-400">No recorded sales.</p> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
                      {sales.map(r => (
                        <tr key={r.id}>
                          <td className="py-2 text-gray-500">{r.date}</td>
                          <td className="py-2 text-gray-600 dark:text-slate-300">{r.description ?? (r.source_type === 'sale' ? 'Walk-in sale' : r.source_type)}</td>
                          <td className="py-2 text-right font-bold text-green-600">{fmt(Number(r.amount))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </details>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 3: Manual smoke**

Visit `/dashboard/clients/<clientId>`. Expected: three category tiles with correct counts, each drilling into its grid; admin financials still collapsible.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/clients/[id]/page.tsx"
git commit -m "feat: client home category tiles"
```

---

## Task 9: Clients list → client tiles

**Files:**
- Modify: `src/app/dashboard/clients/page.tsx`

Replaces `ClientList` with a `TileGrid` of client tiles (admin outstanding shown as a badge). Keeps `ClientForm`/`QuickSaleForm`.

- [ ] **Step 1: Replace the render block**

Replace the `return (...)` block of `src/app/dashboard/clients/page.tsx` with:

```tsx
  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {canAdd && <ClientForm orgId={orgId} />}
        {isAdmin && <QuickSaleForm orgId={orgId} />}
        <div>
          <h2 className="mb-5 text-sm font-bold uppercase tracking-wide text-gray-500">Clients ({clients.length})</h2>
          <TileGrid empty="No clients yet. Add your first.">
            {clients.map(c => (
              <Tile
                key={c.id}
                title={c.name}
                meta={c.email ?? c.phone ?? undefined}
                badge={isAdmin && (c as { outstanding?: number }).outstanding ? { label: fmtCurrency((c as { outstanding: number }).outstanding), tone: 'amber' } : undefined}
                href={`/dashboard/clients/${c.id}`}
              />
            ))}
          </TileGrid>
        </div>
      </div>
    </div>
  )
```

Add these imports at the top of the file:

```tsx
import { Tile, TileGrid } from '@/components/ui/Tile'
```

And add this helper above the component:

```tsx
const fmtCurrency = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n)
```

Remove the now-unused `import ClientList from '@/components/clients/ClientList'`.

- [ ] **Step 2: Build**

Run: `pnpm run build`
Expected: PASS (no unused-import lint error).

- [ ] **Step 3: Manual smoke**

Visit `/dashboard/clients`. Expected: clients render as tiles; admin sees outstanding badge where non-zero; clicking a tile opens the client home.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/clients/page.tsx
git commit -m "feat: clients list as tile grid"
```

---

## Task 10: Retire old project/task routes (redirects)

**Files:**
- Modify: `src/app/dashboard/projects/[id]/page.tsx`
- Modify: `src/app/dashboard/projects/page.tsx`
- Modify: `src/app/dashboard/tasks/page.tsx`

- [ ] **Step 1: Redirect project detail to nested route**

Replace the entire contents of `src/app/dashboard/projects/[id]/page.tsx` with:

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export default async function LegacyProjectRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('client_id').eq('id', id).maybeSingle()
  if (!project?.client_id) notFound()
  redirect(`/dashboard/clients/${project.client_id}/projects/${id}`)
}
```

- [ ] **Step 2: Redirect the projects list**

Replace the entire contents of `src/app/dashboard/projects/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

export default function LegacyProjectsRedirect() {
  redirect('/dashboard/clients')
}
```

- [ ] **Step 3: Redirect the tasks hub**

Replace the entire contents of `src/app/dashboard/tasks/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'

export default function LegacyTasksRedirect() {
  redirect('/dashboard')
}
```

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Visit `/dashboard/projects`, `/dashboard/tasks`, and `/dashboard/projects/<existing-id>`. Expected: redirect to `/dashboard/clients`, `/dashboard`, and the nested project page respectively.

- [ ] **Step 6: Commit**

```bash
git add "src/app/dashboard/projects/[id]/page.tsx" src/app/dashboard/projects/page.tsx src/app/dashboard/tasks/page.tsx
git commit -m "refactor: retire standalone project/task routes as redirects"
```

---

## Task 11: Sidebar — extract `SidebarNav`, new groups, mobile drawer

**Files:**
- Create: `src/components/nav/SidebarNav.tsx`
- Create: `src/components/nav/MobileSidebar.tsx`
- Modify: `src/components/DashboardShell.tsx`

- [ ] **Step 1: Create `SidebarNav`**

```tsx
// src/components/nav/SidebarNav.tsx
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Clock, CalendarDays, Palmtree, Receipt, Users, FileText,
  TrendingUp, BarChart3, CreditCard, Download, HelpCircle, Settings,
  MessageSquare, Sparkles, type LucideIcon,
} from 'lucide-react'
import SignOutButton from '@/components/SignOutButton'
import { useChatUnreadTotal } from '@/components/chat/ChatRealtimeProvider'

type NavItem = { label: string; href: string; icon: LucideIcon }
type NavGroup = { title: string; items: NavItem[] }

export const NAV_GROUPS: NavGroup[] = [
  { title: 'Home', items: [
    { label: 'Home', href: '/dashboard', icon: LayoutDashboard },
  ] },
  { title: 'Delivery', items: [
    { label: 'Clients', href: '/dashboard/clients', icon: Users },
    { label: 'Calendar', href: '/dashboard/calendar', icon: CalendarDays },
    { label: 'Time', href: '/dashboard/time', icon: Clock },
  ] },
  { title: 'Communication', items: [
    { label: 'Chat', href: '/dashboard/chat', icon: MessageSquare },
    { label: 'Assistant', href: '/dashboard/assistant', icon: Sparkles },
  ] },
  { title: 'Money', items: [
    { label: 'Invoices', href: '/dashboard/invoices', icon: FileText },
    { label: 'Expenses', href: '/dashboard/expenses', icon: Receipt },
    { label: 'Finance', href: '/dashboard/finance', icon: TrendingUp },
  ] },
  { title: 'People', items: [
    { label: 'Leave', href: '/dashboard/leave', icon: Palmtree },
  ] },
  { title: 'Insights', items: [
    { label: 'Insights', href: '/dashboard/insights', icon: BarChart3 },
  ] },
]

export const BOTTOM_ITEMS: NavItem[] = [
  { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  { label: 'Download App', href: '/download', icon: Download },
  { label: 'Help', href: '/help', icon: HelpCircle },
  { label: 'Settings', href: '/settings', icon: Settings },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/settings') return pathname === '/settings'
  if (href === '/dashboard') return pathname === href
  return pathname.startsWith(href)
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item.href)
  const Icon = item.icon
  const unread = useChatUnreadTotal()
  const badge = item.href === '/dashboard/chat' && unread > 0 ? (unread > 99 ? '99+' : unread) : null
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? 'border-cyan-400 bg-slate-800 text-cyan-400' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
      }`}
    >
      <Icon size={16} className="shrink-0" />
      {item.label}
      {badge && (
        <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-cyan-500 px-1.5 text-xs font-bold text-white">
          {badge}
        </span>
      )}
    </Link>
  )
}

export default function SidebarNav({ email }: { email: string }) {
  const pathname = usePathname()
  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="mb-8 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl shadow-sm">
          <Image src="/logo.png" alt="TimeWiseHub" width={44} height={44} className="object-contain" />
        </div>
        <div className="min-w-0">
          <p className="font-['Poppins'] text-xl font-black tracking-tight text-white">TimeWiseHub</p>
          <p className="mt-1 text-xs font-medium leading-5 text-slate-400">Track Time. Control Costs. Grow Smarter.</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-0.5 overflow-y-auto">
        {NAV_GROUPS.map(group => (
          <div key={group.title}>
            <p className="mt-6 mb-1 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500">{group.title}</p>
            {group.items.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
          </div>
        ))}
        <div className="my-3 border-t border-slate-800" />
        {BOTTOM_ITEMS.map(item => <NavLink key={item.href} item={item} pathname={pathname} />)}
      </nav>

      <div className="mt-4 rounded-xl bg-slate-800 p-3">
        <p className="truncate text-sm font-semibold text-white">{email}</p>
        <div className="mt-3"><SignOutButton /></div>
      </div>
      <p className="mt-4 text-center text-xs font-semibold tracking-wide text-slate-600">
        Powered by <span className="text-slate-400">Vividex</span>
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Create `MobileSidebar`**

```tsx
// src/components/nav/MobileSidebar.tsx
'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import SidebarNav from '@/components/nav/SidebarNav'

export default function MobileSidebar({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setOpen(false) }, [pathname])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-gray-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <aside className="relative z-10 flex h-full w-72 max-w-[80vw] flex-col bg-slate-900 px-4 py-6">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-xl p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
            <SidebarNav email={email} />
          </aside>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 3: Rewrite `DashboardShell`**

Replace the entire contents of `src/components/DashboardShell.tsx` with:

```tsx
'use client'

import { usePathname } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import SidebarNav from '@/components/nav/SidebarNav'
import MobileSidebar from '@/components/nav/MobileSidebar'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Home',
  '/dashboard/time': 'Time tracking',
  '/dashboard/chat': 'Chat',
  '/dashboard/assistant': 'Assistant',
  '/dashboard/expenses': 'Expenses',
  '/dashboard/clients': 'Clients',
  '/dashboard/invoices': 'Invoices',
  '/dashboard/calendar': 'Calendar',
  '/dashboard/leave': 'Leave',
  '/dashboard/insights': 'Insights',
  '/dashboard/billing': 'Billing',
  '/dashboard/finance': 'Finance',
}

function getTitle(pathname: string) {
  if (pathname.includes('/projects/')) return 'Project'
  if (pathname.includes('/sessions/')) return 'Session'
  if (pathname.endsWith('/projects')) return 'Projects'
  if (pathname.endsWith('/sessions')) return 'Sessions'
  if (pathname.endsWith('/notes')) return 'Progress notes'
  if (pathname.startsWith('/dashboard/clients/')) return 'Client'
  return PAGE_TITLES[pathname] ?? 'TimeWiseHub'
}

function initials(email: string) {
  return email.slice(0, 1).toUpperCase()
}

export default function DashboardShell({
  children,
  email,
}: {
  children: React.ReactNode
  email: string
}) {
  const pathname = usePathname()
  const title = getTitle(pathname)

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto bg-slate-900 px-4 py-6 lg:flex">
        <SidebarNav email={email} />
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white px-4 py-4 sm:px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileSidebar email={email} />
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
                <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Signed in</p>
                <p className="max-w-[220px] truncate text-sm font-bold text-slate-900 dark:text-slate-100">{email}</p>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white shadow-sm">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Desktop: sidebar shows Home / Delivery / Communication / Money / People / Insights; no Projects or Tasks items. Narrow the viewport below `lg`: the horizontal strip is gone; a hamburger appears in the header, opens the slide-over with the same nav, and closes on navigation and on backdrop tap.

- [ ] **Step 6: Commit**

```bash
git add src/components/nav/SidebarNav.tsx src/components/nav/MobileSidebar.tsx src/components/DashboardShell.tsx
git commit -m "feat: reorganised sidebar + mobile hamburger drawer"
```

---

## Task 12: Insights merge (Overview + Activity + Export tabs)

**Files:**
- Create: `src/components/insights/InsightsTabs.tsx`
- Modify: `src/app/dashboard/insights/page.tsx`
- Modify: `src/app/dashboard/reports/page.tsx` (redirect)
- Modify: `src/app/dashboard/activity/page.tsx` (redirect)

The three existing analytics pages render their content from server components. To merge without rewriting their logic, render all three server bodies inside the insights page and switch visible panel client-side.

- [ ] **Step 1: Read the three page bodies**

Read `src/app/dashboard/insights/page.tsx`, `src/app/dashboard/reports/page.tsx`, `src/app/dashboard/activity/page.tsx`. Each default-exports an async server component returning a JSX tree. You will move each returned tree into a named server component so the insights route can render all three.

- [ ] **Step 2: Extract each body into a server panel**

For each page, create a sibling server component exporting the same content:
- `src/app/dashboard/insights/OverviewPanel.tsx` — paste the body of the current insights page (its imports, data fetching, and returned JSX) into `export async function OverviewPanel() { … }` (remove `export default`, drop the `redirect('/login')` guard duplication only if the parent already guards — keep the auth fetch).
- `src/app/dashboard/activity/ActivityPanel.tsx` — same treatment for the activity body as `export async function ActivityPanel()`.
- `src/app/dashboard/reports/ExportPanel.tsx` — same treatment for the reports body as `export async function ExportPanel()`.

Keep each panel's own Supabase data fetching intact (they re-run server-side; acceptable for this app's scale).

- [ ] **Step 3: Create the client tab switcher**

```tsx
// src/components/insights/InsightsTabs.tsx
'use client'

import { useState } from 'react'

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'activity', label: 'Activity' },
  { key: 'export', label: 'Export' },
] as const

export default function InsightsTabs({
  defaultTab,
  overview,
  activity,
  exportPanel,
}: {
  defaultTab: 'overview' | 'activity' | 'export'
  overview: React.ReactNode
  activity: React.ReactNode
  exportPanel: React.ReactNode
}) {
  const [tab, setTab] = useState<'overview' | 'activity' | 'export'>(defaultTab)
  return (
    <div>
      <div className="mb-6 flex gap-1 border-b border-gray-200 dark:border-slate-800">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-bold transition-colors ${
              tab === t.key ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'overview'}>{overview}</div>
      <div hidden={tab !== 'activity'}>{activity}</div>
      <div hidden={tab !== 'export'}>{exportPanel}</div>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite the insights page to host the tabs**

Replace the contents of `src/app/dashboard/insights/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import InsightsTabs from '@/components/insights/InsightsTabs'
import { OverviewPanel } from './OverviewPanel'
import { ActivityPanel } from '../activity/ActivityPanel'
import { ExportPanel } from '../reports/ExportPanel'

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { tab } = await searchParams
  const defaultTab = tab === 'activity' || tab === 'export' ? tab : 'overview'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <InsightsTabs
          defaultTab={defaultTab}
          overview={<OverviewPanel />}
          activity={<ActivityPanel />}
          exportPanel={<ExportPanel />}
        />
      </div>
    </div>
  )
}
```

> Note: server components can be passed as `children`/props into a client component (`InsightsTabs`) — they are rendered on the server and handed over as already-rendered nodes. This is the supported RSC pattern.

- [ ] **Step 5: Redirect reports and activity**

Replace the contents of `src/app/dashboard/reports/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
export default function LegacyReportsRedirect() {
  redirect('/dashboard/insights?tab=export')
}
```

Replace the contents of `src/app/dashboard/activity/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
export default function LegacyActivityRedirect() {
  redirect('/dashboard/insights?tab=activity')
}
```

> The extracted panels (`OverviewPanel`, `ActivityPanel`, `ExportPanel`) now live beside these route files and are imported by the insights page; the route files themselves only redirect.

- [ ] **Step 6: Build**

Run: `pnpm run build`
Expected: PASS. If a panel body referenced `redirect('/login')` and now triggers a lint "unused import" in the route file, remove the unused import.

- [ ] **Step 7: Manual smoke**

Visit `/dashboard/insights` — three tabs render the former three pages. Visit `/dashboard/reports` → lands on Insights with Export tab; `/dashboard/activity` → Activity tab.

- [ ] **Step 8: Commit**

```bash
git add src/components/insights/InsightsTabs.tsx src/app/dashboard/insights/ src/app/dashboard/reports/ src/app/dashboard/activity/
git commit -m "feat: merge Reports + Activity into Insights tabs"
```

---

## Task 13: Home — "My Work"

**Files:**
- Create: `src/components/home/MyWork.tsx`
- Modify: `src/app/dashboard/page.tsx`

Home shows my assigned tasks (across all projects/clients) as task tiles opening the same drawer, plus my upcoming sessions. The manager unassigned-pool carries over from the retired tasks page.

- [ ] **Step 1: Read the current dashboard page and old tasks page**

Read `src/app/dashboard/page.tsx` (to preserve any greeting/org bootstrap it does) and the pre-redirect `src/app/dashboard/tasks/page.tsx` content from git (`git show HEAD~<n>:src/app/dashboard/tasks/page.tsx`) to recover the unassigned-pool query + assign UI. Reuse that pool component as-is if it is a separate component (e.g. `TaskPool`); note its import path.

- [ ] **Step 2: Create the My Work client component**

```tsx
// src/components/home/MyWork.tsx
'use client'

import { useState } from 'react'
import { Tile, TileGrid } from '@/components/ui/Tile'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const STATUS_TONE: Record<string, 'gray' | 'amber' | 'green'> = { todo: 'gray', in_progress: 'amber', done: 'green' }
const STATUS_LABEL: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', done: 'Done' }

export default function MyWork({
  myTasks,
  orgMembers,
}: {
  myTasks: (DrawerTask & { projectName: string | null; clientId: string | null })[]
  orgMembers?: { userId: string; displayName: string }[]
}) {
  const [tasks, setTasks] = useState(myTasks)
  const [active, setActive] = useState<DrawerTask | null>(null)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">My tasks</h2>
      <TileGrid empty="Nothing assigned to you right now.">
        {tasks.map(t => (
          <Tile
            key={t.id}
            title={t.title}
            meta={[t.projectName ?? '', t.due_date ? `due ${new Date(t.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : ''].filter(Boolean).join(' · ') || undefined}
            badge={{ label: STATUS_LABEL[t.status], tone: STATUS_TONE[t.status] }}
            onClick={() => setActive(t)}
          />
        ))}
      </TileGrid>
      {active && (
        <TaskDrawer
          task={active}
          orgMembers={orgMembers}
          onClose={() => setActive(null)}
          onSaved={u => setTasks(prev => prev.map(t => (t.id === u.id ? { ...t, ...u } : t)))}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Rewrite the dashboard page**

Replace the contents of `src/app/dashboard/page.tsx` with the following. If the existing page performed org/subscription bootstrap that must run, preserve those fetches above the render (read in Step 1 and re-add them); the block below covers the My Work data and is the minimum required.

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import MyWork from '@/components/home/MyWork'

export default async function DashboardHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: rawTasks } = await supabase
    .from('tasks')
    .select('id, title, priority, status, due_date, notes, assignee_id, completed_at, projects(name, client_id)')
    .eq('assignee_id', user.id)
    .neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myTasks = (rawTasks ?? []).map((t: any) => ({
    id: t.id, title: t.title, priority: t.priority, status: t.status,
    due_date: t.due_date, notes: t.notes, assignee_id: t.assignee_id, completed_at: t.completed_at,
    projectName: t.projects?.name ?? null,
    clientId: t.projects?.client_id ?? null,
  }))

  const orgMembers = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedMembers = orgMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembers as any[]).map((m: any) => ({ userId: m.user_id as string, displayName: (m.profiles?.full_name ?? m.profiles?.email ?? m.user_id) as string }))
    : undefined

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">My Work</h1>
          <p className="mt-1 text-sm text-gray-500">
            Jump to <Link href="/dashboard/clients" className="font-semibold text-cyan-600 hover:underline">Clients</Link> to browse projects and sessions.
          </p>
        </div>
        <MyWork myTasks={myTasks} orgMembers={mappedMembers} />
      </div>
    </div>
  )
}
```

> Manager unassigned-pool: if Step 1 recovered a reusable pool component, render it below `<MyWork>` gated on `['owner','admin','manager'].includes(membership?.role ?? '')`, passing the same `mappedMembers`. If the pool was inline JSX in the old tasks page, recreate it as `src/components/home/UnassignedPool.tsx` (a client component querying `tasks` where `assignee_id is null` and `org_id = orgId`, with an assign `<select>` updating `assignee_id`) and render it here. Do not silently drop the pool — it is a required capability per the spec (§E).

- [ ] **Step 4: Build**

Run: `pnpm run build`
Expected: PASS.

- [ ] **Step 5: Manual smoke**

Visit `/dashboard`. Expected: "My Work" with my open tasks as tiles (drawer opens/edits/persists). On a manager account, the unassigned pool appears and assigning a task removes it from the pool.

- [ ] **Step 6: Commit**

```bash
git add src/components/home/MyWork.tsx src/app/dashboard/page.tsx
git commit -m "feat: Home repurposed as My Work"
```

---

## Final verification

- [ ] **Full build:** `pnpm run build` passes clean.
- [ ] **Flow smoke:** Clients grid → client home category tiles → Projects grid → project task grid → task drawer edit persists → back; Sessions grid → existing session detail; Notes feed add/view.
- [ ] **Redirect smoke:** `/dashboard/projects`, `/dashboard/tasks`, `/dashboard/projects/<id>`, `/dashboard/reports`, `/dashboard/activity` all redirect correctly.
- [ ] **Nav smoke:** new sidebar groups; no Projects/Tasks items; mobile hamburger opens/closes the drawer; Insights tabs render all three former pages.
- [ ] **Two-account check:** a non-admin sees no admin-only financials on the client home; a manager sees the unassigned pool on Home.

---

## Notes for the implementer
- This repo has **no test runner**; verification is `pnpm run build` + the manual smokes above. Do not add Jest/Vitest.
- Supabase FK joins infer as arrays in TS; when a join is single-valued use the `as unknown as { … } | null` cast already used in `clients/[id]/page.tsx`.
- The `tasks` rows used by tiles/drawer must carry the full `DrawerTask` shape (`id, title, priority, status, due_date, notes, assignee_id, completed_at`); always select those columns.
- Keep file responsibilities tight: `Tile.tsx` is presentation only; data shaping happens in the server pages.
