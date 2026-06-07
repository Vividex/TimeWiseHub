import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import StatCard from '@/components/insights/StatCard'
import BarChart, { type DayBar } from '@/components/insights/BarChart'
import ActivityRatio from '@/components/insights/ActivityRatio'
import ProjectBreakdown, { type ProjectBar } from '@/components/insights/ProjectBreakdown'
import ProjectHealthTable, { type ProjectHealth } from '@/components/insights/ProjectHealthTable'
import OrgStatsPanel, { type MemberStat } from '@/components/insights/OrgStatsPanel'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

function fmtHours(h: number) {
  if (h < 1) return `${Math.round(h * 60)}m`
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`
}

export default async function InsightsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)

  // Monday of current week
  const dow = now.getDay()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((dow + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStartStr = monthStart.toISOString().slice(0, 10)

  // 6 days ago so we have 7 days including today
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(now.getDate() - 6)
  sevenDaysAgo.setHours(0, 0, 0, 0)

  // Fetch membership first — needed to scope project queries
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role, org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null
  const subscription = await getSubscription(user.id)
  const isManager = ['owner', 'admin', 'manager'].includes(membership?.role ?? '') && isTeamPlan(subscription)

  // Run all non-conditional queries in parallel
  const [timeResult, tasksResult, expensesResult, projectsResult] = await Promise.all([
    supabase
      .from('time_entries')
      .select('started_at, duration_seconds, task_id, tasks(project_id)')
      .eq('user_id', user.id)
      .not('ended_at', 'is', null)
      .gte('started_at', sevenDaysAgo.toISOString()),

    supabase
      .from('tasks')
      .select('id')
      .eq('assignee_id', user.id)
      .eq('status', 'done')
      .gte('completed_at', weekStart.toISOString()),

    supabase
      .from('expenses')
      .select('amount')
      .eq('user_id', user.id)
      .gte('expense_date', monthStartStr),

    orgId
      ? supabase.from('projects').select('id, name, colour, due_date').eq('status', 'active').or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
      : supabase.from('projects').select('id, name, colour, due_date').eq('status', 'active').eq('owner_id', user.id),
  ])

  const entries = timeResult.data ?? []
  const projects = projectsResult.data ?? []

  // Fetch tasks for all active projects (for health table)
  const projectIds = projects.map(p => p.id)
  const { data: projectTasks } = projectIds.length > 0
    ? await supabase.from('tasks').select('project_id, status').in('project_id', projectIds)
    : { data: [] as { project_id: string; status: string }[] }

  // ── Derived stats ──────────────────────────────────────────

  const hoursThisWeek = entries
    .filter(e => e.started_at >= weekStart.toISOString())
    .reduce((s, e) => s + (e.duration_seconds ?? 0), 0) / 3600

  const hoursToday = entries
    .filter(e => e.started_at.slice(0, 10) === todayStr)
    .reduce((s, e) => s + (e.duration_seconds ?? 0), 0) / 3600

  const expensesThisMonth = (expensesResult.data ?? [])
    .reduce((s, e) => s + Number(e.amount), 0)

  // Days with any time logged this week (Mon–today)
  const activeDaysSet = new Set(
    entries
      .filter(e => e.started_at >= weekStart.toISOString())
      .map(e => e.started_at.slice(0, 10))
  )
  const activeDays = activeDaysSet.size

  // ── Daily bar chart (last 7 days) ──────────────────────────
  const dayBars: DayBar[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sevenDaysAgo)
    d.setDate(sevenDaysAgo.getDate() + i)
    const dateStr = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('en', { weekday: 'short' })
    const seconds = entries
      .filter(e => e.started_at.slice(0, 10) === dateStr)
      .reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
    return { label, hours: seconds / 3600 }
  })

  // ── Time by project ────────────────────────────────────────
  const projectHoursMap = new Map<string, number>()
  entries.forEach(e => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = (e as any).tasks as { project_id: string } | null
    if (!task?.project_id) return
    projectHoursMap.set(task.project_id, (projectHoursMap.get(task.project_id) ?? 0) + (e.duration_seconds ?? 0))
  })

  const projectBars: ProjectBar[] = projects
    .filter(p => projectHoursMap.has(p.id))
    .map(p => ({ name: p.name, colour: p.colour, hours: (projectHoursMap.get(p.id) ?? 0) / 3600 }))
    .sort((a, b) => b.hours - a.hours)

  const totalProjectHours = projectBars.reduce((s, p) => s + p.hours, 0)

  // ── Project health ─────────────────────────────────────────
  const projectHealth: ProjectHealth[] = projects
    .map(p => {
      const tasks = (projectTasks ?? []).filter(t => t.project_id === p.id)
      return {
        id: p.id,
        name: p.name,
        colour: p.colour,
        due_date: p.due_date,
        total_tasks: tasks.length,
        done_tasks: tasks.filter(t => t.status === 'done').length,
        hours: (projectHoursMap.get(p.id) ?? 0) / 3600,
      }
    })
    .filter(p => p.total_tasks > 0)
    .sort((a, b) => (a.due_date ?? 'z').localeCompare(b.due_date ?? 'z'))

  // ── Org member stats (managers only) ──────────────────────
  let memberStats: MemberStat[] = []
  if (isManager && orgId) {
    const { data: orgMembers } = await supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)')
      .eq('org_id', orgId)

    const memberIds = (orgMembers ?? []).map(m => m.user_id)
    if (memberIds.length > 0) {
      const [orgTimeRes, orgExpRes, orgTasksRes] = await Promise.all([
        supabase.from('time_entries').select('user_id, duration_seconds').in('user_id', memberIds).not('ended_at', 'is', null).gte('started_at', monthStart.toISOString()),
        supabase.from('expenses').select('user_id, amount').in('user_id', memberIds).gte('expense_date', monthStartStr),
        supabase.from('tasks').select('assignee_id').in('assignee_id', memberIds).eq('status', 'done').gte('completed_at', monthStart.toISOString()),
      ])

      const hoursMap = new Map<string, number>()
      ;(orgTimeRes.data ?? []).forEach(e => {
        hoursMap.set(e.user_id, (hoursMap.get(e.user_id) ?? 0) + (e.duration_seconds ?? 0))
      })
      const expMap = new Map<string, number>()
      ;(orgExpRes.data ?? []).forEach(e => {
        expMap.set(e.user_id, (expMap.get(e.user_id) ?? 0) + Number(e.amount))
      })
      const taskMap = new Map<string, number>()
      ;(orgTasksRes.data ?? []).forEach(t => {
        taskMap.set(t.assignee_id!, (taskMap.get(t.assignee_id!) ?? 0) + 1)
      })

      memberStats = (orgMembers ?? []).map(m => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const profile = (m as any).profiles as { full_name: string | null; email: string } | null
        return {
          user_id: m.user_id,
          name: profile?.full_name ?? '',
          email: profile?.email ?? '',
          hours: (hoursMap.get(m.user_id) ?? 0) / 3600,
          expenses: expMap.get(m.user_id) ?? 0,
          tasks_completed: taskMap.get(m.user_id) ?? 0,
        }
      }).sort((a, b) => b.hours - a.hours)
    }
  }

  return (
    <div className="px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Stat cards — 7.1 */}
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <StatCard label="Today" value={fmtHours(hoursToday)} sub="hours logged" colour="blue" />
          <StatCard label="This week" value={fmtHours(hoursThisWeek)} sub="hours logged" colour="purple" />
          <StatCard label="Tasks done" value={String(tasksResult.data?.length ?? 0)} sub="this week" colour="green" />
          <StatCard label="Expenses" value={`$${expensesThisMonth.toFixed(2)}`} sub="this month (AUD)" colour="orange" />
        </div>

        {/* Bar chart + activity ratio — 7.2 & 7.6 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <BarChart days={dayBars} title="Daily hours — last 7 days" />
          <ActivityRatio hoursThisWeek={hoursThisWeek} activeDays={activeDays} />
        </div>

        {/* Time by project — 7.3 */}
        <ProjectBreakdown projects={projectBars} totalHours={totalProjectHours} />

        {/* Project health — 7.4 */}
        <ProjectHealthTable projects={projectHealth} />

        {/* Org team stats — 7.5 */}
        {isManager && <OrgStatsPanel members={memberStats} />}

      </div>
    </div>
  )
}
