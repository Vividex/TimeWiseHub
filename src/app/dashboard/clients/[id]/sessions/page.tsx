// src/app/dashboard/clients/[id]/sessions/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import { Tile, TileGrid } from '@/components/ui/Tile'
import NewSessionModal from '@/components/clients/NewSessionModal'

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'green'> = {
  scheduled: 'blue', in_progress: 'amber', completed: 'green',
}
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
}

export default async function ClientSessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, status, student_id, students(name), session_todos(id, completed)')
    .eq('client_id', id)
    .order('scheduled_at', { ascending: true })

  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  const items = (sessions ?? []).map(s => {
    const todos = (s.session_todos as { completed: boolean }[]) ?? []
    const student = (s.students as unknown as { name: string } | null)
    return {
      id: s.id,
      title: s.title as string,
      scheduled_at: s.scheduled_at as string,
      duration: s.duration_minutes as number,
      status: s.status as string,
      studentName: student?.name ?? null,
      done: todos.filter(t => t.completed).length,
      total: todos.length,
    }
  })

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Sessions</h1>
          <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students ?? []} />
        </div>

        <TileGrid empty="No sessions yet.">
          {items.map(s => (
            <Tile
              key={s.id}
              title={s.title}
              meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}`}
              badge={{ label: STATUS_LABEL[s.status], tone: STATUS_TONE[s.status] }}
              progress={s.total > 0 ? { done: s.done, total: s.total } : undefined}
              href={`/dashboard/clients/${id}/sessions/${s.id}`}
            />
          ))}
        </TileGrid>
      </div>
    </div>
  )
}
