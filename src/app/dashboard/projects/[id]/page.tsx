import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import TaskList from '@/components/projects/TaskList'
import TaskForm from '@/components/projects/TaskForm'
import DocumentPanel from '@/components/projects/DocumentPanel'
import ArchiveButton from '@/components/projects/ArchiveButton'

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', id).single(),
    supabase.from('tasks').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    supabase.from('project_documents').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle(),
  ])

  if (!project) notFound()

  const taskIds = (tasks ?? []).map(t => t.id)
  const orgId = membership?.org_id ?? null

  const orgMembers = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles(id, email, full_name)').eq('org_id', orgId)).data
    : null

  // Time entries linked via tasks, not directly by project id
  const timeEntries = taskIds.length > 0
    ? (await supabase.from('time_entries').select('duration_seconds, billable, billable_rate').in('task_id', taskIds).not('ended_at', 'is', null)).data
    : null

  const days = project.due_date ? daysUntil(project.due_date) : null
  const deadlineColour = days === null ? 'text-gray-500' : days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'

  const totalSeconds = (timeEntries ?? []).reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
  const totalHours = totalSeconds / 3600
  const billableValue = (timeEntries ?? [])
    .filter(e => e.billable)
    .reduce((s, e) => s + ((e.duration_seconds ?? 0) / 3600) * (e.billable_rate ?? 0), 0)
  const hoursPct   = project.budget_hours   ? Math.min(Math.round((totalHours / project.budget_hours) * 100), 100)     : null
  const dollarsPct = project.budget_dollars ? Math.min(Math.round((billableValue / project.budget_dollars) * 100), 100) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientName = (project as any).clients?.name as string | null

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-5 w-5 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: project.colour }} />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900">{project.name}</h1>
                {clientName && <p className="mt-1 text-xs font-bold uppercase tracking-wide text-cyan-600">{clientName}</p>}
                {project.description && <p className="mt-2 text-sm font-semibold text-gray-500">{project.description}</p>}
                {days !== null && (
                  <p className={`mt-3 text-sm font-bold ${deadlineColour}`}>
                    {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `${days} days until deadline`}
                  </p>
                )}

                {/* Budget progress */}
                {hoursPct !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                      <span>Hours: {totalHours.toFixed(1)} / {project.budget_hours}</span>
                      <span className={hoursPct >= 100 ? 'text-red-600' : hoursPct >= 80 ? 'text-amber-600' : ''}>{hoursPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-2 rounded-full ${hoursPct >= 100 ? 'bg-red-500' : hoursPct >= 80 ? 'bg-amber-500' : 'bg-cyan-500'}`} style={{ width: `${hoursPct}%` }} />
                    </div>
                  </div>
                )}
                {dollarsPct !== null && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs font-semibold text-gray-500 mb-1">
                      <span>Value: ${billableValue.toFixed(0)} / ${project.budget_dollars}</span>
                      <span className={dollarsPct >= 100 ? 'text-red-600' : dollarsPct >= 80 ? 'text-amber-600' : ''}>{dollarsPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                      <div className={`h-2 rounded-full ${dollarsPct >= 100 ? 'bg-red-500' : dollarsPct >= 80 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${dollarsPct}%` }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="shrink-0">
              <ArchiveButton projectId={project.id} currentStatus={project.status} />
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">Tasks</h2>
          <TaskForm projectId={project.id} assigneeId={user.id} />
          <TaskList initialTasks={tasks ?? []} projectId={project.id} currentUserId={user.id} />
        </div>

        {/* Documents */}
        <DocumentPanel projectId={project.id} userId={user.id} initialDocuments={documents ?? []} />

      </div>
    </div>
  )
}

