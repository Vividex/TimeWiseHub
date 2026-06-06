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

export function effectivePlan(sub: Subscription): Plan {
  return isActive(sub) ? sub.plan : 'free'
}

export function isPaidPlan(sub: Subscription): boolean {
  const plan = effectivePlan(sub)
  return plan === 'pro' || plan === 'team'
}

export function isTeamPlan(sub: Subscription): boolean {
  return effectivePlan(sub) === 'team'
}

export function maxActiveProjects(sub: Subscription): number {
  return PLANS[effectivePlan(sub)].projects
}

export function historyCutoffDate(sub: Subscription): string | null {
  const days = PLANS[effectivePlan(sub)].historyDays
  if (days === Infinity) return null

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return cutoff.toISOString().slice(0, 10)
}

export function canExportReports(sub: Subscription): boolean {
  return isPaidPlan(sub)
}
