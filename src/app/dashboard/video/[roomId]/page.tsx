import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import CallRoom from '@/components/video/CallRoom'

const DAILY_API = 'https://api.daily.co/v1'

async function issueOrgMemberToken(roomName: string, isOwner: boolean): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { room_name: roomName, is_owner: isOwner, exp },
    }),
  })
  if (!res.ok) throw new Error(`Token issue failed: ${res.status}`)
  const data = await res.json() as { token: string }
  return data.token
}

export default async function CallRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, daily_room_name, room_url, created_by, org_id')
    .eq('id', roomId)
    .maybeSingle()

  if (!call?.daily_room_name || !call?.room_url) redirect('/dashboard/video')

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', call.org_id)
    .maybeSingle()

  if (!membership) redirect('/dashboard/video')

  let token: string
  try {
    token = await issueOrgMemberToken(call.daily_room_name, call.created_by === user.id)
  } catch {
    redirect('/dashboard/video')
  }

  return (
    <CallRoom
      roomUrl={call.room_url}
      token={token!}
      dailyRoomName={call.daily_room_name}
      isCreator={call.created_by === user.id}
      callId={roomId}
    />
  )
}
