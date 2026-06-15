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
    .select('id, org_id, status, invoice_number')
    .eq('id', id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Only pending_approval records can be approved' }, { status: 400 })
  }

  // Must be a manager or above in the same org
  if (!invoice.org_id) return NextResponse.json({ error: 'No org associated' }, { status: 400 })

  const { data: membership } = await supabase
    .from('organisation_members')
    .select('role')
    .eq('user_id', user.id)
    .eq('org_id', invoice.org_id)
    .maybeSingle()

  if (!['owner', 'admin', 'manager'].includes(membership?.role ?? '')) {
    return NextResponse.json({ error: 'Manager or above required to approve' }, { status: 403 })
  }

  const targetStatus = invoice.invoice_number.startsWith('Q-') ? 'quote' : 'draft'

  const { error } = await service
    .from('invoices')
    .update({ status: targetStatus })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: targetStatus })
}
