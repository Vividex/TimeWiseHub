// src/app/dashboard/clients/[id]/notes/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import AddProgressNote from '@/components/clients/AddProgressNote'
import ProgressNotesList, { type ProgressNoteRow } from '@/components/clients/ProgressNotesList'

export default async function ClientNotesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null
  const canManageNotes = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', id).maybeSingle()
  if (!client) notFound()

  const { data: students } = await supabase
    .from('students')
    .select('id, name')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  const { data: notes } = await supabase
    .from('progress_notes')
    .select('id, body, created_at, created_by, student_id, sent_to_parent_at, profiles!progress_notes_created_by_fkey(full_name)')
    .eq('client_id', id)
    .order('created_at', { ascending: false })

  const notesData: ProgressNoteRow[] = (notes ?? []).map(note => ({
    id: note.id,
    body: note.body,
    created_at: note.created_at,
    created_by: note.created_by,
    student_id: note.student_id,
    sent_to_parent_at: note.sent_to_parent_at,
    author: (note.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Unknown',
  }))

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Progress notes</h1>

        <AddProgressNote clientId={id} orgId={orgId} students={students ?? []} />

        <ProgressNotesList notes={notesData} currentUserId={user.id} canManage={canManageNotes} students={students ?? []} clientId={id} />
      </div>
    </div>
  )
}
