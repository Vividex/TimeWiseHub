import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FolderTile from '@/components/topics/FolderTile'
import AddTopicForm from '@/components/topics/AddTopicForm'
import AddSubSubjectForm from '@/components/topics/AddSubSubjectForm'

export default async function SubjectTopicsPage({
  params,
}: {
  params: Promise<{ yearGroup: string; subjectId: string }>
}) {
  const { yearGroup: yearGroupParam, subjectId } = await params
  const yearGroup = decodeURIComponent(yearGroupParam)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subject } = await supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle()
  if (!subject) notFound()

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const [{ data: subSubjects }, { data: topics }] = await Promise.all([
    supabase
      .from('subjects')
      .select('id, name')
      .eq('parent_subject_id', subjectId)
      .eq('archived', false)
      .order('name'),
    supabase
      .from('topics')
      .select('id, name')
      .eq('subject_id', subjectId)
      .eq('year_group', yearGroup)
      .eq('archived', false)
      .order('name'),
  ])

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}`} className="hover:text-cyan-600">{yearGroup}</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{subject.name}</span>
      </nav>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Sub-subjects</h2>
        <AddSubSubjectForm parentSubjectId={subjectId} orgId={orgId} />

        {(subSubjects ?? []).length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(subSubjects ?? []).map(s => (
              <FolderTile
                key={s.id}
                href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${s.id}`}
                label={s.name}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Topics</h2>
        <AddTopicForm subjectId={subjectId} yearGroup={yearGroup} />

        {(topics ?? []).length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(topics ?? []).map(t => (
              <FolderTile
                key={t.id}
                href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${subjectId}/${t.id}`}
                label={t.name}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
