import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clientId, orgId, items, dueDate, notes, currency, issueDate, invoicedEntryIds, isQuote } = await req.json()
  if (!items?.length) return NextResponse.json({ error: 'Invoice must have at least one line item' }, { status: 400 })

  const service = createServiceClient()

  const year = new Date().getFullYear()
  let invoiceNumber: string
  if (isQuote) {
    // Q-YYYY-NNN: count only existing quotes
    const { count: qCount } = await service
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .eq('status', 'quote')
    invoiceNumber = `Q-${year}-${String((qCount ?? 0) + 1).padStart(3, '0')}`
  } else {
    // INV-YYYY-NNN: count only non-quote invoices
    const { count } = await service
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .neq('status', 'quote')
    invoiceNumber = `INV-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`
  }

  const subtotal = items.reduce((s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity * i.unit_price), 0)

  const { data: invoice, error: invError } = await service
    .from('invoices')
    .insert({
      owner_id: user.id,
      org_id: orgId || null,
      client_id: clientId || null,
      invoice_number: invoiceNumber,
      status: isQuote ? 'quote' : 'draft',
      issue_date: issueDate || new Date().toISOString().slice(0, 10),
      due_date: dueDate || null,
      currency: currency || 'AUD',
      subtotal,
      notes: notes || null,
    })
    .select()
    .single()

  if (invError || !invoice) return NextResponse.json({ error: invError?.message }, { status: 500 })

  // Insert line items
  const lineItems = items.map((item: { description: string; quantity: number; unit_price: number; time_entry_id?: string }, idx: number) => ({
    invoice_id: invoice.id,
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price,
    time_entry_id: item.time_entry_id || null,
    sort_order: idx,
  }))

  await service.from('invoice_items').insert(lineItems)

  // Mark time entries as invoiced
  const allEntryIds = [
    ...(invoicedEntryIds ?? []),
    ...items.map((i: { time_entry_id?: string }) => i.time_entry_id).filter(Boolean),
  ]
  const uniqueEntryIds = [...new Set(allEntryIds)] as string[]
  if (uniqueEntryIds.length > 0) {
    await service.from('time_entries').update({ invoice_id: invoice.id }).in('id', uniqueEntryIds).eq('user_id', user.id)
  }

  return NextResponse.json({ id: invoice.id, invoice_number: invoiceNumber })
}
