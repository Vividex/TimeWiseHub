import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getSubscription, isTeamPlan } from '@/lib/subscription'

const DAILY_API = 'https://api.daily.co/v1'

async function dailyFetch(path: string, method: string, body?: unknown) {
  const res = await fetch(`${DAILY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Daily.co ${method} ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { org_id: orgId } = await req.json() as { org_id?: string }
  if (!orgId) return NextResponse.json({ error: 'org_id required' }, { status: 400 })

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not an org member' }, { status: 403 })

  const sub = await getSubscription(user.id)
  if (!isTeamPlan(sub)) return NextResponse.json({ error: 'Upgrade to Business to use video calls.' }, { status: 403 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .maybeSingle()
  const p = profile as unknown as { full_name: string | null; email: string | null } | null
  const userName = p?.full_name || p?.email || 'Participant'

  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60 // 4 hours

  const room = await dailyFetch('/rooms', 'POST', {
    properties: { exp, enable_transcription: true },
  }) as { name: string; url: string }

  const { data: call, error } = await supabase
    .from('scheduled_calls')
    .insert({
      org_id: orgId,
      title: 'Instant call',
      created_by: user.id,
      daily_room_name: room.name,
      room_url: room.url,
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    })
    .select('id')
    .single()

  if (error || !call) {
    await dailyFetch(`/rooms/${room.name}`, 'DELETE')
    return NextResponse.json({ error: 'Failed to save call' }, { status: 500 })
  }

  const tokenData = await dailyFetch('/meeting-tokens', 'POST', {
    properties: {
      room_name: room.name,
      is_owner: true,
      exp,
      user_name: userName,
    },
  }) as { token: string }

  return NextResponse.json({ roomId: call.id, roomUrl: room.url, token: tokenData.token })
}
