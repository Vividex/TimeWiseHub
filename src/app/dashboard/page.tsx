import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MyWork from '@/components/home/MyWork'
import TaskPool from '@/components/tasks/TaskPool'
import TeamTasks from '@/components/tasks/TeamTasks'
import WelcomeBanner from '@/components/WelcomeBanner'
import NudgeBanner from '@/components/NudgeBanner'
import OrgDocuments from '@/components/home/OrgDocuments'
import PendingApprovals from '@/components/home/PendingApprovals'
import DashboardMetrics from '@/components/dashboard/DashboardMetrics'
import QuickActions from '@/components/dashboard/QuickActions'

type PoolTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
  projects: { id: string; name: string; colour: string } | null
}

type AssignedTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  assignee_id: string
  projects: { id: string; name: string; colour: string } | null
}

export default async function DashboardHome() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null
  const role = membership?.role ?? 'employee'
  const isManager = ['owner', 'admin', 'manager'].includes(role)

  const { data: profile } = await supabase
    .from('profiles').select('full_name, nickname').eq('id', user.id).maybeSingle()
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.nickname ?? ''

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

  const orgMembersRaw = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedMembers = orgMembersRaw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembersRaw as any[]).map((m: any) => ({ userId: m.user_id as string, displayName: (m.profiles?.full_name || m.profiles?.email || m.user_id) as string }))
    : undefined

  // Manager unassigned pool + assigned team tasks
  let poolTasks: PoolTask[] = []
  let assignedTasks: AssignedTask[] = []
  if (isManager && orgId) {
    const { data: orgProjects } = await supabase
      .from('projects').select('id').eq('org_id', orgId).eq('status', 'active')
    const orgProjectIds = (orgProjects ?? []).map(p => p.id)
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
  }

  // Metric card data
  const now = new Date()
  const dow = now.getDay()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((dow + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)

  const weekStartDate = weekStart.toISOString().slice(0, 10)
  const todayDate = now.toISOString().slice(0, 10)

  const [timeRes, projectsRes, tasksRes, clientsRes, rosterRes] = await Promise.all([
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
    supabase
      .from('roster_shifts')
      .select('start_time, end_time')
      .eq('user_id', user.id)
      .eq('published', true)
      .is('deleted_at', null)
      .gte('date', weekStartDate)
      .lte('date', todayDate),
  ])

  const timeEntrySeconds = (timeRes.data ?? []).reduce((s: number, e: { duration_seconds: number | null }) => s + (e.duration_seconds ?? 0), 0)
  const rosterSeconds = (rosterRes.data ?? []).reduce((s: number, shift: { start_time: string; end_time: string }) => {
    const [sh, sm] = shift.start_time.split(':').map(Number)
    const [eh, em] = shift.end_time.split(':').map(Number)
    const dur = (eh * 3600 + em * 60) - (sh * 3600 + sm * 60)
    return s + (dur > 0 ? dur : 0)
  }, 0)
  const hoursThisWeek = (timeEntrySeconds + rosterSeconds) / 3600
  const activeProjects = projectsRes.count ?? 0
  const tasksThisWeek = tasksRes.count ?? 0
  const activeClients = clientsRes.count ?? 0

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
}
