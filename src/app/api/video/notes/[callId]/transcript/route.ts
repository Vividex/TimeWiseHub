import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chunk } = await req.json() as { chunk?: string }
  if (!chunk) return NextResponse.json({ ok: true })

  const service = createServiceClient()

  const { data: call } = await service
    .from('scheduled_calls')
    .select('org_id, transcript, transcript_started_by')
    .eq('id', callId)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const c = call as unknown as {
    org_id: string
    transcript: string | null
    transcript_started_by: string | null
  }

  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', c.org_id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await service
    .from('scheduled_calls')
    .update({
      transcript: (c.transcript ?? '') + chunk,
      transcript_started_by: c.transcript_started_by ?? user.id,
    })
    .eq('id', callId)

  return NextResponse.json({ ok: true })
}
