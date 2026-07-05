import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { deleteTopicAssetFile } from '@/lib/tutoring/topic-storage'
import { getTopicAccess } from '@/lib/tutoring/topic-access'

export async function DELETE(
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
    .from('topic_assets').select('created_by, storage_path').eq('id', assetId).eq('topic_id', id).maybeSingle()
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (asset.created_by !== user.id && !access.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service.from('topic_assets').delete().eq('id', assetId).eq('topic_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (asset.storage_path) {
    await deleteTopicAssetFile(asset.storage_path)
  }

  return NextResponse.json({ ok: true })
}
