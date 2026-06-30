import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { invoiceLetterhead, invoiceLogo } from '@/lib/invoice-letterhead'
import { hasInvoicePaymentDetails, invoicePaymentDetails, invoicePaymentLines } from '@/lib/invoice-payment-details'
import { getSubscription, isPaidPlan } from '@/lib/subscription'
import InvoiceActions from '@/components/invoices/InvoiceActions'

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
  quote:     'bg-violet-100 text-violet-700',
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-cyan-100 text-cyan-700',
  paid:      'bg-green-100 text-green-700',
  overdue:   'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function InvoiceDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ paid?: string }>
}) {
  const { id } = await params
  const { paid } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), clients(name, email, address)')
    .eq('id', id)
    .single()

  if (!invoice) notFound()

  // Determine role — RLS already ensures the user has read access
  let memberRole: string | null = null
  if (invoice.org_id) {
    const { data: membership } = await supabase
      .from('organisation_members').select('role').eq('user_id', user.id).eq('org_id', (invoice as { org_id: string }).org_id).maybeSingle()
    memberRole = membership?.role ?? null
  }
  const isOwner = invoice.owner_id === user.id
  if (!isOwner && !memberRole) notFound()

  const canApprove = ['owner', 'admin', 'manager'].includes(memberRole ?? '')
  const isEmployee = !!invoice.org_id && !canApprove
  const canEdit = !['paid', 'cancelled'].includes(invoice.status as string)

  const [{ data: profile }, subscription, { data: organisation }] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, email, invoice_letterhead, logo_url, invoice_payment_details')
      .eq('id', user.id)
      .single(),
    getSubscription(user.id),
    invoice.org_id
      ? supabase
        .from('organisations')
        .select('name, invoice_letterhead, logo_url, invoice_payment_details')
        .eq('id', invoice.org_id)
        .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const letterhead = invoiceLetterhead({ profile, organisation, subscription })
  const logoUrl = invoiceLogo({ profile, organisation, subscription })
  const paymentDetails = invoicePaymentDetails({ profile, organisation })
  const paymentLines = invoicePaymentLines(paymentDetails)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (invoice.invoice_items as any[]).sort((a, b) => a.sort_order - b.sort_order)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (invoice as any).clients as { name: string; email: string | null; address: string | null } | null

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {paid && (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
            Payment received — invoice marked as paid.
          </div>
        )}

        {/* Header actions */}
        <div className="flex items-center justify-between gap-4">
          {invoice.status === 'quote' && invoice.client_id ? (
            <Link href={`/dashboard/clients/${invoice.client_id}/quotes`} className="text-sm font-bold text-cyan-600 hover:underline">← Quotes</Link>
          ) : (
            <Link href="/dashboard/invoices" className="text-sm font-bold text-cyan-600 hover:underline">← All invoices</Link>
          )}
          <div className="flex items-center gap-3">
            {canEdit && (
              <Link href={`/dashboard/invoices/${id}/edit`}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
                Edit
              </Link>
            )}
            <Link href={`/dashboard/invoices/${id}/print`}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50">
              Print / PDF
            </Link>
            <InvoiceActions
              invoiceId={id}
              status={invoice.status as string}
              paymentLink={invoice.payment_link as string | null}
              canSend={isPaidPlan(subscription)}
              canApprove={canApprove}
              isEmployee={isEmployee}
            />
          </div>
        </div>

        {/* Invoice document */}
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm space-y-8">

          {/* Title row */}
          <div className="flex items-start justify-between gap-6">
            <div>
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="mb-3 max-h-12 max-w-[160px] object-contain"
                />
              )}
              <p className="mb-4 text-xl font-black tracking-tight text-slate-900">{letterhead}</p>
              <p className="text-3xl font-black tracking-tight text-slate-900">{invoice.status === 'quote' ? 'QUOTE' : 'INVOICE'}</p>
              <p className="mt-1 text-lg font-bold text-cyan-600">{invoice.invoice_number}</p>
            </div>
            <span className={`rounded-xl px-3 py-1 text-sm font-black ${STATUS_STYLE[invoice.status]}`}>
              {invoice.status.toUpperCase()}
            </span>
          </div>

          {/* From / To / Dates */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4 border-t border-gray-100 pt-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">From</p>
              <p className="mt-1 text-sm font-bold text-gray-900">{profile?.full_name || profile?.email}</p>
              {profile?.full_name && <p className="text-sm text-gray-500">{profile.email}</p>}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">To</p>
              <p className="mt-1 text-sm font-bold text-gray-900">{client?.name ?? '—'}</p>
              {client?.email && <p className="text-sm text-gray-500">{client.email}</p>}
              {client?.address && <p className="text-sm text-gray-500">{client.address}</p>}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Issue date</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{fmtDate(invoice.issue_date)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Due date</p>
              <p className="mt-1 text-sm font-semibold text-gray-900">{invoice.due_date ? fmtDate(invoice.due_date) : '—'}</p>
            </div>
          </div>

          {/* Line items */}
          <div className="border-t border-gray-100 pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="pb-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Description</th>
                  <th className="pb-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Qty</th>
                  <th className="pb-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Unit price</th>
                  <th className="pb-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map((item: { id: string; description: string; quantity: number; unit_price: number }) => (
                  <tr key={item.id}>
                    <td className="py-3 text-gray-900">{item.description}</td>
                    <td className="py-3 text-right text-gray-600">{Number(item.quantity).toFixed(2)}</td>
                    <td className="py-3 text-right text-gray-600">{invoice.currency} {Number(item.unit_price).toFixed(2)}</td>
                    <td className="py-3 text-right font-semibold text-gray-900">{invoice.currency} {(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 border-t border-gray-200 pt-4 text-right">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-bold">Total</p>
              <p className="text-3xl font-black text-gray-900">{invoice.currency} {Number(invoice.subtotal).toFixed(2)}</p>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="border-t border-gray-100 pt-6">
              <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Payment link */}
          {hasInvoicePaymentDetails(paymentDetails) && (
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Bank transfer details</p>
              <div className="space-y-1 text-sm font-semibold text-gray-700">
                {paymentLines.map(line => <p key={line}>{line}</p>)}
              </div>
              <p className="mt-2 text-xs text-gray-500">Use invoice {invoice.invoice_number} as the payment reference.</p>
            </div>
          )}

          {invoice.payment_link && invoice.status !== 'paid' && (
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-cyan-600 mb-2">Payment link</p>
              <a href={invoice.payment_link as string} target="_blank" rel="noopener noreferrer"
                className="inline-block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600">
                Pay invoice →
              </a>
              <p className="mt-1 text-xs text-cyan-600">Send this link to your client to accept online payment.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
