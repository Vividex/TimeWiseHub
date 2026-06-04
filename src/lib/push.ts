import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-service'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export type PushPayload = {
  title: string
  body: string
  url?: string
  tag?: string
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const service = createServiceClient()
  const { data: subs } = await service
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (!subs || subs.length === 0) return

  const stale: string[] = []
  await Promise.allSettled(
    subs.map(async sub => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        )
      } catch (err: unknown) {
        // 410 Gone = subscription expired
        if ((err as { statusCode?: number }).statusCode === 410) stale.push(sub.endpoint)
      }
    })
  )

  if (stale.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', stale)
  }
}
