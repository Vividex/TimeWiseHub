import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import ProjectForm from '@/components/projects/ProjectForm'
import { getSubscription, maxActiveProjects } from '@/lib/subscription'

export default async function ProjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const subscription = await getSubscription(user.id)
  const limitRaw = maxActiveProjects(subscription)
  const limit = isFinite(limitRaw) ? limitRaw : null

  const projectQuery = orgId
    ? supabase.from('projects').select('id, name, colour, due_date, status, clients(name), tasks(id, status)', { count: 'exact' }).eq('org_id', orgId).eq('status', 'active').order('name')
    : supabase.from('projects').select('id, name, colour, due_date, status, clients(name), tasks(id, status)', { count: 'exact' }).eq('owner_id', user.id).eq('status', 'active').order('name')

  const { data: projectsRaw, count, error: projectsError } = await projectQuery
  if (projectsError) {
    console.error('[dashboard/projects] project query failed', { orgId, userId: user.id, error: projectsError })
  }
  const activeCount = count ?? (projectsRaw?.length ?? 0)

  type ClientRow = { name: string } | null
  const projects = (projectsRaw ?? []).map(p => {
    const tasks = (p.tasks as { id: string; status: string }[]) ?? []
    return {
      id: p.id,
      name: p.name,
      colour: p.colour as string,
      due_date: p.due_date as string | null,
      clientName: (p.clients as unknown as ClientRow)?.name ?? null,
      done: tasks.filter(t => t.status === 'done').length,
      total: tasks.length,
    }
  })

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Active projects</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {activeCount} active{limit !== null ? ` / ${limit} max` : ''}
            </p>
          </div>
          <Link href="/dashboard/clients" className="text-sm font-semibold text-cyan-600 hover:underline">
            View clients →
          </Link>
        </div>

        <ProjectForm userId={user.id} orgId={orgId} activeProjectCount={activeCount} activeProjectLimit={limit} />

        {projectsError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950 dark:text-red-400">
            Couldn&apos;t load projects: {projectsError.message}
          </p>
        )}

        <TileGrid empty="No active projects yet. Create one above or start from a client.">
          {projects.map(p => (
            <Tile
              key={p.id}
              title={p.name}
              accent={p.colour}
              meta={p.clientName ?? undefined}
              progress={p.total > 0 ? { done: p.done, total: p.total } : undefined}
              href={`/dashboard/projects/${p.id}`}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  )
}
