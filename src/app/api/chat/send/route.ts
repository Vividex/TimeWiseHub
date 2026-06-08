import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { notifyNewChatMessage } from '@/lib/chat/notify'

type AttachmentInput = {
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let payload: {
    id?: string
    conversation_id?: string
    body?: string
    attachments?: AttachmentInput[]
  }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { id, conversation_id, body = '', attachments = [] } = payload
  if (!conversation_id) {
    return NextResponse.json({ error: 'conversation_id required' }, { status: 400 })
  }
  if (!body.trim() && attachments.length === 0) {
    return NextResponse.json({ error: 'Message is empty' }, { status: 400 })
  }

  // RLS-enforced atomic insert of message + attachments. Rejected (403) if the
  // user may not post here (e.g. employee posting to the Announcements channel).
  const { data: messageId, error } = await supabase.rpc('send_chat_message', {
    p_id: id ?? null,
    p_conversation: conversation_id,
    p_body: body,
    p_attachments: attachments.length > 0 ? attachments : null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }

  // Fire-and-forget push fan-out (never blocks the response on push failures).
  notifyNewChatMessage(conversation_id, user.id, body).catch(() => {})

  return NextResponse.json({ ok: true, id: messageId })
}
