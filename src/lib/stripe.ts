import Stripe from 'stripe'

let _stripe: Stripe | null = null
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-05-27.dahlia' })
  }
  return _stripe
}

// Keep named export for backwards compatibility
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

export const PLANS = {
  free: {
    label: 'Free',
    priceAud: 0,
    priceId: null,
    projects: 3,
    historyDays: 30,
    perSeat: false,
  },
  pro: {
    label: 'Pro',
    priceAud: 9,
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    projects: Infinity,
    historyDays: Infinity,
    perSeat: false,
  },
  team: {
    label: 'Team',
    priceAud: 24,
    priceId: process.env.STRIPE_TEAM_PRICE_ID!,
    projects: Infinity,
    historyDays: Infinity,
    perSeat: false,
  },
} as const

export type Plan = keyof typeof PLANS
