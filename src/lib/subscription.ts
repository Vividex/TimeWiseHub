import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
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

const SUB_FIELDS = 'plan, status, seats, current_period_end, cancel_at_period_end, trial_end, stripe_customer_id, stripe_subscription_id'

const DEFAULT_SUB: Subscription = {
  plan: 'free',
  status: null,
  seats: 1,
  current_period_end: null,
  cancel_at_period_end: false,
  trial_end: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
}

export async function getSubscription(userId: string): Promise<Subscription> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select(SUB_FIELDS)
    .eq('user_id', userId)
    .maybeSingle()

  // User has their own active subscription — return it directly
  if (data && (data.status === 'active' || data.status === 'trialing')) {
    return data as Subscription
  }

  // No active subscription — inherit from the org owner if this user is a member
  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members')
    .select('org_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (!membership?.org_id) return (data as Subscription | null) ?? DEFAULT_SUB

  const { data: ownerRow } = await service
    .from('organisation_members')
    .select('user_id')
    .eq('org_id', membership.org_id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle()

  if (!ownerRow?.user_id || ownerRow.user_id === userId) {
    return (data as Subscription | null) ?? DEFAULT_SUB
  }

  const { data: ownerSub } = await service
    .from('subscriptions')
    .select(SUB_FIELDS)
    .eq('user_id', ownerRow.user_id)
    .maybeSingle()

  return (ownerSub as Subscription | null) ?? (data as Subscription | null) ?? DEFAULT_SUB
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

export function isProPlan(sub: Subscription): boolean {
  return effectivePlan(sub) === 'pro'
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
