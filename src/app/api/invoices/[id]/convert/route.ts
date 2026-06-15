import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: quote } = await supabase
    .from('invoices').select('owner_id, status').eq('id', id).single()

  if (!quote || quote.owner_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (quote.status !== 'quote') return NextResponse.json({ error: 'Only quotes can be converted' }, { status: 400 })

  const service = createServiceClient()
  const year = new Date().getFullYear()
  const { count } = await service
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
    .neq('status', 'quote')

  const invoiceNumber = `INV-${year}-${String((count ?? 0) + 1).padStart(3, '0')}`

  const { error } = await service
    .from('invoices')
    .update({ status: 'draft', invoice_number: invoiceNumber })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, invoice_number: invoiceNumber })
}
