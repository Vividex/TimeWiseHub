import { createClient } from '@/lib/supabase-server'
import { PLANS, type Plan } from '@/lib/stripe'

export type Subscription = {
  plan: Plan
  status: string | null
  seats: number
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
}

export async function getSubscription(userId: string): Promise<Subscription> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('plan, status, seats, current_period_end, cancel_at_period_end, trial_end, stripe_customer_id, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()

  return data ?? {
    plan: 'free',
    status: null,
    seats: 1,
    current_period_end: null,
    cancel_at_period_end: false,
    trial_end: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
  }
}

export function isActive(sub: Subscription): boolean {
  return sub.status === 'active' || sub.status === 'trialing'
}

export function planLimits(plan: Plan) {
  return PLANS[plan]
}
