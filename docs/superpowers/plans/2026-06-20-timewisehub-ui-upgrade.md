# TimeWiseHub UI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade every major page to premium dark-first enterprise SaaS quality, matching Linear/Monday.com aesthetics, while preserving 100% of existing backend logic, Supabase queries, routing, and auth.

**Architecture:** Additive approach — new metric/chart components sit alongside existing ones; page layouts are restructured but all data flows remain identical. `defaultTheme="dark"` sets dark as the out-of-box experience. Recharts added only for Insights revenue chart.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Recharts (new dependency), Supabase (unchanged), Lucide icons.

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `src/components/dashboard/DashboardMetrics.tsx` | 4-card metric grid (hours / projects / tasks / clients) |
| `src/components/dashboard/QuickActions.tsx` | 4 quick-action link buttons |
| `src/components/insights/RevenueChart.tsx` | Recharts area chart — revenue vs expenses last 6 months |

### Modified files
| File | Change |
|------|--------|
| `src/app/layout.tsx` | `defaultTheme="dark"` |
| `src/components/DashboardShell.tsx` | Dark-first header; remove light-mode flicker |
| `src/components/nav/SidebarNav.tsx` | Premium active indicator glow; tighter section headers |
| `src/app/dashboard/page.tsx` | Add 4 metric queries; render DashboardMetrics + QuickActions |
| `src/components/home/MyWork.tsx` | Dark card task rows with priority badge colours |
| `src/app/dashboard/invoices/page.tsx` | 4 metric cards (outstanding / paid FY / draft / overdue) |
| `src/components/invoices/InvoiceTable.tsx` | Premium dark table rows with status pill colours |
| `src/app/dashboard/insights/OverviewPanel.tsx` | Add income_entries query; render RevenueChart above existing bars |
| `src/components/insights/StatCard.tsx` | Dark surface, glow accent border |
| `src/components/insights/BarChart.tsx` | Dark SVG bars with gradient fill |
| `src/components/AssistantWidget.tsx` | Better bubbles; add suggested-action chips at bottom |
| `src/app/dashboard/roster/page.tsx` | Pass leave_requests to RosterGrid for availability dots |
| `src/components/roster/RosterGrid.tsx` | Availability status column; employee card polish |

---

## Task 1: Dark mode default

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Change defaultTheme to dark**

In `src/app/layout.tsx` find:
```tsx
<ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="twh-theme">
```
Replace with:
```tsx
<ThemeProvider attribute="class" defaultTheme="dark" enableSystem storageKey="twh-theme">
```

- [ ] **Step 2: Conductor runs build + commit**
```bash
pnpm run build
git add src/app/layout.tsx
git commit -m "feat: default to dark mode"
```

---

## Task 2: Install Recharts

**Conductor only (shell command — not a Codex edit):**

- [ ] **Step 1: Install**
```bash
pnpm add recharts
```

- [ ] **Step 2: Verify build still passes**
```bash
pnpm run build
git add pnpm-lock.yaml package.json
git commit -m "chore: add recharts"
```

---

## Task 3: DashboardShell — dark-first header

**Files:**
- Modify: `src/components/DashboardShell.tsx`

The header currently uses `bg-white dark:bg-slate-900`. We want it always dark, consistent with the sidebar.

- [ ] **Step 1: Update the shell**

Replace the entire `return (...)` block (starting at `return (` after the two bypass checks) with:

```tsx
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col overflow-y-auto bg-slate-900 px-4 py-6 lg:flex">
        <SidebarNav email={email} />
      </aside>

      <div className="lg:pl-64">
        <header
          className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/95 backdrop-blur px-4 sm:px-8"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: '1rem' }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <MobileSidebar email={email} />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-500">TimeWiseHub</p>
                <h1 className="font-['Poppins'] text-xl font-black tracking-tight text-white">{title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Signed in</p>
                <p className="max-w-[200px] truncate text-xs font-semibold text-slate-300">{email}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500 text-sm font-black text-white shadow-lg shadow-cyan-500/30">
                {initials(email)}
              </div>
            </div>
          </div>
        </header>

        <main>{children}</main>
      </div>
    </div>
  )
```

- [ ] **Step 2: Conductor build + commit**
```bash
pnpm run build
git add src/components/DashboardShell.tsx
git commit -m "polish: dark-first dashboard shell header"
```

---

## Task 4: SidebarNav — active glow + section header polish

**Files:**
- Modify: `src/components/nav/SidebarNav.tsx`

- [ ] **Step 1: Update NavLink active state to include a cyan glow**

Find the `className` on the `<Link>` inside `NavLink`. Replace:
```tsx
className={`flex items-center gap-3 rounded-xl border-l-2 px-3 py-2.5 text-sm font-medium transition-colors ${
  active ? 'border-cyan-400 bg-slate-800 text-cyan-400' : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-white'
} ${isBlocked ? 'pointer-events-none opacity-30' : ''} ${isSpotlit ? 'relative' : ''}`}
```
With:
```tsx
className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
  active
    ? 'bg-cyan-500/10 text-cyan-400 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]'
    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
} ${isBlocked ? 'pointer-events-none opacity-30' : ''} ${isSpotlit ? 'relative' : ''}`}
```

- [ ] **Step 2: Conductor build + commit**
```bash
pnpm run build
git add src/components/nav/SidebarNav.tsx
git commit -m "polish: sidebar active glow, remove border-l style"
```

---

## Task 5: Dashboard page — metric queries

**Files:**
- Modify: `src/app/dashboard/page.tsx`

Add 4 parallel Supabase queries for the metric cards. These run after the existing queries.

- [ ] **Step 1: Add metric queries**

After the existing `assignedTasks` queries block (after the closing `}` of the `if (isManager && orgId)` block, before `return (`), insert:

```tsx
  // Metric card data
  const now = new Date()
  const dow = now.getDay()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((dow + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)

  const [timeRes, projectsRes, tasksRes, clientsRes] = await Promise.all([
    supabase
      .from('time_entries')
      .select('duration_seconds')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .gte('started_at', weekStart.toISOString()),
    orgId
      ? supabase.from('projects').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active')
      : supabase.from('projects').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('status', 'active'),
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assignee_id', user.id)
      .eq('status', 'done')
      .gte('completed_at', weekStart.toISOString()),
    orgId
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('archived', false)
      : supabase.from('clients').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('archived', false),
  ])

  const hoursThisWeek = (timeRes.data ?? []).reduce((s: number, e: { duration_seconds: number | null }) => s + (e.duration_seconds ?? 0), 0) / 3600
  const activeProjects = projectsRes.count ?? 0
  const tasksThisWeek = tasksRes.count ?? 0
  const activeClients = clientsRes.count ?? 0
```

- [ ] **Step 2: Add imports for new components**

At the top of the file, after the existing imports, add:
```tsx
import DashboardMetrics from '@/components/dashboard/DashboardMetrics'
import QuickActions from '@/components/dashboard/QuickActions'
```

- [ ] **Step 3: Update the return JSX**

Replace the entire `return (...)` block with:

```tsx
  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-black text-white">
            {firstName ? `Hi, ${firstName} 👋` : 'Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Here&apos;s what&apos;s happening across your business today.
          </p>
        </div>

        <WelcomeBanner firstName={firstName} />
        <NudgeBanner userId={user.id} />

        {/* Metric cards */}
        <DashboardMetrics
          hoursThisWeek={hoursThisWeek}
          activeProjects={activeProjects}
          tasksThisWeek={tasksThisWeek}
          activeClients={activeClients}
        />

        {/* Quick actions */}
        <QuickActions />

        {/* My tasks */}
        <MyWork myTasks={myTasks} orgMembers={mappedMembers} />

        {isManager && poolTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Unassigned tasks</h2>
            <TaskPool
              initialTasks={poolTasks}
              orgMembers={mappedMembers ?? []}
              currentUserId={user.id}
              currentUserRole={role}
            />
          </div>
        )}

        {isManager && assignedTasks.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">Team tasks</h2>
            <TeamTasks
              initialTasks={assignedTasks}
              orgMembers={mappedMembers ?? []}
            />
          </div>
        )}

        {isManager && orgId && (
          <PendingApprovals orgId={orgId} userId={user.id} role={role} />
        )}

        {isManager && orgId && (
          <OrgDocuments orgId={orgId} />
        )}
      </div>
    </div>
  )
```

- [ ] **Step 4: Conductor build**
```bash
pnpm run build
# Fix any TypeScript errors before committing
```

---

## Task 6: Create DashboardMetrics component

**Files:**
- Create: `src/components/dashboard/DashboardMetrics.tsx`

- [ ] **Step 1: Create the file**

```tsx
import { Clock, FolderOpen, CheckSquare, Users } from 'lucide-react'

type Props = {
  hoursThisWeek: number
  activeProjects: number
  tasksThisWeek: number
  activeClients: number
}

type CardProps = {
  icon: React.ElementType
  value: string
  label: string
  iconClass: string
  glowClass: string
}

function MetricCard({ icon: Icon, value, label, iconClass, glowClass }: CardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className={`absolute -right-4 -top-4 h-24 w-24 rounded-full opacity-10 blur-2xl ${glowClass}`} />
      <div className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${iconClass}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</p>
    </div>
  )
}

export default function DashboardMetrics({ hoursThisWeek, activeProjects, tasksThisWeek, activeClients }: Props) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard
        icon={Clock}
        value={`${hoursThisWeek.toFixed(1)}h`}
        label="Hours this week"
        iconClass="bg-cyan-500/15 text-cyan-400"
        glowClass="bg-cyan-500"
      />
      <MetricCard
        icon={FolderOpen}
        value={String(activeProjects)}
        label="Active projects"
        iconClass="bg-violet-500/15 text-violet-400"
        glowClass="bg-violet-500"
      />
      <MetricCard
        icon={CheckSquare}
        value={String(tasksThisWeek)}
        label="Tasks completed"
        iconClass="bg-emerald-500/15 text-emerald-400"
        glowClass="bg-emerald-500"
      />
      <MetricCard
        icon={Users}
        value={String(activeClients)}
        label="Active clients"
        iconClass="bg-amber-500/15 text-amber-400"
        glowClass="bg-amber-500"
      />
    </div>
  )
}
```

- [ ] **Step 2: Conductor build + commit**
```bash
pnpm run build
git add src/components/dashboard/DashboardMetrics.tsx src/app/dashboard/page.tsx
git commit -m "feat: dashboard metric cards — hours, projects, tasks, clients"
```

---

## Task 7: Create QuickActions component

**Files:**
- Create: `src/components/dashboard/QuickActions.tsx`

- [ ] **Step 1: Create the file**

```tsx
import Link from 'next/link'
import { UserPlus, FileText, Clock, Video } from 'lucide-react'

const ACTIONS = [
  { label: 'New Client',       href: '/dashboard/clients',      icon: UserPlus, colours: 'text-cyan-400   bg-cyan-500/10   hover:bg-cyan-500/20   border-cyan-500/20' },
  { label: 'New Invoice',      href: '/dashboard/invoices/new', icon: FileText, colours: 'text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/20' },
  { label: 'Start Timer',      href: '/dashboard/time',         icon: Clock,    colours: 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20' },
  { label: 'Schedule Meeting', href: '/dashboard/video',        icon: Video,    colours: 'text-amber-400  bg-amber-500/10  hover:bg-amber-500/20  border-amber-500/20' },
]

export default function QuickActions() {
  return (
    <div>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Quick actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {ACTIONS.map(a => (
          <Link
            key={a.href}
            href={a.href}
            className={`flex items-center gap-3 rounded-2xl border p-4 transition-colors ${a.colours}`}
          >
            <a.icon size={18} className="shrink-0" />
            <span className="text-sm font-semibold text-slate-200">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Conductor build + commit**
```bash
pnpm run build
git add src/components/dashboard/QuickActions.tsx
git commit -m "feat: dashboard quick actions (client / invoice / timer / meeting)"
```

---

## Task 8: MyWork task list — dark premium styling

**Files:**
- Modify: `src/components/home/MyWork.tsx`

The existing component uses `<Tile>` / `<TileGrid>`. Replace with a custom dark card list that shows priority badges clearly.

- [ ] **Step 1: Rewrite MyWork**

Replace entire file contents with:

```tsx
'use client'

import { useState } from 'react'
import TaskDrawer, { type DrawerTask } from '@/components/projects/TaskDrawer'

const PRIORITY_CONFIG: Record<string, { label: string; classes: string }> = {
  urgent: { label: 'Urgent', classes: 'bg-red-500/15 text-red-400 border-red-500/30' },
  high:   { label: 'High',   classes: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  normal: { label: 'Normal', classes: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  low:    { label: 'Low',    classes: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
}

const STATUS_CONFIG: Record<string, { label: string; dot: string }> = {
  todo:        { label: 'To Do',       dot: 'bg-slate-500' },
  in_progress: { label: 'In Progress', dot: 'bg-amber-400' },
  done:        { label: 'Done',        dot: 'bg-emerald-400' },
}

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
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">My tasks</h2>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <p className="text-sm font-semibold text-slate-500">Nothing assigned to you right now.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
          {tasks.map((t, i) => {
            const priority = PRIORITY_CONFIG[t.priority] ?? PRIORITY_CONFIG.normal
            const status = STATUS_CONFIG[t.status] ?? STATUS_CONFIG.todo
            const dueLabel = t.due_date
              ? new Date(t.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
              : null
            return (
              <button
                key={t.id}
                onClick={() => setActive(t)}
                className={`flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-800/60 ${
                  i < tasks.length - 1 ? 'border-b border-slate-800' : ''
                }`}
              >
                <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${status.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">{t.title}</p>
                  {t.projectName && (
                    <p className="mt-0.5 truncate text-xs text-slate-500">{t.projectName}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {dueLabel && (
                    <span className="text-xs font-medium text-slate-500">{dueLabel}</span>
                  )}
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-bold ${priority.classes}`}>
                    {priority.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {active && (
        <TaskDrawer
          task={active}
          orgMembers={orgMembers}
          onClose={() => setActive(null)}
          onSaved={u => setTasks(prev => prev.map(t => (t.id === u.id ? { ...t, ...u } : t)))}
          onDeleted={id => setTasks(prev => prev.filter(t => t.id !== id))}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Conductor build + commit**
```bash
pnpm run build
git add src/components/home/MyWork.tsx
git commit -m "polish: dark premium task list rows with priority badges"
```

---

## Task 9: Invoices page — 4 metric cards

**Files:**
- Modify: `src/app/dashboard/invoices/page.tsx`

Add draft and overdue counts to the existing 2-card layout, making it a 4-card grid.

- [ ] **Step 1: Add draft and overdue counts**

After the `totalPaid` calculation, add:
```tsx
  const draftCount = (invoices ?? []).filter(i => i.status === 'draft').length
  const overdueCount = (invoices ?? []).filter(i => i.status === 'overdue').length
```

- [ ] **Step 2: Replace the summary cards JSX**

Replace the `{/* Summary cards */}` div entirely with:

```tsx
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Outstanding</p>
            <p className="mt-2 text-2xl font-black text-amber-400">${totalOutstanding.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Paid (FY{String(fyStartYear).slice(2)}–{String(fyStartYear + 1).slice(2)})</p>
            <p className="mt-2 text-2xl font-black text-emerald-400">${totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Drafts</p>
            <p className="mt-2 text-2xl font-black text-slate-300">{draftCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Overdue</p>
            <p className="mt-2 text-2xl font-black text-red-400">{overdueCount}</p>
          </div>
        </div>
```

Also replace the `+ New invoice` button below the cards. It currently sits in a `col-span-2 sm:col-span-1` cell. Move it to after the grid as a standalone row:

```tsx
        <div className="flex justify-end">
          <Link href="/dashboard/invoices/new"
            className="rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-600 shadow-lg shadow-cyan-500/20">
            + New invoice
          </Link>
        </div>
```

- [ ] **Step 3: Conductor build + commit**
```bash
pnpm run build
git add src/app/dashboard/invoices/page.tsx
git commit -m "feat: invoices 4-card metrics (outstanding / paid FY / drafts / overdue)"
```

---

## Task 10: Invoice table — dark premium rows

**Files:**
- Modify: `src/components/invoices/InvoiceTable.tsx`

Read this file first to understand current structure, then upgrade the status pill colours and row styling to dark slate.

- [ ] **Step 1: Read the file**
Path: `src/components/invoices/InvoiceTable.tsx`

- [ ] **Step 2: Update status badge colour map**

Find the status badge styling (look for `paid`, `sent`, `overdue`, `draft` string conditions). Update to:
```tsx
const STATUS_STYLES: Record<string, string> = {
  paid:     'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  sent:     'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  overdue:  'bg-red-500/15 text-red-400 border border-red-500/30',
  draft:    'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  quote:    'bg-violet-500/15 text-violet-400 border border-violet-500/30',
}
```

Apply these to each status pill as `className={STATUS_STYLES[invoice.status] ?? STATUS_STYLES.draft}`.

- [ ] **Step 3: Update table/card container**

Wrap the table or card list in `rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden`. Table headers should use `bg-slate-800/50 text-xs font-bold uppercase tracking-widest text-slate-500`. Row hover should be `hover:bg-slate-800/60`.

- [ ] **Step 4: Conductor build + commit**
```bash
pnpm run build
git add src/components/invoices/InvoiceTable.tsx
git commit -m "polish: invoice table dark rows + coloured status pills"
```

---

## Task 11: Insights — Revenue vs Expenses chart (Recharts)

**Files:**
- Create: `src/components/insights/RevenueChart.tsx`
- Modify: `src/app/dashboard/insights/OverviewPanel.tsx`

### 11a — Create RevenueChart

- [ ] **Step 1: Create `src/components/insights/RevenueChart.tsx`**

```tsx
'use client'

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type MonthPoint = { month: string; revenue: number; expenses: number }

export default function RevenueChart({ data }: { data: MonthPoint[] }) {
  if (data.length === 0) return null
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <p className="mb-4 text-sm font-bold text-slate-300">Revenue vs Expenses — last 6 months</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, fontSize: 12 }}
            formatter={(value: number) => [`$${value.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`, '']}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#22d3ee" strokeWidth={2} fill="url(#revGrad)" />
          <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#7c3aed" strokeWidth={2} fill="url(#expGrad)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### 11b — Add income_entries query to OverviewPanel

- [ ] **Step 2: Add 6-month income + expense query in `OverviewPanel.tsx`**

In `OverviewPanel.tsx`, after the `sixMonthsAgo`/`monthStart` date setup (add this date calculation if it doesn't exist):
```tsx
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().slice(0, 10)
```

Add to the `Promise.all` array (alongside existing queries):
```tsx
    // Revenue last 6 months
    orgId
      ? supabase.from('income_entries').select('date, amount').eq('org_id', orgId).gte('date', sixMonthsAgoStr)
      : supabase.from('income_entries').select('date, amount').eq('user_id', user.id).gte('date', sixMonthsAgoStr),
    // Expenses last 6 months
    orgId
      ? supabase.from('expenses').select('expense_date, amount').eq('org_id', orgId).gte('expense_date', sixMonthsAgoStr)
      : supabase.from('expenses').select('expense_date, amount').eq('user_id', user.id).gte('expense_date', sixMonthsAgoStr),
```

After the Promise.all, build the chart data:
```tsx
  // Build monthly revenue vs expenses for chart
  const monthLabels = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1)
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }) }
  })

  // incomeResult and expenseResult are the last two items destructured from Promise.all
  const revenueChartData = monthLabels.map(({ key, label }) => ({
    month: label,
    revenue: (incomeResult.data ?? []).filter((e: { date: string }) => e.date.startsWith(key)).reduce((s: number, e: { amount: string | number }) => s + Number(e.amount), 0),
    expenses: (expenseResult.data ?? []).filter((e: { expense_date: string }) => e.expense_date.startsWith(key)).reduce((s: number, e: { amount: string | number }) => s + Number(e.amount), 0),
  }))
```

- [ ] **Step 3: Import and render RevenueChart**

Add import at top of OverviewPanel.tsx:
```tsx
import RevenueChart from '@/components/insights/RevenueChart'
```

In the return JSX, add before the existing `<BarChart>` grid:
```tsx
      <RevenueChart data={revenueChartData} />
```

- [ ] **Step 4: Conductor build + commit**
```bash
pnpm run build
git add src/components/insights/RevenueChart.tsx src/app/dashboard/insights/OverviewPanel.tsx
git commit -m "feat: insights revenue vs expenses area chart (Recharts)"
```

---

## Task 12: Insights StatCard — dark surface upgrade

**Files:**
- Modify: `src/components/insights/StatCard.tsx`

- [ ] **Step 1: Read the file**
Path: `src/components/insights/StatCard.tsx`

- [ ] **Step 2: Update card surface to dark slate**

Find any `bg-white` or `bg-gray-50` and replace with `bg-slate-900`. Find any `border-gray-100` and replace with `border-slate-800`. Find any `text-gray-900` and replace with `text-white`. Find any `text-gray-500` and replace with `text-slate-400`.

- [ ] **Step 3: Conductor build + commit**
```bash
pnpm run build
git add src/components/insights/StatCard.tsx
git commit -m "polish: insights stat cards dark surface"
```

---

## Task 13: Roster — availability indicators

**Files:**
- Modify: `src/app/dashboard/roster/page.tsx`
- Modify: `src/components/roster/RosterGrid.tsx`

### 13a — Query today's leave in roster/page.tsx

- [ ] **Step 1: Add leave query to roster page**

After the memberListRaw is built, add:
```tsx
  const todayStr = new Date().toISOString().slice(0, 10)
  const memberIds = memberListRaw.map(m => m.user_id)
  const { data: activeLeave } = memberIds.length > 0
    ? await supabase
        .from('leave_requests')
        .select('user_id, leave_type, status')
        .in('user_id', memberIds)
        .in('status', ['approved', 'pending'])
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
    : { data: [] }

  const leaveMap: Record<string, string> = {}
  ;(activeLeave ?? []).forEach((l: { user_id: string; leave_type: string; status: string }) => {
    leaveMap[l.user_id] = l.leave_type
  })
```

Pass `leaveMap` to `RosterGrid`:
```tsx
<RosterGrid ... leaveToday={leaveMap} />
```

### 13b — Add availability column to RosterGrid

- [ ] **Step 2: Read `src/components/roster/RosterGrid.tsx`**

- [ ] **Step 3: Add leaveToday prop and availability dot**

Add `leaveToday?: Record<string, string>` to the component's Props type.

In the member name column of the grid, add a coloured dot before the name:
```tsx
const leaveType = leaveToday?.[member.user_id]
const dot = leaveType === undefined
  ? 'bg-emerald-400'           // available
  : leaveType === 'sick'
    ? 'bg-red-400'             // sick leave
    : 'bg-amber-400'           // annual/personal/other leave

// Render alongside member name:
<span className={`inline-block h-2 w-2 rounded-full ${dot} mr-2 shrink-0`} />
```

- [ ] **Step 4: Conductor build + commit**
```bash
pnpm run build
git add src/app/dashboard/roster/page.tsx src/components/roster/RosterGrid.tsx
git commit -m "feat: roster availability dots — green/amber/red per leave status"
```

---

## Task 14: AI Assistant — suggested action chips + bubble polish

**Files:**
- Modify: `src/components/AssistantWidget.tsx`

- [ ] **Step 1: Add suggested action chips**

Read the file (already partially read to line 80 above — read from line 80 onwards to see the JSX).

Find the initial message render area. After the messages list and before the input bar, add a suggested actions section that only shows when `messages.length === 1` (only the initial greeting is showing):

```tsx
{messages.length === 1 && (
  <div className="px-4 pb-2 flex flex-wrap gap-2">
    {[
      'Summarise this week',
      'Check outstanding invoices',
      'What tasks are overdue?',
      'Log time for today',
      'Show active projects',
    ].map(suggestion => (
      <button
        key={suggestion}
        type="button"
        onClick={() => setInput(suggestion)}
        className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-400"
      >
        {suggestion}
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 2: Polish message bubbles**

Find where user messages are rendered. Update their container classes:
- User bubble: `bg-cyan-500 text-white rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%] text-sm`
- Assistant bubble: `bg-slate-800 text-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[80%] text-sm border border-slate-700`
- Notice/system: `bg-slate-900 text-slate-500 rounded-xl px-3 py-2 text-xs italic border border-slate-800`

- [ ] **Step 3: Update widget container**

The widget's outer `<div>` background should be `bg-slate-950` with `border border-slate-800`. Header should be `bg-slate-900/95 backdrop-blur border-b border-slate-800`.

- [ ] **Step 4: Conductor build + commit**
```bash
pnpm run build
git add src/components/AssistantWidget.tsx
git commit -m "polish: AI assistant suggested chips + premium dark bubbles"
```

---

## Task 15: Insights BarChart — dark gradient bars

**Files:**
- Modify: `src/components/insights/BarChart.tsx`

- [ ] **Step 1: Read the file**
Path: `src/components/insights/BarChart.tsx`

- [ ] **Step 2: Update SVG bar fill**

The custom SVG bars use a solid colour fill. Update the bar `fill` to use `#22d3ee` (cyan) with reduced opacity for empty state and full opacity for filled. Update container to `bg-slate-900 border-slate-800`.

If bars use `className` with Tailwind color classes, change filled bar from `fill-blue-500` or similar to `fill-cyan-500` and background bars to `fill-slate-800`.

- [ ] **Step 3: Conductor build + commit**
```bash
pnpm run build
git add src/components/insights/BarChart.tsx
git commit -m "polish: insights bar chart cyan gradient, dark surface"
```

---

## Task 16: Final global polish pass

**Files:**
- Review and update globals.css if needed
- Spot-check any remaining `bg-white` in dashboard components that predate dark mode

- [ ] **Step 1: Audit**

Run a grep for `bg-white` and `bg-gray-50` in `src/components/home/` and `src/components/finance/`. For any component that hasn't been given an explicit dark override yet and is visible in the dashboard, add `dark:bg-slate-900` and `dark:border-slate-800` alongside existing light-mode classes.

- [ ] **Step 2: Conductor build + final commit**
```bash
pnpm run build
git add -p  # stage only confirmed changes
git commit -m "polish: final dark mode audit across dashboard components"
git push
```

---

## Execution order

Run tasks in sequence. Each task ends with a build gate — do not proceed if build fails.

1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

Tasks 1 and 2 are **conductor-only** (shell commands). All remaining odd-numbered tasks within each group are **Codex text edits**; even-numbered sub-steps marked "Conductor" are **shell commands**.
