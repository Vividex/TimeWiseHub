import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ProjectCard from '@/components/projects/ProjectCard'
import ProjectsGrid from '@/components/projects/ProjectsGrid'
import ProjectForm from '@/components/projects/ProjectForm'
import { getSubscription, maxActiveProjects } from '@/lib/subscription'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const [subscription, { data: projects }] = await Promise.all([
    getSubscription(user.id),
    membership?.org_id
      ? supabase.from('projects').select('*, tasks(id, status)').or(`owner_id.eq.${user.id},org_id.eq.${membership.org_id}`).order('created_at', { ascending: false })
      : supabase.from('projects').select('*, tasks(id, status)').eq('owner_id', user.id).order('created_at', { ascending: false }),
  ])

  const allProjects = projects ?? []
  const orgProjects        = allProjects.filter(p => p.org_id !== null)
  const personalProjects   = allProjects.filter(p => p.org_id === null)
  const activeOrg          = orgProjects.filter(p => p.status === 'active')
  const archivedOrg        = orgProjects.filter(p => p.status === 'archived')
  const activePersonal     = personalProjects.filter(p => p.status === 'active')
  const archivedPersonal   = personalProjects.filter(p => p.status === 'archived')
  const projectLimit = maxActiveProjects(subscription)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <ProjectForm
          userId={user.id}
          orgId={membership?.org_id ?? null}
          activeProjectCount={activePersonal.filter(p => p.owner_id === user.id).length}
          activeProjectLimit={projectLimit === Infinity ? null : projectLimit}
        />

        {/* Organisation Projects */}
        {membership?.org_id && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              Organisation Projects ({activeOrg.length})
            </h2>
            {activeOrg.length === 0 ? (
              <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">No active organisation projects.</p>
            ) : (
              <ProjectsGrid projects={activeOrg} scope="org" />
            )}
            {archivedOrg.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Archived</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {archivedOrg.map(p => <ProjectCard key={p.id} project={p} scope="org" />)}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Personal Projects */}
        <section>
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Personal Projects ({activePersonal.length})
          </h2>
          {activePersonal.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">No active personal projects. Create one above.</p>
          ) : (
            <ProjectsGrid projects={activePersonal} scope="personal" />
          )}
          {archivedPersonal.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-400 uppercase tracking-wide">Archived</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {archivedPersonal.map(p => <ProjectCard key={p.id} project={p} scope="personal" />)}
              </div>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
