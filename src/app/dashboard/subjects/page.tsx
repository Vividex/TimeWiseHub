import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SubjectsBrowser from '@/components/topics/SubjectsBrowser'

export default async function SubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const subjectsQuery = orgId
    ? supabase.from('subjects').select('id, name, topics(id, name, year_group, archived)').eq('org_id', orgId).eq('archived', false).order('name')
    : supabase.from('subjects').select('id, name, topics(id, name, year_group, archived)').is('org_id', null).eq('created_by', user.id).eq('archived', false).order('name')
  const { data: subjectRows } = await subjectsQuery

  const allTopicIds = (subjectRows ?? []).flatMap(s =>
    (s.topics as { id: string; archived: boolean }[]).filter(t => !t.archived).map(t => t.id)
  )

  const assetCounts = new Map<string, number>()
  if (allTopicIds.length > 0) {
    const { data: assetRows } = await supabase.from('topic_assets').select('topic_id').in('topic_id', allTopicIds)
    for (const row of assetRows ?? []) {
      assetCounts.set(row.topic_id, (assetCounts.get(row.topic_id) ?? 0) + 1)
    }
  }

  const subjects = (subjectRows ?? []).map(s => ({
    id: s.id,
    name: s.name,
    topics: (s.topics as { id: string; name: string; year_group: string; archived: boolean }[])
      .filter(t => !t.archived)
      .map(t => ({ id: t.id, name: t.name, year_group: t.year_group, assetCount: assetCounts.get(t.id) ?? 0 })),
  }))

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Subjects</h1>
        <SubjectsBrowser subjects={subjects} />
      </div>
    </div>
  )
}
