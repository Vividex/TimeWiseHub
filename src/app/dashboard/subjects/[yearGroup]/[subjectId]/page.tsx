import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FolderTile from '@/components/topics/FolderTile'

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

  const { data: topics } = await supabase
    .from('topics')
    .select('id, name')
    .eq('subject_id', subjectId)
    .eq('year_group', yearGroup)
    .eq('archived', false)
    .order('name')

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}`} className="hover:text-cyan-600">{yearGroup}</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{subject.name}</span>
      </nav>

      {(topics ?? []).length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-slate-500">
          No topics for {yearGroup} · {subject.name} yet — create one while booking a session.
        </p>
      ) : (
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
    </div>
  )
}
