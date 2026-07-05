import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
import { getTopicAccess } from '@/lib/tutoring/topic-access'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id, assetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getTopicAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const { data: asset } = await service
    .from('topic_assets').select('storage_path').eq('id', assetId).eq('topic_id', id).maybeSingle()

  if (!asset?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = await createTopicAssetSignedUrl(asset.storage_path)
  if (!url) return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })

  return NextResponse.json({ url })
}
