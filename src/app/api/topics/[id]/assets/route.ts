import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { topicStoragePath } from '@/lib/tutoring/topic-storage'
import { getTopicAccess } from '@/lib/tutoring/topic-access'

const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  default: 50 * 1024 * 1024,
}

function detectAssetType(mimeType: string): 'pdf' | 'docx' | 'xlsx' | 'image' | null {
  if (mimeType === 'application/pdf') return 'pdf'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword'
  ) return 'docx'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  ) return 'xlsx'
  if (mimeType.startsWith('image/')) return 'image'
  return null
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getTopicAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const { data, error } = await service
    .from('topic_assets').select('*').eq('topic_id', id).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const access = await getTopicAccess(id, user.id)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const service = createServiceClient()
  const contentType = req.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    const body = await req.json()
    const { asset_type, name, note_content, external_url } = body

    if (asset_type === 'note') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      const { data, error } = await service.from('topic_assets').insert({
        topic_id: id,
        created_by: user.id,
        asset_type: 'note',
        name: name.trim(),
        note_content: note_content ?? '',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (asset_type === 'link') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      if (!external_url?.trim()) return NextResponse.json({ error: 'URL required' }, { status: 400 })
      const { data, error } = await service.from('topic_assets').insert({
        topic_id: id,
        created_by: user.id,
        asset_type: 'link',
        name: name.trim(),
        external_url: external_url.trim(),
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Invalid asset_type for JSON body' }, { status: 400 })
  }

  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data or application/json' }, { status: 415 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const customName = (formData.get('name') as string | null)?.trim()

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const assetType = detectAssetType(file.type)
  if (!assetType) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}` }, { status: 422 })
  }

  const maxBytes = MAX_BYTES[assetType] ?? MAX_BYTES.default
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `File too large. Max ${Math.round(maxBytes / 1024 / 1024)}MB for ${assetType}` },
      { status: 413 },
    )
  }

  const { data: topic } = await service.from('topics').select('subject_id').eq('id', id).maybeSingle()
  const { data: subject } = topic
    ? await service.from('subjects').select('org_id').eq('id', topic.subject_id).maybeSingle()
    : { data: null }

  const assetId = crypto.randomUUID()
  const storagePath = topicStoragePath({
    orgId: subject?.org_id ?? null,
    userId: user.id,
    topicId: id,
    assetId,
    filename: file.name,
  })

  const { error: uploadError } = await service.storage
    .from('topic-assets')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
  }

  const { data, error } = await service.from('topic_assets').insert({
    id: assetId,
    topic_id: id,
    created_by: user.id,
    asset_type: assetType,
    name: customName || file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
  }).select().single()

  if (error) {
    await service.storage.from('topic-assets').remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
