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

  const [{ data: project }, { data: tasks }, { data: documents }, { data: orgMembers }] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('tasks').select('*').eq('project_id', id).order('created_at', { ascending: true }),
    supabase.from('project_documents').select('*').eq('project_id', id).order('created_at', { ascending: false }),
    supabase.from('organisation_members').select('user_id, profiles(id, email, full_name)').eq('org_id', user.id),
  ])

  if (!project) notFound()

  const days = project.due_date ? daysUntil(project.due_date) : null
  const deadlineColour = days === null ? 'text-gray-500' : days < 0 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-gray-500'

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
                {project.description && <p className="mt-2 text-sm font-semibold text-gray-500">{project.description}</p>}
                {days !== null && (
                  <p className={`mt-3 text-sm font-bold ${deadlineColour}`}>
                    {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `${days} days until deadline`}
                  </p>
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

