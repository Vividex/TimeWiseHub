import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import MyWork from '@/components/home/MyWork'
import TaskPool from '@/components/tasks/TaskPool'
import TeamTasks from '@/components/tasks/TeamTasks'
import WelcomeBanner from '@/components/WelcomeBanner'
import NudgeBanner from '@/components/NudgeBanner'
import PushPermission from '@/components/PushPermission'
import OrgDocuments from '@/components/home/OrgDocuments'
import PendingApprovals from '@/components/home/PendingApprovals'

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

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">
            {firstName ? `Hi, ${firstName}` : 'My Work'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Jump to <Link href="/dashboard/clients" className="font-semibold text-cyan-600 hover:underline">Clients</Link> to browse projects and sessions.
          </p>
        </div>

        <WelcomeBanner firstName={firstName} />
        <NudgeBanner userId={user.id} />
        <div className="flex justify-end">
          <PushPermission />
        </div>

        <MyWork myTasks={myTasks} orgMembers={mappedMembers} />

        {isManager && poolTasks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Unassigned tasks</h2>
            <TaskPool
              initialTasks={poolTasks}
              orgMembers={mappedMembers ?? []}
              currentUserId={user.id}
              currentUserRole={role}
            />
          </div>
        )}

        {isManager && assignedTasks.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">Team tasks</h2>
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
