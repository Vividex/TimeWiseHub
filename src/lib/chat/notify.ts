import { createServiceClient } from '@/lib/supabase-service'
import { sendPushToUser } from '@/lib/push'
import { getUserAvailability } from '@/lib/chat/presence'

function preview(body: string): string {
  const trimmed = body.trim()
  if (!trimmed) return 'Sent an attachment'
  return trimmed.length > 120 ? trimmed.slice(0, 117) + '…' : trimmed
}

/**
 * Fan out a web push for a freshly-sent chat message. Realtime already
 * delivered the message live; this only handles the push, and only to
 * recipients whose preferences and boundaries (quiet hours / leave / holiday)
 * allow it. Presence ("is the thread focused?") is enforced in the SW.
 */
export async function notifyNewChatMessage(conversationId: string, senderId: string, body: string) {
  const service = createServiceClient()

  const { data: conv } = await service
    .from('chat_conversations')
    .select('type, title, session_id')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) return

  const { data: sender } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', senderId)
    .maybeSingle()
  const senderName = sender?.full_name || sender?.email || 'Someone'

  const title = conv.type === 'channel'
    ? `📣 ${conv.title ?? 'Announcements'}`
    : senderName

  let url = `/dashboard/chat?c=${conversationId}`
  if (conv.type === 'session' && conv.session_id) {
    const { data: session } = await service
      .from('sessions').select('client_id').eq('id', conv.session_id).maybeSingle()
    if (session?.client_id) url = `/dashboard/clients/${session.client_id}/sessions/${conv.session_id}`
  }

  const { data: participants } = await service
    .from('chat_participants')
    .select('user_id')
    .eq('conversation_id', conversationId)
  if (!participants) return

  const recipients = participants.map(p => p.user_id).filter(id => id !== senderId)

  await Promise.allSettled(recipients.map(async userId => {
    const { data: profile } = await service
      .from('profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .maybeSingle()
    const prefs = (profile?.notification_preferences ?? {}) as Record<string, unknown>
    if (prefs.chat_messages === false) return

    const { available } = await getUserAvailability(userId)
    if (!available) return

    await sendPushToUser(userId, {
      title,
      body: conv.type === 'channel' ? preview(body) : `${senderName}: ${preview(body)}`,
      url,
      tag: `chat:${conversationId}`,
    })
  }))
}
