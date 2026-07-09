import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { sendSessionScheduledEmail } from '@/lib/session-email'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const { sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: session } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', sessionId)
    .maybeSingle()
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await sendSessionScheduledEmail(sessionId)
  return NextResponse.json({ ok: true })
}
