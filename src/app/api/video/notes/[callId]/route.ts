import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ callId: string }> }
) {
  const { callId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: call } = await service
    .from('scheduled_calls')
    .select('org_id, transcript, summary')
    .eq('id', callId)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const c = call as unknown as { org_id: string; transcript: string | null; summary: string | null }

  const { data: membership } = await service
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', c.org_id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ transcript: c.transcript, summary: c.summary })
}
