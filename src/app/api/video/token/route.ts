import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { ensureGuestChatUser, ensureSessionChatParticipant, mintGuestChatToken } from '@/lib/session-chat'

const DAILY_API = 'https://api.daily.co/v1'

async function issueToken(roomName: string, isOwner: boolean, displayName?: string) {
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: isOwner,
        exp,
        ...(displayName ? { user_name: displayName } : {}),
      },
    }),
  })
  if (!res.ok) throw new Error(`Token issue failed: ${res.status}`)
  const data = await res.json() as { token: string }
  return data.token
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const room = searchParams.get('room')
  const guestToken = searchParams.get('guestToken')
  const displayName = searchParams.get('displayName') ?? undefined

  if (!room) return NextResponse.json({ error: 'room required' }, { status: 400 })

  // External guest path
  if (guestToken) {
    const service = createServiceClient()
    const { data: invitee } = await service
      .from('call_invitees')
      .select('id, call_id, scheduled_calls(daily_room_name, session_id)')
      .eq('guest_token', guestToken)
      .maybeSingle()

    if (!invitee) return NextResponse.json({ error: 'Invalid guest token' }, { status: 403 })

    const inviteeCall = invitee.scheduled_calls as unknown as { daily_room_name: string; session_id: string | null } | null
    if (inviteeCall?.daily_room_name !== room) return NextResponse.json({ error: 'Token/room mismatch' }, { status: 403 })

    const token = await issueToken(room, false, displayName)

    let chat: { conversationId: string; email: string; tokenHash: string } | null = null
    if (inviteeCall.session_id) {
      const { data: session } = await service
        .from('sessions').select('client_id').eq('id', inviteeCall.session_id).maybeSingle()
      if (session?.client_id) {
        try {
          const { userId, email } = await ensureGuestChatUser(session.client_id)
          const conversationId = await ensureSessionChatParticipant(inviteeCall.session_id, userId)
          const tokenHash = await mintGuestChatToken(email)
          chat = { conversationId, email, tokenHash }
        } catch {
          chat = null // chat is a bonus, not a call-joining requirement — never block the video join over it
        }
      }
    }

    return NextResponse.json({ token, chat })
  }

  // Org member path
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, created_by, org_id')
    .eq('daily_room_name', room)
    .maybeSingle()

  if (!call) return NextResponse.json({ error: 'Call not found' }, { status: 404 })

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', call.org_id)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Not an org member' }, { status: 403 })

  const token = await issueToken(room, call.created_by === user.id, displayName)
  return NextResponse.json({ token })
}
