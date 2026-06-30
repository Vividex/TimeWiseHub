export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { invoiceLetterhead, invoiceLogo } from '@/lib/invoice-letterhead'
import { hasInvoicePaymentDetails, invoicePaymentDetails, invoicePaymentLines } from '@/lib/invoice-payment-details'
import { getSubscription } from '@/lib/subscription'
import InvoiceDocument from '@/components/invoices/InvoiceDocument'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (invoice.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: profile }, subscription, { data: organisation }] = await Promise.all([
    service.from('profiles').select('full_name, email, invoice_letterhead, logo_url, invoice_payment_details').eq('id', user.id).single(),
    getSubscription(user.id),
    invoice.org_id
      ? service.from('organisations').select('name, invoice_letterhead, logo_url, invoice_payment_details').eq('id', invoice.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const letterhead = invoiceLetterhead({ profile, organisation, subscription })
  const logoUrl = invoiceLogo({ profile, organisation, subscription }) ?? undefined
  const paymentDetails = invoicePaymentDetails({ profile, organisation })
  const paymentLines = invoicePaymentLines(paymentDetails)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (invoice.invoice_items as any[]).map((item: { description: string; quantity: number; unit_price: number }) => ({
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unit_price),
    amount: Number(item.quantity) * Number(item.unit_price),
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientRow = (invoice as any).clients
  const clientName = Array.isArray(clientRow) ? clientRow[0]?.name : clientRow?.name ?? 'Client'

  const element = React.createElement(InvoiceDocument, {
    invoiceNumber: invoice.invoice_number as string,
    letterhead,
    clientName,
    dueDate: invoice.due_date as string | null,
    currency: invoice.currency as string,
    items,
    subtotal: Number(invoice.subtotal),
    paymentLines,
    hasPaymentDetails: hasInvoicePaymentDetails(paymentDetails),
    logoUrl,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const filename = `invoice-${invoice.invoice_number}.pdf`

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  })
}
