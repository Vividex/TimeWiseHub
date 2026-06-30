export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getStripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/email-notifications'
import { invoiceLetterhead } from '@/lib/invoice-letterhead'
import { hasInvoicePaymentDetails, invoicePaymentDetails, invoicePaymentLines } from '@/lib/invoice-payment-details'
import { getSubscription, isPaidPlan } from '@/lib/subscription'
import InvoiceDocument from '@/components/invoices/InvoiceDocument'

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function normaliseClient(client: unknown): { name: string; email: string | null } | null {
  if (!client) return null
  if (Array.isArray(client)) return normaliseClient(client[0])
  return client as { name: string; email: string | null }
}

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

  const sub = await getSubscription(user.id)
  if (!isPaidPlan(sub)) return NextResponse.json({ error: 'Upgrade to Pro to email invoices.' }, { status: 403 })
  if (invoice.status === 'paid' || invoice.status === 'cancelled') {
    return NextResponse.json({ error: 'This invoice can no longer be sent.' }, { status: 409 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = invoice.invoice_items as any[]

  let paymentLink = invoice.payment_link as string | null

  const [{ data: profile }, subscription, { data: organisation }] = await Promise.all([
    service.from('profiles').select('full_name, email, invoice_letterhead, invoice_payment_details').eq('id', user.id).single(),
    getSubscription(user.id),
    invoice.org_id
      ? service.from('organisations').select('name, invoice_letterhead, invoice_payment_details').eq('id', invoice.org_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const letterhead = invoiceLetterhead({ profile, organisation, subscription })
  const paymentDetails = invoicePaymentDetails({ profile, organisation })
  const paymentLines = invoicePaymentLines(paymentDetails)

  if (invoice.status === 'draft') {
    let stripeCheckoutId: string | null = null

    if (process.env.STRIPE_SECRET_KEY) {
      try {
        // Stripe requires unit_amount >= 1 cent; skip items with zero value
        const billableItems = items.filter((item: { quantity: number; unit_price: number }) =>
          Math.round(item.quantity * item.unit_price * 100) > 0
        )
        if (billableItems.length > 0) {
          const session = await getStripe().checkout.sessions.create({
            mode: 'payment',
            line_items: billableItems.map((item: { description: string; quantity: number; unit_price: number }) => ({
              price_data: {
                currency: invoice.currency.toLowerCase(),
                unit_amount: Math.round(item.quantity * item.unit_price * 100),
                product_data: { name: item.description },
              },
              quantity: 1,
            })),
            success_url: `${baseUrl}/dashboard/invoices/${id}?paid=1`,
            cancel_url: `${baseUrl}/dashboard/invoices/${id}`,
            metadata: { invoice_id: id, type: 'invoice' },
          })
          paymentLink = session.url
          stripeCheckoutId = session.id
        }
      } catch (stripeErr) {
        console.error('Stripe session creation failed:', stripeErr)
        // Continue without payment link — invoice is still marked sent
      }
    }

    await service.from('invoices').update({
      status: 'sent',
      payment_link: paymentLink,
      stripe_checkout_id: stripeCheckoutId,
    }).eq('id', id)
  }

  const client = normaliseClient(invoice.clients)
  if (!client?.email) {
    return NextResponse.json({
      payment_link: paymentLink,
      email_sent: false,
      email_error: 'Client has no email address.',
    })
  }

  const subject = `Invoice ${invoice.invoice_number} from ${letterhead}`
  const total = `${invoice.currency} ${Number(invoice.subtotal).toFixed(2)}`
  const lines = [
    `Hi ${client.name},`,
    `${letterhead} has sent you invoice ${invoice.invoice_number} for ${total}.`,
    paymentLink ? `Pay securely here: ${paymentLink}` : '',
    hasInvoicePaymentDetails(paymentDetails) ? 'Bank transfer details:' : '',
    ...paymentLines,
    hasInvoicePaymentDetails(paymentDetails) ? `Use invoice ${invoice.invoice_number} as the payment reference.` : '',
    invoice.due_date ? `Due date: ${invoice.due_date}` : '',
  ].filter(Boolean)
  const itemRows = items.map((item: { description: string; quantity: number; unit_price: number }) => {
    const amount = Number(item.quantity) * Number(item.unit_price)
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.description)}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${Number(item.quantity).toFixed(2)}</td><td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(invoice.currency)} ${amount.toFixed(2)}</td></tr>`
  }).join('')

  // Generate invoice PDF
  let pdfAttachment: { filename: string; content: string } | undefined
  try {
    const pdfItems = items.map((item: { description: string; quantity: number; unit_price: number }) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      amount: Number(item.quantity) * Number(item.unit_price),
    }))
    const element = React.createElement(InvoiceDocument, {
      invoiceNumber: invoice.invoice_number as string,
      letterhead,
      clientName: client.name,
      dueDate: invoice.due_date as string | null,
      currency: invoice.currency as string,
      items: pdfItems,
      subtotal: Number(invoice.subtotal),
      paymentLink,
      paymentLines,
      hasPaymentDetails: hasInvoicePaymentDetails(paymentDetails),
    }) as unknown as React.ReactElement<DocumentProps>
    const buffer = await renderToBuffer(element)
    pdfAttachment = {
      filename: `invoice-${invoice.invoice_number}.pdf`,
      content: buffer.toString('base64'),
    }
  } catch (pdfErr) {
    console.error('Invoice PDF generation failed:', pdfErr)
    // Continue without attachment — don't block the email send
  }

  let emailSent = false
  let emailSkipped = false
  let emailError: string | null = null

  try {
    const emailResult = await sendEmail({
      to: client.email,
      subject,
      text: lines.join('\n\n'),
      attachments: pdfAttachment ? [pdfAttachment] : undefined,
      html: `
        <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
          ${lines.filter(line => !line.startsWith('Pay securely here:')).map(line => `<p>${escapeHtml(line)}</p>`).join('')}
          ${paymentLink ? `<p style="margin:20px 0;"><a href="${paymentLink}" style="background:#0891b2;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Pay Invoice</a></p>` : ''}
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
            <thead><tr><th style="padding:8px 0;border-bottom:1px solid #d1d5db;text-align:left;">Description</th><th style="padding:8px 0;border-bottom:1px solid #d1d5db;text-align:right;">Qty</th><th style="padding:8px 0;border-bottom:1px solid #d1d5db;text-align:right;">Amount</th></tr></thead>
            <tbody>${itemRows}</tbody>
          </table>
          <p style="font-size:18px;font-weight:700;">Total: ${escapeHtml(total)}</p>
          ${hasInvoicePaymentDetails(paymentDetails) ? `
            <div style="background:#f9fafb;border-radius:8px;padding:16px;margin-top:20px;">
              <p style="font-weight:700;margin:0 0 8px;">Bank transfer details</p>
              ${paymentLines.map(line => `<p style="margin:4px 0;">${escapeHtml(line)}</p>`).join('')}
              <p style="margin:8px 0 0;color:#6b7280;font-size:12px;">Use invoice ${escapeHtml(invoice.invoice_number)} as the payment reference.</p>
            </div>
          ` : ''}
        </div>
      `,
    })
    emailSkipped = Boolean((emailResult as { skipped?: boolean }).skipped)
    emailSent = !emailSkipped
  } catch (error) {
    emailError = error instanceof Error ? error.message : 'Email could not be sent.'
  }

  return NextResponse.json({
    payment_link: paymentLink,
    email_sent: emailSent,
    email_skipped: emailSkipped,
    email_error: emailError,
    to: client.email,
  })
}
