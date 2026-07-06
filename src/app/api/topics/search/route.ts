import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  if (!q) return NextResponse.json([])

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const service = createServiceClient()
  const subjectsQuery = orgId
    ? service.from('subjects').select('id, name').eq('org_id', orgId)
    : service.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id)
  const { data: subjectRows } = await subjectsQuery
  const subjectIds = (subjectRows ?? []).map(s => s.id)
  if (subjectIds.length === 0) return NextResponse.json([])
  const subjectNameMap = new Map((subjectRows ?? []).map(s => [s.id, s.name]))

  const { data: topics } = await service
    .from('topics').select('id, name, year_group, subject_id').in('subject_id', subjectIds)
  const topicMap = new Map((topics ?? []).map(t => [t.id, t]))
  const topicIds = [...topicMap.keys()]
  if (topicIds.length === 0) return NextResponse.json([])

  const { data: assets } = await service
    .from('topic_assets')
    .select('id, name, asset_type, topic_id')
    .in('topic_id', topicIds)
    .ilike('name', `%${q}%`)
    .limit(30)

  const results = (assets ?? []).map(a => {
    const topic = topicMap.get(a.topic_id)
    return {
      id: a.id,
      name: a.name,
      asset_type: a.asset_type,
      topic_id: a.topic_id,
      year_group: topic?.year_group ?? '',
      subject_id: topic?.subject_id ?? '',
      subject_name: topic ? (subjectNameMap.get(topic.subject_id) ?? '') : '',
      topic_name: topic?.name ?? '',
    }
  })

  return NextResponse.json(results)
}
