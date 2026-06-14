import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

const DAILY_API = 'https://api.daily.co/v1'

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, created_by')
    .eq('daily_room_name', name)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  if (call.created_by !== user.id) {
    return NextResponse.json({ error: 'Only the call creator can end the call' }, { status: 403 })
  }

  await fetch(`${DAILY_API}/rooms/${name}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${process.env.DAILY_API_KEY}` },
  })

  await supabase
    .from('scheduled_calls')
    .update({ ends_at: new Date().toISOString() })
    .eq('id', call.id)
    .is('ends_at', null)

  return NextResponse.json({ ok: true })
}
