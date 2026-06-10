// src/app/dashboard/clients/[id]/projects/[projectId]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import ProjectTaskGrid from '@/components/projects/ProjectTaskGrid'
import DocumentPanel from '@/components/projects/DocumentPanel'
import ArchiveButton from '@/components/projects/ArchiveButton'

export default async function ClientProjectPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>
}) {
  const { id, projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: project }, { data: tasks }, { data: documents }, { data: membership }] = await Promise.all([
    supabase.from('projects').select('*, clients(name)').eq('id', projectId).single(),
    supabase.from('tasks').select('*').eq('project_id', projectId).order('created_at', { ascending: true }),
    supabase.from('project_documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
  ])
  if (!project) notFound()

  const orgId = membership?.org_id ?? null
  const canManageConfidential = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const isOrgProject = project.org_id !== null

  const orgMembers = orgId
    ? (await supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(id, email, full_name)').eq('org_id', orgId)).data
    : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedOrgMembers = orgId && orgMembers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (orgMembers as any[]).map((m: any) => ({
        userId: m.user_id as string,
        displayName: (m.profiles?.full_name ?? m.profiles?.email ?? m.user_id) as string,
      }))
    : undefined

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}/projects`} className="text-sm font-semibold text-cyan-600 hover:underline">← Projects</Link>

        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-1 h-5 w-5 shrink-0 rounded-full shadow-sm" style={{ backgroundColor: project.colour }} />
              <div>
                <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">{project.name}</h1>
                {project.description && <p className="mt-2 text-sm font-semibold text-gray-500">{project.description}</p>}
              </div>
            </div>
            <div className="shrink-0">
              <ArchiveButton projectId={project.id} currentStatus={project.status} />
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Tasks</h2>
          <ProjectTaskGrid projectId={project.id} assigneeId={user.id} initialTasks={tasks ?? []} orgMembers={mappedOrgMembers} />
        </div>

        <DocumentPanel
          projectId={project.id}
          userId={user.id}
          initialDocuments={documents ?? []}
          isOrgProject={isOrgProject}
          canManageConfidential={canManageConfidential}
        />
      </div>
    </div>
  )
}
