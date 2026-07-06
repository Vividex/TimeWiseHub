import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import TopicAssetsPanel from '@/components/topics/TopicAssetsPanel'

export default async function TopicFilesPage({
  params,
}: {
  params: Promise<{ yearGroup: string; subjectId: string; topicId: string }>
}) {
  const { yearGroup: yearGroupParam, subjectId, topicId } = await params
  const yearGroup = decodeURIComponent(yearGroupParam)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: subject } = await supabase.from('subjects').select('id, name').eq('id', subjectId).maybeSingle()
  if (!subject) notFound()

  const { data: topic } = await supabase.from('topics').select('id, name').eq('id', topicId).maybeSingle()
  if (!topic) notFound()

  return (
    <div className="space-y-4">
      <nav className="text-xs font-semibold text-gray-500 dark:text-slate-500">
        <Link href="/dashboard/subjects" className="hover:text-cyan-600">Subjects</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}`} className="hover:text-cyan-600">{yearGroup}</Link>
        <span className="mx-1">›</span>
        <Link href={`/dashboard/subjects/${encodeURIComponent(yearGroup)}/${subjectId}`} className="hover:text-cyan-600">{subject.name}</Link>
        <span className="mx-1">›</span>
        <span className="text-gray-900 dark:text-slate-200">{topic.name}</span>
      </nav>

      <TopicAssetsPanel topicId={topicId} />
    </div>
  )
}
