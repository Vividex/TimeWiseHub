import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-05-27.dahlia',
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
    priceAud: 9.99,
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    projects: Infinity,
    historyDays: Infinity,
    perSeat: false,
  },
  team: {
    label: 'Team',
    priceAud: 7.99,
    priceId: process.env.STRIPE_TEAM_PRICE_ID!,
    projects: Infinity,
    historyDays: Infinity,
    perSeat: true,
  },
} as const

export type Plan = keyof typeof PLANS
