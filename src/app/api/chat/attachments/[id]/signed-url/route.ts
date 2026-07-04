import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

// Attachments outside the chat-attachments bucket (e.g. shared program files) can't be
// signed directly from the browser — that bucket has no client-facing storage policies.
// This mints a fresh signed URL server-side on every view instead of baking one into the
// message forever, so shared files never go stale.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS on chat_attachments only allows rows from conversations the caller participates
  // in — a successful read here IS the authorization check, nothing further to verify.
  const { data: attachment } = await supabase
    .from('chat_attachments')
    .select('storage_path, bucket')
    .eq('id', id)
    .maybeSingle()

  if (!attachment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  const { data } = await service.storage
    .from(attachment.bucket)
    .createSignedUrl(attachment.storage_path, 3600)

  if (!data?.signedUrl) return NextResponse.json({ error: 'Failed to sign URL' }, { status: 500 })

  return NextResponse.json({ url: data.signedUrl })
}
