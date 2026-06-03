import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ProjectCard from '@/components/projects/ProjectCard'
import ProjectForm from '@/components/projects/ProjectForm'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: projects } = await (
    membership?.org_id
      ? supabase.from('projects').select('*, tasks(id, status)').or(`owner_id.eq.${user.id},org_id.eq.${membership.org_id}`).order('created_at', { ascending: false })
      : supabase.from('projects').select('*, tasks(id, status)').eq('owner_id', user.id).order('created_at', { ascending: false })
  )

  const active   = (projects ?? []).filter(p => p.status === 'active')
  const archived = (projects ?? []).filter(p => p.status === 'archived')

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <ProjectForm userId={user.id} orgId={membership?.org_id ?? null} />

        {/* Inbox — active */}
        <section>
          <h2 className="mb-4 text-xl font-bold text-gray-900">
            Inbox — Active ({active.length})
          </h2>
          {active.length === 0 ? (
            <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">No active projects. Create one above.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {active.map(p => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}
        </section>

        {/* Outbox — archived */}
        {archived.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-bold text-gray-900">
              Outbox — Completed ({archived.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {archived.map(p => <ProjectCard key={p.id} project={p} />)}
            </div>
          </section>
        )}

      </div>
    </div>
  )
}
