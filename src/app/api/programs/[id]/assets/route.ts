import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { programStoragePath } from '@/lib/program-storage'
import { getTopicAccess } from '@/lib/tutoring/topic-access'
import type { ProgramAssetType } from '@/types/programs'

const MAX_BYTES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  default: 50 * 1024 * 1024,
}

function detectAssetType(mimeType: string): ProgramAssetType | null {
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
  if (mimeType.startsWith('audio/')) return 'audio'
  return null
}

async function assertAdminAccess(programId: string, userId: string) {
  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle()
  if (!program) return null
  if (program.owner_id === userId) return program
  const { data: m } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  if (!m || !['owner', 'admin', 'manager'].includes(m.role as string)) return null
  return program
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: program } = await service
    .from('programs').select('id, org_id, owner_id').eq('id', id).maybeSingle()

  if (!program) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()
  if (program.owner_id !== user.id && !membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const categoryFilter = url.searchParams.get('category')
  let query = service.from('program_assets').select('*').eq('program_id', id).order('sort_order').order('created_at')
  if (categoryFilter === 'uncategorised') {
    query = query.is('category_id', null)
  } else if (categoryFilter) {
    query = query.eq('category_id', categoryFilter)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const program = await assertAdminAccess(id, user.id)
  if (!program) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const contentType = req.headers.get('content-type') ?? ''

  // ── Note or Link type (JSON body) ───────────────────────────
  if (contentType.includes('application/json')) {
    const body = await req.json()
    const { asset_type, name, note_content, external_url, category_id, link_topic_asset_id } = body

    if (link_topic_asset_id) {
      const service = createServiceClient()
      const { data: topicAsset } = await service
        .from('topic_assets').select('id, name, asset_type, topic_id').eq('id', link_topic_asset_id).maybeSingle()
      if (!topicAsset) return NextResponse.json({ error: 'Worksheet not found' }, { status: 404 })

      const access = await getTopicAccess(topicAsset.topic_id, user.id)
      if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: topicAsset.asset_type,
        name: topicAsset.name,
        linked_topic_asset_id: topicAsset.id,
        ai_status: 'skipped',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (asset_type === 'note') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      const service = createServiceClient()
      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: 'note',
        name: name.trim(),
        note_content: note_content ?? '',
        ai_status: 'pending',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    if (asset_type === 'link' || asset_type === 'video') {
      if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      if (!external_url?.trim()) return NextResponse.json({ error: 'URL required' }, { status: 400 })
      const service = createServiceClient()
      const { data, error } = await service.from('program_assets').insert({
        program_id: id,
        owner_id: user.id,
        category_id: category_id ?? null,
        asset_type: asset_type as ProgramAssetType,
        name: name.trim(),
        external_url: external_url.trim(),
        ai_status: 'skipped',
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Invalid asset_type for JSON body' }, { status: 400 })
  }

  // ── File upload (multipart) ──────────────────────────────────
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected multipart/form-data or application/json' }, { status: 415 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const categoryId = formData.get('category_id') as string | null
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

  const service = createServiceClient()
  const assetId = crypto.randomUUID()
  const storagePath = programStoragePath({
    orgId: program.org_id,
    ownerId: user.id,
    programId: id,
    assetId,
    filename: file.name,
  })

  const { error: uploadError } = await service.storage
    .from('program-assets')
    .upload(storagePath, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 })
  }

  const { data, error } = await service.from('program_assets').insert({
    id: assetId,
    program_id: id,
    owner_id: user.id,
    category_id: categoryId || null,
    asset_type: assetType,
    name: customName || file.name,
    storage_path: storagePath,
    file_size_bytes: file.size,
    mime_type: file.type,
    ai_status: assetType === 'image' || assetType === 'pdf' ? 'pending' : 'skipped',
  }).select().single()

  if (error) {
    await service.storage.from('program-assets').remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
