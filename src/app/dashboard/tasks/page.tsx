import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import TasksHub from '@/components/tasks/TasksHub'

export default async function TasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Org membership + role
  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  const orgId = membership?.org_id ?? null
  const role  = membership?.role  ?? 'employee'

  // Pool: unassigned non-done tasks in active org projects
  let poolTasks: PoolTask[] = []
  let orgMembers: { userId: string; displayName: string }[] = []

  if (orgId) {
    const { data: orgProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'active')

    const orgProjectIds = (orgProjects ?? []).map((p: { id: string }) => p.id)

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

    const { data: members } = await supabase
      .from('organisation_members')
      .select('user_id, profiles!organisation_members_user_id_fkey(id, email, full_name)')
      .eq('org_id', orgId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orgMembers = (members ?? []).map((m: any) => ({
      userId: m.user_id as string,
      displayName: (m.profiles?.full_name ?? m.profiles?.email ?? m.user_id) as string,
    }))
  }

  // User's active projects (for the new-task modal project picker)
  const { data: userProjects } = await supabase
    .from('projects')
    .select('id, name, colour')
    .eq('status', 'active')
    .or(orgId ? `assigned_to.eq.${user.id},org_id.eq.${orgId}` : `assigned_to.eq.${user.id}`)
    .order('name', { ascending: true })

  const projects = (userProjects ?? []) as { id: string; name: string; colour: string }[]

  // My tasks: all tasks assigned to current user
  const { data: mine } = await supabase
    .from('tasks')
    .select('id, title, priority, status, due_date, notes, assignee_id, completed_at, projects(id, name, colour)')
    .eq('assignee_id', user.id)
    .order('due_date', { ascending: true, nullsFirst: false })

  const myTasks = (mine ?? []) as unknown as PoolTask[]

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <TasksHub
          poolTasks={poolTasks}
          myTasks={myTasks}
          orgMembers={orgMembers}
          currentUserId={user.id}
          currentUserRole={role}
          projects={projects}
        />
      </div>
    </div>
  )
}

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
