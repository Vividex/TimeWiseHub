import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import { ensureSeedSubjects } from '@/lib/tutoring/ensure-seed-subjects'
import { Tile, TileGrid } from '@/components/ui/Tile'
import NewSessionModal from '@/components/clients/NewSessionModal'
import BillableSessionsPanel from '@/components/clients/BillableSessionsPanel'

const STATUS_TONE: Record<string, 'blue' | 'amber' | 'green'> = {
  scheduled: 'blue', in_progress: 'amber', completed: 'green',
}
const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Scheduled', in_progress: 'In Progress', completed: 'Completed',
}

function sessionLabel(yearGroup: string | null, subjectName: string | null, topicName: string | null) {
  return [yearGroup, subjectName, topicName].filter(Boolean).join(' · ')
}

export default async function ClientSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = await params
  const { new: openNew } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { terminology, key: profileKey } = await getWorkspaceProfileForUser(supabase, user.id)
  const showTutoringFields = profileKey === 'tutoring'

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  if (showTutoringFields) {
    await ensureSeedSubjects(supabase, user.id, orgId)
  }

  const { data: client } = await supabase.from('clients').select('id, name, default_rate, currency').eq('id', id).maybeSingle()
  if (!client) notFound()

  let subjects: { id: string; name: string }[] = []
  if (showTutoringFields) {
    const subjectsQuery = orgId
      ? supabase.from('subjects').select('id, name').eq('org_id', orgId).eq('archived', false).order('name')
      : supabase.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id).eq('archived', false).order('name')
    const { data } = await subjectsQuery
    subjects = data ?? []
  }

  const { data: sessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, status, student_id, year_group, subject_id, topic_id, students(name), subjects(name), topics(name), session_todos(id, completed)')
    .eq('client_id', id)
    .order('scheduled_at', { ascending: true })

  let students: { id: string; name: string }[] = []
  if (showTutoringFields) {
    const { data } = await supabase
      .from('students')
      .select('id, name')
      .eq('client_id', id)
      .eq('archived', false)
      .order('name')
    students = data ?? []
  }

  const { data: sites } = await supabase
    .from('client_sites')
    .select('id, label')
    .eq('client_id', id)
    .eq('is_archived', false)
    .order('label')

  const { data: billableSessions } = await supabase
    .from('sessions')
    .select('id, title, scheduled_at, duration_minutes, year_group, subjects(name), topics(name), students(name)')
    .eq('client_id', id)
    .eq('status', 'completed')
    .is('invoice_id', null)
    .order('scheduled_at', { ascending: true })

  const billableItems = (billableSessions ?? []).map(s => {
    const student = (s.students as unknown as { name: string } | null)
    const subject = (s.subjects as unknown as { name: string } | null)
    const topic = (s.topics as unknown as { name: string } | null)
    return {
      id: s.id,
      title: s.title as string,
      scheduled_at: s.scheduled_at as string,
      duration_minutes: s.duration_minutes as number,
      studentName: student?.name ?? null,
      subjectLabel: sessionLabel(s.year_group as string | null, subject?.name ?? null, topic?.name ?? null),
    }
  })

  const items = (sessions ?? []).map(s => {
    const todos = (s.session_todos as { completed: boolean }[]) ?? []
    const student = (s.students as unknown as { name: string } | null)
    const subject = (s.subjects as unknown as { name: string } | null)
    const topic = (s.topics as unknown as { name: string } | null)
    return {
      id: s.id,
      title: s.title as string,
      scheduled_at: s.scheduled_at as string,
      duration: s.duration_minutes as number,
      status: s.status as string,
      studentName: student?.name ?? null,
      subjectLabel: sessionLabel(s.year_group as string | null, subject?.name ?? null, topic?.name ?? null),
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
          <NewSessionModal clientId={id} orgId={orgId} clientLabel={terminology.client} students={students} subjects={subjects} sites={sites ?? []} showTutoringFields={showTutoringFields} defaultOpen={openNew === '1'} />
        </div>

        <BillableSessionsPanel
          clientId={id}
          orgId={orgId}
          defaultRate={client.default_rate ?? 0}
          currency={client.currency}
          sessions={billableItems}
        />

        <TileGrid empty="No sessions yet.">
          {items.map(s => (
            <Tile
              key={s.id}
              title={s.title}
              meta={`${new Date(s.scheduled_at).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })} · ${s.duration} min${s.studentName ? ` · ${s.studentName}` : ''}${s.subjectLabel ? ` · ${s.subjectLabel}` : ''}`}
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
