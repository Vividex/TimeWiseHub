import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token, platform } = await req.json()
  if (!token || !platform) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 400 })
  }

  const service = createServiceClient()
  await service.from('push_device_tokens').upsert({
    user_id: user.id,
    token,
    platform,
  }, { onConflict: 'user_id, token' })

  return NextResponse.json({ ok: true })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  await service.from('push_device_tokens').delete().eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
