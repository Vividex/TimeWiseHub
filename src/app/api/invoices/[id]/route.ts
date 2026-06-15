import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

type LineItemInput = { description: string; quantity: number; unit_price: number }

function resolveStatus(
  currentStatus: string,
  invoiceNumber: string,
  isPersonalEdit: boolean,
  isManagerOrAbove: boolean,
): string {
  // Personal invoice (no org) or owner with no org context — no approval needed
  if (isPersonalEdit) {
    if (currentStatus === 'pending_approval') {
      return invoiceNumber.startsWith('Q-') ? 'quote' : 'draft'
    }
    return currentStatus
  }
  if (isManagerOrAbove) {
    // Manager edit counts as approval
    if (currentStatus === 'pending_approval') {
      return invoiceNumber.startsWith('Q-') ? 'quote' : 'draft'
    }
    return currentStatus
  }
  // Employee edit always requires approval
  return 'pending_approval'
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Fetch invoice to check access and current state
  const { data: invoice } = await service
    .from('invoices')
    .select('id, owner_id, org_id, status, invoice_number')
    .eq('id', id)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (['paid', 'cancelled'].includes(invoice.status)) {
    return NextResponse.json({ error: 'Cannot edit a paid or cancelled record' }, { status: 400 })
  }

  // Determine access and role
  const isOwner = invoice.owner_id === user.id
  let memberRole: string | null = null

  if (invoice.org_id) {
    const { data: membership } = await supabase
      .from('organisation_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', invoice.org_id)
      .maybeSingle()
    memberRole = membership?.role ?? null
  }

  const isOrgMember = !!memberRole
  if (!isOwner && !isOrgMember) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isManagerOrAbove = ['owner', 'admin', 'manager'].includes(memberRole ?? '')
  // Personal edits: owner editing their own invoice with no org context
  const isPersonalEdit = !isOrgMember

  const { clientId, items, dueDate, notes, currency, issueDate } = await req.json() as {
    clientId: string | null
    items: LineItemInput[]
    dueDate: string | null
    notes: string | null
    currency: string
    issueDate: string
  }

  if (!items?.length) return NextResponse.json({ error: 'At least one line item required' }, { status: 400 })

  const newStatus = resolveStatus(invoice.status, invoice.invoice_number, isPersonalEdit, isManagerOrAbove)
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)

  const { error: updateError } = await service
    .from('invoices')
    .update({
      client_id: clientId ?? null,
      issue_date: issueDate,
      due_date: dueDate ?? null,
      currency,
      notes: notes ?? null,
      subtotal,
      status: newStatus,
    })
    .eq('id', id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Replace all line items
  await service.from('invoice_items').delete().eq('invoice_id', id)
  await service.from('invoice_items').insert(
    items.map((item, idx) => ({
      invoice_id: id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      sort_order: idx,
    }))
  )

  return NextResponse.json({ ok: true, status: newStatus })
}
