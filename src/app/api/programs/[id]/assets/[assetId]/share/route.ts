import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

type ShareAttachment = {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  bucket: string
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; assetId: string }> },
) {
  const { id: programId, assetId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversation_id: conversationId } = await req.json() as { conversation_id?: string }
  if (!conversationId) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })

  const service = createServiceClient()

  const [{ data: asset }, { data: program }, { data: conversation }] = await Promise.all([
    service.from('program_assets').select('*').eq('id', assetId).eq('program_id', programId).maybeSingle(),
    service.from('programs').select('id, org_id, owner_id').eq('id', programId).maybeSingle(),
    service.from('chat_conversations').select('id, type, session_id').eq('id', conversationId).maybeSingle(),
  ])

  if (!asset || !program) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!conversation || conversation.type !== 'session' || !conversation.session_id) {
    return NextResponse.json({ error: 'Not a session chat' }, { status: 400 })
  }

  // Cross-check: the session behind this chat must actually be linked to this asset's
  // program — stops a participant sharing an unrelated program's file into this chat.
  const { data: session } = await service
    .from('sessions').select('program_id').eq('id', conversation.session_id).maybeSingle()
  if (!session || session.program_id !== programId) {
    return NextResponse.json({ error: 'Asset is not linked to this session' }, { status: 403 })
  }

  const isOwner = program.owner_id === user.id
  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()
  if (!isOwner && !membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: string
  const attachments: ShareAttachment[] = []

  if (asset.asset_type === 'note') {
    body = `Shared: ${asset.name}\n\n${asset.note_content ?? ''}`
  } else if (asset.storage_path) {
    body = `Shared: ${asset.name}`
    attachments.push({
      storage_path: asset.storage_path,
      file_name: asset.name,
      mime_type: asset.mime_type ?? 'application/octet-stream',
      size_bytes: asset.file_size_bytes ?? 0,
      bucket: 'program-assets',
    })
  } else {
    body = `Shared: ${asset.name}\n${asset.external_url ?? ''}`
  }

  // Via the caller's own session (not service role) so can_post_chat/RLS still applies
  // and sender_id is set correctly from auth.uid().
  const { data: messageId, error } = await supabase.rpc('send_chat_message', {
    p_id: null,
    p_conversation: conversationId,
    p_body: body,
    p_attachments: attachments.length > 0 ? attachments : null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 403 })

  return NextResponse.json({ ok: true, id: messageId })
}
