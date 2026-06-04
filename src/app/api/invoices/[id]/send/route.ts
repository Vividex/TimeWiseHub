import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { stripe } from '@/lib/stripe'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  const { data: invoice } = await service
    .from('invoices')
    .select('*, invoice_items(*), clients(name, email)')
    .eq('id', id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  if (invoice.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (invoice.status !== 'draft') return NextResponse.json({ error: 'Invoice already sent' }, { status: 409 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = invoice.invoice_items as any[]

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: items.map((item: { description: string; quantity: number; unit_price: number }) => ({
      price_data: {
        currency: invoice.currency.toLowerCase(),
        // quantity * unit_price expressed as a single total in cents; Stripe quantity must be integer
        unit_amount: Math.round(item.quantity * item.unit_price * 100),
        product_data: { name: item.description },
      },
      quantity: 1,
    })),
    success_url: `${baseUrl}/dashboard/invoices/${id}?paid=1`,
    cancel_url: `${baseUrl}/dashboard/invoices/${id}`,
    metadata: { invoice_id: id, type: 'invoice' },
  })

  await service.from('invoices').update({
    status: 'sent',
    payment_link: session.url,
    stripe_checkout_id: session.id,
  }).eq('id', id)

  return NextResponse.json({ payment_link: session.url })
}
