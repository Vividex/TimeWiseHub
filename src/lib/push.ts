import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase-service'
import type { Messaging } from 'firebase-admin/messaging'

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

// Lazily initialized -- if FIREBASE_SERVICE_ACCOUNT_B64 isn't set (e.g. before it's been
// configured in Vercel), this stays null and native sends are silently skipped. Web push must
// keep working unaffected either way, never a hard crash over an optional second channel.
let messagingPromise: Promise<Messaging | null> | null = null

async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_B64) return null
  if (!messagingPromise) {
    messagingPromise = (async () => {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app')
      const { getMessaging } = await import('firebase-admin/messaging')
      const serviceAccount = JSON.parse(
        Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64!, 'base64').toString('utf-8')
      )
      const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) })
      return getMessaging(app)
    })()
  }
  return messagingPromise
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const service = createServiceClient()
  const [{ data: subs }, { data: tokens }] = await Promise.all([
    service.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', userId),
    service.from('push_device_tokens').select('token').eq('user_id', userId),
  ])

  const staleEndpoints: string[] = []
  const staleTokens: string[] = []

  const webPushSends = (subs ?? []).map(async sub => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      )
    } catch (err: unknown) {
      // 410 Gone = subscription expired
      if ((err as { statusCode?: number }).statusCode === 410) staleEndpoints.push(sub.endpoint)
    }
  })

  const nativeSend = (async () => {
    if (!tokens || tokens.length === 0) return
    const messaging = await getFirebaseMessaging()
    if (!messaging) return
    await Promise.allSettled(tokens.map(async row => {
      try {
        await messaging.send({
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          data: payload.url ? { url: payload.url } : undefined,
        })
      } catch (err: unknown) {
        if ((err as { code?: string }).code === 'messaging/registration-token-not-registered') {
          staleTokens.push(row.token)
        }
      }
    }))
  })()

  await Promise.allSettled([...webPushSends, nativeSend])

  if (staleEndpoints.length > 0) {
    await service.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }
  if (staleTokens.length > 0) {
    await service.from('push_device_tokens').delete().in('token', staleTokens)
  }
}
