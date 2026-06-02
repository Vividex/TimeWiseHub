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
  const deadlineColour = days === null ? 'text-gray-400' : days < 0 ? 'text-red-600' : days <= 3 ? 'text-orange-500' : days <= 7 ? 'text-yellow-600' : 'text-gray-500'

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-4 h-4 rounded-full mt-1 shrink-0" style={{ backgroundColor: project.colour }} />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                {project.description && <p className="text-sm text-gray-500 mt-1">{project.description}</p>}
                {days !== null && (
                  <p className={`text-sm font-medium mt-2 ${deadlineColour}`}>
                    {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'Due today' : `${days} days until deadline`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <a href="/dashboard/projects" className="text-sm text-blue-600 hover:underline">← Projects</a>
              <ArchiveButton projectId={project.id} currentStatus={project.status} />
            </div>
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-white rounded-2xl shadow p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Tasks</h2>
          <TaskForm projectId={project.id} assigneeId={user.id} />
          <TaskList initialTasks={tasks ?? []} projectId={project.id} currentUserId={user.id} />
        </div>

        {/* Documents */}
        <DocumentPanel projectId={project.id} userId={user.id} initialDocuments={documents ?? []} />

      </div>
    </div>
  )
}
