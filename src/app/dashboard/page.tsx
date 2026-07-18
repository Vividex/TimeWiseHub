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
import { getSwmsAwaitingSignature } from '@/lib/swms-awaiting-signature'
import PersonalTodos from '@/components/dashboard/PersonalTodos'
import QuickActions from '@/components/dashboard/QuickActions'
import SiteSignInWidget, { type SignInSite } from '@/components/dashboard/SiteSignInWidget'
import type { UpcomingMeeting, UpcomingEvent, UpcomingSession, UpcomingTask, UpcomingApproval, UnreadClientMessage, UpcomingDueExpense, UpcomingVehicleDue, UpcomingCertDue, UpcomingIncidentReport, UpcomingSwmsAck } from '@/components/dashboard/DashboardUpcoming'
import { getPendingApprovals } from '@/lib/pending-approvals'
import { isOverdue } from '@/lib/invoices'
import { stripQuoteChain } from '@/lib/client-messages'
import { daysUntil } from '@/lib/expenses'
import { regoStatus, serviceStatus } from '@/lib/vehicles'
import { getSubscription, isTeamPlan } from '@/lib/subscription'
import { getTodayBoundsSydney, getTodaySydneyDateString } from '@/lib/today'
import { getWeekBounds } from '@/lib/week'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import type { Vehicle } from '@/types/vehicles'

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

type DueExpenseRow = {
  id: string
  org_id: string | null
  user_id: string
  category_id: string | null
  description: string | null
  amount: number
  currency: string
  recurrence_interval: 'weekly' | 'fortnightly' | 'monthly' | 'annually'
  next_billing_date: string
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
  const isAdminOrOwner = ['owner', 'admin'].includes(role)

  const { data: profile } = await supabase
    .from('profiles').select('full_name, nickname').eq('id', user.id).maybeSingle()
  const firstName = profile?.full_name?.split(' ')[0] ?? profile?.nickname ?? ''

  const workspaceProfile = await getWorkspaceProfileForUser(supabase, user.id)
  const isTutoring = workspaceProfile.key === 'tutoring'

  let signInSites: SignInSite[] = []
  if (workspaceProfile.supportsSwms) {
    const clientQuery = orgId
      ? supabase.from('clients').select('id').eq('org_id', orgId).eq('archived', false)
      : supabase.from('clients').select('id').eq('owner_id', user.id).eq('archived', false)
    const { data: myClients } = await clientQuery
    const clientIds = (myClients ?? []).map(c => c.id)

    if (clientIds.length > 0) {
      const [{ data: sites }, { data: mySignIns }, { data: todaySignIns }] = await Promise.all([
        supabase.from('client_sites').select('id, label, client_id, clients(name)').in('client_id', clientIds).eq('is_archived', false).order('created_at', { ascending: false }),
        supabase.from('site_sign_ins').select('site_id, signed_in_at').eq('user_id', user.id).order('signed_in_at', { ascending: false }).limit(50),
        supabase.from('site_sign_ins').select('site_id').eq('user_id', user.id).eq('sign_in_date', getTodaySydneyDateString()),
      ])

      const todaySignedInIds = new Set((todaySignIns ?? []).map(s => s.site_id as string))
      const recentSiteIds: string[] = []
      for (const s of mySignIns ?? []) {
        if (!recentSiteIds.includes(s.site_id as string)) recentSiteIds.push(s.site_id as string)
      }

      type SiteRow = { id: string; label: string; client_id: string; clients: { name: string } | null }
      const allSites = (sites ?? []) as unknown as SiteRow[]
      const siteMap = new Map(allSites.map(s => [s.id, s]))

      const orderedIds = [
        ...recentSiteIds.filter(id => siteMap.has(id)),
        ...allSites.map(s => s.id).filter(id => !recentSiteIds.includes(id)),
      ]

      signInSites = orderedIds.map(id => {
        const s = siteMap.get(id)!
        return {
          id: s.id,
          label: s.label,
          clientName: s.clients?.name ?? 'Client',
          signedInToday: todaySignedInIds.has(s.id),
        }
      })
    }
  }

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

  const dueThreshold = new Date(`${getTodaySydneyDateString(now)}T00:00:00Z`)
  dueThreshold.setUTCDate(dueThreshold.getUTCDate() + 3)
  const dueThresholdStr = dueThreshold.toISOString().slice(0, 10)

  // Stage 1: parallel fetches — projects returns IDs so we can filter tasks in stage 2
  const [sessionsRes, projectsRes, clientsRes, meetingsRes, calendarRes, sessionsListRes, subscriptionRes, unreadMessagesRes, invoicesRes, dueExpensesRes, dueBusinessExpensesRes, vehiclesRes, incidentReportsRes, certsRes] = await Promise.all([
    orgId
      ? supabase
          .from('sessions')
          .select('id, status')
          .eq('org_id', orgId)
          .gte('scheduled_at', weekStart.toISOString())
          .lt('scheduled_at', weekEnd.toISOString())
      : Promise.resolve({ data: [] as { id: string; status: string }[], error: null }),
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
          .select('id, title, scheduled_at, client_id, clients(name), students(name), scheduled_calls(id)')
          .eq('org_id', orgId)
          .gte('scheduled_at', todayStartIso)
          .lt('scheduled_at', todayEndIso)
          .order('scheduled_at')
          .limit(10)
      : Promise.resolve({ data: [] as { id: string; title: string; scheduled_at: string; client_id: string; clients: { name: string } | null; students: { name: string } | null; scheduled_calls: { id: string }[] | null }[], error: null }),
    getSubscription(user.id),
    supabase.rpc('get_unread_client_messages'),
    orgId
      ? supabase
          .from('invoices')
          .select('status, due_date, subtotal, currency')
          .neq('status', 'quote')
          .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
      : supabase
          .from('invoices')
          .select('status, due_date, subtotal, currency')
          .neq('status', 'quote')
          .eq('owner_id', user.id),
    supabase
      .from('expenses')
      .select('id, org_id, user_id, category_id, description, amount, currency, recurrence_interval, next_billing_date')
      .eq('user_id', user.id)
      .eq('is_business', false)
      .eq('is_recurring', true)
      .eq('status', 'approved')
      .lte('next_billing_date', dueThresholdStr)
      .order('next_billing_date', { ascending: true }),
    orgId && isAdminOrOwner
      ? supabase
          .from('expenses')
          .select('id, org_id, user_id, category_id, description, amount, currency, recurrence_interval, next_billing_date')
          .eq('org_id', orgId)
          .eq('is_business', true)
          .eq('is_recurring', true)
          .eq('status', 'approved')
          .lte('next_billing_date', dueThresholdStr)
          .order('next_billing_date', { ascending: true })
      : Promise.resolve({ data: [] as DueExpenseRow[], error: null }),
    supabase.from('vehicles').select('id, registration_number, rego_expiry_date, next_service_due_date, next_service_due_km, current_odometer_km').eq('is_archived', false),
    supabase.from('incident_reports').select('id, type, severity, occurred_at').eq('status', 'open').order('occurred_at', { ascending: false }),
    orgId
      ? supabase.from('certifications').select('id, user_id, name, expiry_date').eq('org_id', orgId)
      : supabase.from('certifications').select('id, user_id, name, expiry_date').eq('user_id', user.id),
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

  const sessionsThisWeekTotal = (sessionsRes.data ?? []).length
  const sessionsThisWeekCompleted = (sessionsRes.data ?? []).filter(s => s.status === 'completed').length
  const activeProjects  = projectsRes.count ?? 0
  const activeClients   = clientsRes.count ?? 0
  const tasksCompleted  = tasksDoneRes.count ?? 0
  const tasksTotal      = tasksTotalRes.count ?? 0

  const events = (calendarRes.data ?? []) as UpcomingEvent[]
  const todaySessions: UpcomingSession[] = (
    (sessionsListRes.data ?? []) as unknown as { id: string; title: string; scheduled_at: string; client_id: string; clients: { name: string } | null; students: { name: string } | null; scheduled_calls: { id: string }[] | null }[]
  ).map(s => {
    const studentFirstName = isTutoring ? s.students?.name?.split(' ')[0] ?? null : null
    return {
      id: s.id,
      title: s.title,
      scheduled_at: s.scheduled_at,
      client_id: s.client_id,
      client_name: studentFirstName ?? s.clients?.name ?? 'Client',
      meeting_id: s.scheduled_calls?.[0]?.id ?? null,
    }
  })

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
  ).map(m => {
    const preview = stripQuoteChain(m.preview)
    return {
      client_id: m.client_id,
      client_name: m.client_name,
      preview: preview.length > 80 ? preview.slice(0, 77) + '…' : preview,
    }
  })

  const dueExpenses: UpcomingDueExpense[] = ((dueExpensesRes.data ?? []) as DueExpenseRow[]).map(e => ({
    id: e.id,
    org_id: e.org_id,
    user_id: e.user_id,
    category_id: e.category_id,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    recurrence_interval: e.recurrence_interval,
    next_billing_date: e.next_billing_date,
    is_business: false,
  }))
  const dueBusinessExpenses: UpcomingDueExpense[] = ((dueBusinessExpensesRes.data ?? []) as DueExpenseRow[]).map(e => ({
    id: e.id,
    org_id: e.org_id,
    user_id: e.user_id,
    category_id: e.category_id,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    recurrence_interval: e.recurrence_interval,
    next_billing_date: e.next_billing_date,
    is_business: true,
  }))
  const vehiclesDue: UpcomingVehicleDue[] = []
  for (const v of (vehiclesRes.data ?? []) as Pick<Vehicle, 'id' | 'registration_number' | 'rego_expiry_date' | 'next_service_due_date' | 'next_service_due_km' | 'current_odometer_km'>[]) {
    const rego = regoStatus(v)
    if (rego !== 'ok' && v.rego_expiry_date) {
      vehiclesDue.push({ id: v.id, registration_number: v.registration_number, kind: 'rego', daysUntilDue: daysUntil(v.rego_expiry_date) })
    }
    const service = serviceStatus(v)
    if (service !== 'ok' && v.next_service_due_date) {
      vehiclesDue.push({ id: v.id, registration_number: v.registration_number, kind: 'service', daysUntilDue: daysUntil(v.next_service_due_date) })
    } else if (service !== 'ok' && v.next_service_due_km != null && v.current_odometer_km != null) {
      // km-only due trigger (no date set) — daysUntilDue isn't meaningful here, show as due now.
      vehiclesDue.push({ id: v.id, registration_number: v.registration_number, kind: 'service', daysUntilDue: 0 })
    }
  }
  const incidentReportsDue = (incidentReportsRes.data ?? []) as UpcomingIncidentReport[]
  const swmsAwaitingSignature: UpcomingSwmsAck[] = workspaceProfile.supportsSwms
    ? await getSwmsAwaitingSignature(user.id)
    : []

  const certThresholdDate = new Date(); certThresholdDate.setDate(certThresholdDate.getDate() + 30)
  const certThresholdStr = certThresholdDate.toISOString().split('T')[0]
  const certsDue: UpcomingCertDue[] = ((certsRes.data ?? []) as {
    id: string
    user_id: string
    name: string
    expiry_date: string | null
  }[])
    .filter(c => c.expiry_date && c.expiry_date <= certThresholdStr)
    .map(c => ({
      id: c.id,
      name: c.name,
      displayName: mappedMembers?.find(m => m.userId === c.user_id)?.displayName ?? 'You',
      daysUntilDue: daysUntil(c.expiry_date as string),
    }))
  const rosterManaged = isTeamPlan(subscriptionRes) && !!orgId

  const overdueInvoices = (invoicesRes.data ?? []).filter(isOverdue)
  const overdueTotal = overdueInvoices.reduce((s, i) => s + Number(i.subtotal), 0)
  const overdueCurrency = overdueInvoices[0]?.currency ?? 'AUD'

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
          sessionsCompleted={sessionsThisWeekCompleted}
          sessionsTotal={sessionsThisWeekTotal}
          activeProjects={activeProjects}
          tasksCompleted={tasksCompleted}
          tasksTotal={tasksTotal}
          activeClients={activeClients}
          overdueTotal={overdueTotal}
          overdueCurrency={overdueCurrency}
        />

        {/* Quick actions */}
        <QuickActions rosterManaged={rosterManaged} showNewStudent={isTutoring} />

        {signInSites.length > 0 && (
          <SiteSignInWidget sites={signInSites} userId={user.id} />
        )}

        {/* Today's agenda: meetings, sessions, calendar events, task deadlines, pending approvals */}
        <DashboardUpcoming meetings={meetings} events={events} sessions={todaySessions} tasks={todayTasks} approvals={approvals} unreadMessages={unreadMessages} dueExpenses={dueExpenses} dueBusinessExpenses={dueBusinessExpenses} vehiclesDue={vehiclesDue} certsDue={certsDue} incidentReportsDue={incidentReportsDue} swmsAwaitingSignature={swmsAwaitingSignature} currentUserId={user.id} />

        {/* Personal to-dos & My tasks */}
        <div className="grid gap-8 lg:grid-cols-2">
          <PersonalTodos />
          <div id="my-tasks">
            <MyWork myTasks={myTasks} orgMembers={mappedMembers} />
          </div>
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
