import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import EditInvoiceForm from '@/components/invoices/EditInvoiceForm'

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('id', id)
    .single()

  if (!invoice) notFound()
  if (['paid', 'cancelled'].includes(invoice.status)) notFound()

  const isOwner = invoice.owner_id === user.id
  let memberRole: string | null = null
  if (invoice.org_id) {
    const { data: membership } = await supabase
      .from('organisation_members').select('role').eq('user_id', user.id).eq('org_id', invoice.org_id).maybeSingle()
    memberRole = membership?.role ?? null
  }
  if (!isOwner && !memberRole) notFound()

  const isEmployee = !!invoice.org_id && !['owner', 'admin', 'manager'].includes(memberRole ?? '')
  const isQuote = invoice.invoice_number.startsWith('Q-')

  // Fetch clients for the selector
  const clientQuery = invoice.org_id
    ? supabase.from('clients').select('id, name').or(`owner_id.eq.${user.id},org_id.eq.${invoice.org_id}`).eq('archived', false).order('name')
    : supabase.from('clients').select('id, name').eq('owner_id', user.id).eq('archived', false).order('name')
  const { data: clients } = await clientQuery

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = ((invoice.invoice_items ?? []) as any[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((i: { description: string; quantity: number; unit_price: number }) => ({
      description: i.description,
      quantity: Number(i.quantity),
      unit_price: Number(i.unit_price),
    }))

  const backLabel = isQuote ? 'Back to quote' : 'Back to invoice'

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <Link href={`/dashboard/invoices/${id}`} className="text-sm font-bold text-cyan-600 hover:underline">
            ← {backLabel}
          </Link>
          <h1 className="mt-3 text-xl font-bold text-gray-900 dark:text-white">
            Edit {isQuote ? 'quote' : 'invoice'} {invoice.invoice_number}
          </h1>
          {invoice.status === 'sent' && (
            <p className="mt-1 text-sm font-semibold text-amber-600">
              This invoice has already been sent to the client. Editing it will require re-sending.
            </p>
          )}
        </div>
        <EditInvoiceForm
          invoiceId={id}
          isQuote={isQuote}
          clients={clients ?? []}
          initialClientId={(invoice as { client_id: string | null }).client_id}
          initialItems={items}
          initialDueDate={invoice.due_date as string | null}
          initialIssueDate={invoice.issue_date as string}
          initialNotes={invoice.notes as string | null}
          initialCurrency={invoice.currency as string}
          isEmployee={isEmployee}
        />
      </div>
    </div>
  )
}
