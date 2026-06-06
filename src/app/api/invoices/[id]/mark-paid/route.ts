import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: invoice } = await service
    .from('invoices')
    .select('owner_id, org_id, subtotal, currency, invoice_number, clients(name)')
    .eq('id', id)
    .single()

  if (!invoice || invoice.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const today = new Date().toISOString().slice(0, 10)
  const clients = invoice.clients as { name: string }[] | { name: string } | null
  const clientName = Array.isArray(clients) ? clients[0]?.name ?? '' : clients?.name ?? ''
  const description = `Invoice ${invoice.invoice_number}${clientName ? ` - ${clientName}` : ''}`

  await Promise.all([
    service.from('invoices').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
    }).eq('id', id),

    service.from('income_entries').insert({
      user_id: invoice.owner_id,
      org_id: invoice.org_id ?? null,
      amount: invoice.subtotal,
      currency: invoice.currency ?? 'AUD',
      category: 'Sales',
      date: today,
      description,
      source_type: 'invoice',
      invoice_id: id,
    }),
  ])

  return NextResponse.json({ ok: true })
}
