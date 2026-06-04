import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createServiceClient } from '@/lib/supabase-service'
import type Stripe from 'stripe'

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return new NextResponse('Webhook secret not configured', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return new NextResponse('Webhook signature verification failed', { status: 400 })
  }

  const service = createServiceClient()

  async function upsertSubscription(stripeSub: Stripe.Subscription) {
    const userId = stripeSub.metadata?.user_id
    if (!userId) return

    const item = stripeSub.items.data[0]
    const priceId = item?.price?.id
    const plan = priceId === process.env.STRIPE_PRO_PRICE_ID ? 'pro'
               : priceId === process.env.STRIPE_TEAM_PRICE_ID ? 'team'
               : 'free'

    // current_period_end moved to item level in basil API; fall back to top-level for older events
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = stripeSub as any
    const periodEnd: number | undefined = item?.current_period_end ?? raw.current_period_end
    const trialEnd: number | null = raw.trial_end ?? null

    await service.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: stripeSub.customer as string,
      stripe_subscription_id: stripeSub.id,
      plan,
      status: stripeSub.status,
      seats: item?.quantity ?? 1,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: raw.cancel_at_period_end ?? false,
      trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await upsertSubscription(event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await service.from('subscriptions')
        .update({ plan: 'free', status: 'canceled', stripe_subscription_id: null, updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.id)
      break
    }

    case 'invoice.payment_failed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any
      const subId: string | undefined = invoice.subscription ?? invoice.parent?.subscription_details?.subscription
      if (subId) {
        await service.from('subscriptions')
          .update({ status: 'past_due', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subId)
      }
      break
    }

    case 'invoice.payment_succeeded': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any
      const subId: string | undefined = invoice.subscription ?? invoice.parent?.subscription_details?.subscription
      if (subId) {
        await service.from('subscriptions')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('stripe_subscription_id', subId)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
