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

  const { data: projects } = await supabase
    .from('projects')
    .select('*, tasks(id, status)')
    .or(`owner_id.eq.${user.id}${membership?.org_id ? `,org_id.eq.${membership.org_id}` : ''}`)
    .order('created_at', { ascending: false })

  const active   = (projects ?? []).filter(p => p.status === 'active')
  const archived = (projects ?? []).filter(p => p.status === 'archived')

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto space-y-8">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <a href="/dashboard" className="text-sm text-blue-600 hover:underline">Back to dashboard</a>
        </div>

        <ProjectForm userId={user.id} orgId={membership?.org_id ?? null} />

        {/* Inbox — active */}
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Inbox — Active ({active.length})
          </h2>
          {active.length === 0 ? (
            <p className="text-sm text-gray-400">No active projects. Create one above.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {active.map(p => <ProjectCard key={p.id} project={p} />)}
            </div>
          )}
        </section>

        {/* Outbox — archived */}
        {archived.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
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
