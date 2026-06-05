import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { stripe, PLANS, type Plan } from '@/lib/stripe'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan, seats = 1 } = await req.json() as { plan: Plan; seats?: number }
  if (plan === 'free') return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

  const planConfig = PLANS[plan]
  if (!planConfig.priceId) return NextResponse.json({ error: 'No price configured' }, { status: 400 })

  const service = createServiceClient()

  // Get or create Stripe customer
  const { data: sub } = await service
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  let customerId = sub?.stripe_customer_id
  if (!customerId) {
    const { data: profile } = await service.from('profiles').select('email, full_name').eq('id', user.id).single()
    const customer = await stripe.customers.create({
      email: profile?.email ?? user.email,
      name: profile?.full_name ?? undefined,
      metadata: { user_id: user.id },
    })
    customerId = customer.id

    // Upsert subscription row with customer ID
    await service.from('subscriptions').upsert({
      user_id: user.id,
      stripe_customer_id: customerId,
      plan: 'free',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: planConfig.priceId, quantity: planConfig.perSeat ? seats : 1 }],
    success_url: `${baseUrl}/dashboard/billing?success=1`,
    cancel_url: `${baseUrl}/dashboard/billing`,
    allow_promotion_codes: true,
    subscription_data: {
      metadata: { user_id: user.id, plan },
    },
  })

  return NextResponse.json({ url: session.url })
}
