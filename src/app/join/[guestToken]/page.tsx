import { createServiceClient } from '@/lib/supabase-service'
import GuestJoinClient from '@/components/video/GuestJoinClient'
import { getSubscription, isPaidPlan } from '@/lib/subscription'

export default async function GuestJoinPage({
  params,
}: {
  params: Promise<{ guestToken: string }>
}) {
  const { guestToken } = await params
  const service = createServiceClient()

  const { data: invitee } = await service
    .from('call_invitees')
    .select('id, display_name, scheduled_calls(id, title, starts_at, daily_room_name, room_url, session_id)')
    .eq('guest_token', guestToken)
    .maybeSingle()

  const call = (invitee?.scheduled_calls as unknown as {
    id: string
    title: string
    starts_at: string | null
    daily_room_name: string
    room_url: string
    session_id: string | null
  } | null)

  if (!call?.daily_room_name || !call?.room_url) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <p className="text-lg">This invite link is not valid or has expired.</p>
      </div>
    )
  }

  let whiteboardAllowed = false
  if (call.session_id) {
    const { data: session } = await service
      .from('sessions').select('created_by').eq('id', call.session_id).maybeSingle()
    if (session?.created_by) {
      whiteboardAllowed = isPaidPlan(await getSubscription(session.created_by))
    }
  }

  return (
    <GuestJoinClient
      callId={call.id}
      callTitle={call.title}
      roomUrl={call.room_url}
      dailyRoomName={call.daily_room_name}
      guestToken={guestToken}
      defaultName={invitee?.display_name ?? ''}
      sessionId={call.session_id}
      whiteboardAllowed={whiteboardAllowed}
    />
  )
}
