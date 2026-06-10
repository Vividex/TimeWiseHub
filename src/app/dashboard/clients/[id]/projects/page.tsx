// src/app/dashboard/clients/[id]/projects/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { Tile, TileGrid } from '@/components/ui/Tile'
import NewClientProjectButton from '@/components/projects/NewClientProjectButton'

export default async function ClientProjectsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, colour, due_date, status, tasks(status)')
    .eq('client_id', id)
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const items = (projects ?? []).map(p => {
    const tasks = (p.tasks as { status: string }[]) ?? []
    return {
      id: p.id,
      name: p.name,
      colour: p.colour as string,
      due_date: p.due_date as string | null,
      done: tasks.filter(t => t.status === 'done').length,
      total: tasks.length,
    }
  })

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Projects</h1>

        <NewClientProjectButton clientId={id} orgId={orgId} />

        <TileGrid empty="No projects yet for this client.">
          {items.map(p => (
            <Tile
              key={p.id}
              title={p.name}
              accent={p.colour}
              meta={p.due_date ? `due ${new Date(p.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}` : undefined}
              progress={p.total > 0 ? { done: p.done, total: p.total } : undefined}
              href={`/dashboard/clients/${id}/projects/${p.id}`}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  )
}
