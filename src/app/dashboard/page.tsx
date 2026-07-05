import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import MyWork from '@/components/home/MyWork'
import TaskPool from '@/components/tasks/TaskPool'
import TeamTasks from '@/components/tasks/TeamTasks'
import WelcomeBanner from '@/components/WelcomeBanner'
import NudgeBanner from '@/components/NudgeBanner'
import OrgDocuments from '@/components/home/OrgDocuments'
import DashboardMetrics from '@/components/dashboard/DashboardMetrics'
import DashboardUpcoming from '@/components/dashboard/DashboardUpcoming'
import PersonalTodos from '@/components/dashboard/PersonalTodos'
import QuickActions from '@/components/dashboard/QuickActions'
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage } from '@/components/dashboard/DashboardUpcoming'
import { getPendingApprovals } from '@/lib/pending-approvals'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { getTodayBoundsSydney } from '@/lib/today'
import { getWeekBounds } from '@/lib/week'

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

  // Manager unassigned pool + assigned team tasks + pending approvals
  let poolTasks: PoolTask[] = []
  let assignedTasks: AssignedTask[] = []
  let approvals: UpcomingApproval[] = []
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

    const pending = await getPendingApprovals(orgId, user.id, role)
    approvals = pending.map(p => ({
      id: p.id,
      title: p.invoice_number,
      submitter_name: p.submitter_name,
      amount: `${p.currency} ${Number(p.subtotal).toFixed(2)}`,
    }))
  }

  // Date helpers
  const now = new Date()
  const { weekStart, weekEnd } = getWeekBounds(now)
  const { todayStart, todayEnd } = getTodayBoundsSydney(now)

  const todayStartIso = todayStart.toISOString()
  const todayEndIso   = todayEnd.toISOString()

  // Stage 1: parallel fetches — projects returns IDs so we can filter tasks in stage 2
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes] = await Promise.all([
    orgId
      ? supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .gte('scheduled_at', weekStart.toISOString())
          .lt('scheduled_at', weekEnd.toISOString())
      : Promise.resolve({ count: 0, data: null, error: null }),
    orgId
      ? supabase.from('projects').select('id', { count: 'exact' }).eq('org_id', orgId).eq('status', 'active')
      : supabase.from('projects').select('id', { count: 'exact' }).eq('owner_id', user.id).eq('status', 'active'),
    orgId
      ? supabase.from('clients').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('archived', false)
      : supabase.from('clients').select('id', { count: 'exact', head: true }).eq('owner_id', user.id).eq('archived', false),
    orgId
      ? supabase
          .from('scheduled_calls')
          .select('id, title, starts_at')
          .eq('org_id', orgId)
          .gte('starts_at', todayStartIso)
          .lt('starts_at', todayEndIso)
          .order('starts_at')
          .limit(5)
      : Promise.resolve({ data: [] as { id: string; title: string; starts_at: string }[], error: null }),
    supabase
      .from('calendar_events')
      .select('id, title, start_at, end_at, all_day')
      .eq('created_by', user.id)
      .gte('start_at', todayStartIso)
      .lt('start_at', todayEndIso)
      .order('start_at')
      .limit(10),
    orgId
      ? supabase
          .from('sessions')
          .select('id, title, scheduled_at, client_id, clients(name), scheduled_calls(id)')
          .eq('org_id', orgId)
          .gte('scheduled_at', todayStartIso)
          .lt('scheduled_at', todayEndIso)
          .order('scheduled_at')
          .limit(10)
      : Promise.resolve({ data: [] as { id: string; title: string; scheduled_at: string; client_id: string; clients: { name: string } | null; scheduled_calls: { id: string }[] | null }[], error: null }),
    getSubscription(user.id),
    supabase.rpc('get_unread_client_messages'),
  ])

  // Stage 2: task counts scoped to active projects
  const activeProjectIds = (projectsRes.data ?? []).map((p: { id: string }) => p.id)

  const [tasksDoneRes, tasksTotalRes] = await Promise.all([
    activeProjectIds.length > 0
      ? supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assignee_id', user.id)
          .eq('status', 'done')
          .in('project_id', activeProjectIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
    activeProjectIds.length > 0
      ? supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assignee_id', user.id)
          .in('project_id', activeProjectIds)
      : Promise.resolve({ count: 0, data: null, error: null }),
  ])

  const sessionsThisWeek = sessionsRes.count ?? 0
  const activeProjects  = projectsRes.count ?? 0
  const activeClients   = clientsRes.count ?? 0
  const tasksCompleted  = tasksDoneRes.count ?? 0
  const tasksTotal      = tasksTotalRes.count ?? 0

  const events = (calendarRes.data ?? []) as UpcomingEvent[]
  const todaySessions: UpcomingSession[] = (
    (sessionsListRes.data ?? []) as unknown as { id: string; title: string; scheduled_at: string; client_id: string; clients: { name: string } | null; scheduled_calls: { id: string }[] | null }[]
  ).map(s => ({
    id: s.id,
    title: s.title,
    scheduled_at: s.scheduled_at,
    client_id: s.client_id,
    client_name: s.clients?.name ?? 'Client',
    meeting_id: s.scheduled_calls?.[0]?.id ?? null,
  }))

  // A session with its own linked video call already appears as a session item (with a Join
  // button) — don't also list it separately as a standalone meeting.
  const linkedMeetingIds = new Set(todaySessions.map(s => s.meeting_id).filter((id): id is string => id !== null))
  const meetings = ((meetingsRes.data ?? []) as UpcomingMeeting[]).filter(m => !linkedMeetingIds.has(m.id))

  const todayEndDate = new Date(todayEndIso)
  const todayTasks: UpcomingTask[] = myTasks
    .filter(t => t.due_date && new Date(t.due_date) < todayEndDate)
    .map(t => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date as string,
      project_name: t.projectName,
    }))
  const unreadMessages: UnreadClientMessage[] = (
    (unreadMessagesRes.data ?? []) as { client_id: string; client_name: string; preview: string; created_at: string }[]
  ).map(m => ({
    client_id: m.client_id,
    client_name: m.client_name,
    preview: m.preview.length > 80 ? m.preview.slice(0, 77) + '…' : m.preview,
  }))
  const rosterManaged = isTeamPlan(subscriptionRes) && !!orgId

  return (
    <div className="px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">

        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white">
            {firstName ? `Hi, ${firstName} 👋` : 'Dashboard'}
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            Here&apos;s what&apos;s happening across your business today.
          </p>
        </div>

        <WelcomeBanner firstName={firstName} />
        <NudgeBanner userId={user.id} />

        {/* Metric cards — all clickable */}
        <DashboardMetrics
          sessionsThisWeek={sessionsThisWeek}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
        />

        {/* Quick actions */}
        <QuickActions rosterManaged={rosterManaged} />

        {/* Today's agenda: meetings, sessions, calendar events, task deadlines, pending approvals */}
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} />

        {/* Personal to-dos */}
        <PersonalTodos />

        {/* My tasks */}
        <div id="my-tasks">
          <MyWork myTasks={myTasks} orgMembers={mappedMembers} />
        </div>

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
          <OrgDocuments orgId={orgId} />
        )}
      </div>
    </div>
  )
}
