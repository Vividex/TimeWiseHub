import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SessionDetailClient from '@/components/clients/SessionDetailClient'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id, sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: session }, { data: client }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, notes, status, session_todos(id, title, completed, position)')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, name')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!session || !client) notFound()

  const todos = (session.session_todos as { id: string; title: string; completed: boolean; position: number }[])
    .slice()
    .sort((a, b) => a.position - b.position)

  return (
    <SessionDetailClient
      session={{
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        notes: session.notes ?? '',
        status: session.status as 'scheduled' | 'in_progress' | 'completed',
      }}
      todos={todos}
      clientId={id}
      clientName={client.name}
    />
  )
}
