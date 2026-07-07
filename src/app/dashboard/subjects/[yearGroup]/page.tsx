import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import FolderTile from '@/components/topics/FolderTile'

export default async function YearGroupSubjectsPage({ params }: { params: Promise<{ yearGroup: string }> }) {
  const { yearGroup: yearGroupParam } = await params
  const yearGroup = decodeURIComponent(yearGroupParam)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const subjectsQuery = orgId
    ? supabase.from('subjects').select('id, name').eq('org_id', orgId).eq('archived', false).is('parent_subject_id', null).order('name')
    : supabase.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id).eq('archived', false).is('parent_subject_id', null).order('name')
  const { data: subjects } = await subjectsQuery

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{yearGroup}</span>
      </nav>

      {(subjects ?? []).length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-slate-500">No subjects yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(subjects ?? []).map(s => (
            <FolderTile key={s.id} href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${s.id}`} label={s.name} />
          ))}
        </div>
      )}
    </div>
  )
}
