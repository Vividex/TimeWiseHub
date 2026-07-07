import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
import AddProgressNote from '@/components/clients/AddProgressNote'
import ProgressNotesList, { type ProgressNoteRow } from '@/components/clients/ProgressNotesList'
import StudentWorksheets, { type StudentWorksheetAsset } from '@/components/students/StudentWorksheets'

export default async function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: student } = await supabase
    .from('students')
    .select('id, name, client_id, clients(id, name)')
    .eq('id', id)
    .maybeSingle()
  if (!student) notFound()
  const client = student.clients as unknown as { id: string; name: string } | null

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null
  const canManageNotes = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')

  const [{ data: notesRaw }, { data: sessionsRaw }, { data: annotationRows }] = await Promise.all([
    supabase
      .from('progress_notes')
      .select('id, body, created_at, created_by, sent_to_parent_at, profiles!progress_notes_created_by_fkey(full_name)')
      .eq('student_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, notes, status')
      .eq('student_id', id)
      .not('notes', 'is', null)
      .neq('notes', '')
      .order('scheduled_at', { ascending: false }),
    supabase
      .from('worksheet_annotations')
      .select('topic_asset_id')
      .eq('student_id', id),
  ])

  const notes: ProgressNoteRow[] = (notesRaw ?? []).map(n => ({
    id: n.id,
    body: n.body,
    created_at: n.created_at,
    created_by: n.created_by,
    student_id: id,
    sent_to_parent_at: n.sent_to_parent_at,
    author: (n.profiles as unknown as { full_name: string | null } | null)?.full_name ?? 'Unknown',
  }))

  const sessions = sessionsRaw ?? []

  const topicAssetIds = Array.from(new Set((annotationRows ?? []).map(r => r.topic_asset_id as string)))
  let worksheets: StudentWorksheetAsset[] = []
  if (topicAssetIds.length > 0) {
    const { data: assetRows } = await supabase
      .from('topic_assets')
      .select('id, name, asset_type, storage_path')
      .in('id', topicAssetIds)
      .in('asset_type', ['pdf', 'image'])
      .order('name')

    const resolved = await Promise.all((assetRows ?? []).map(async a => {
      const signedUrl = await createTopicAssetSignedUrl(a.storage_path)
      return signedUrl ? { id: a.id, name: a.name, asset_type: a.asset_type as 'pdf' | 'image', signed_url: signedUrl } : null
    }))
    worksheets = resolved.filter((a): a is StudentWorksheetAsset => a !== null)
  }

  const studentOption = [{ id: student.id, name: student.name }]

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        {client && (
          <Link href={`/dashboard/clients/${client.id}/students`} className="text-sm font-semibold text-cyan-600 hover:underline">
            ← {client.name}
          </Link>
        )}
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">{student.name}</h1>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Progress notes</h2>
          <AddProgressNote clientId={student.client_id} orgId={orgId} students={studentOption} defaultStudentId={student.id} />
          <ProgressNotesList notes={notes} currentUserId={user.id} canManage={canManageNotes} students={studentOption} clientId={student.client_id} />
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Session notes</h2>
          {sessions.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-slate-500">No session notes yet.</p>
          ) : (
            <div className="space-y-3">
              {sessions.map(s => (
                <Link
                  key={s.id}
                  href={`/dashboard/clients/${student.client_id}/sessions/${s.id}`}
                  className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.title}</p>
                    <span className="shrink-0 text-xs text-gray-400">
                      {new Date(s.scheduled_at).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-slate-400">{s.notes}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Annotated worksheets</h2>
          <StudentWorksheets assets={worksheets} studentId={student.id} currentUserId={user.id} />
        </section>
      </div>
    </div>
  )
}
