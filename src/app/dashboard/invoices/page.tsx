import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import InvoiceTable from '@/components/invoices/InvoiceTable'

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const invoiceQuery = supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, subtotal, currency, clients(name)')
    .neq('status', 'quote')
    .order('created_at', { ascending: false })

  const { data: invoices } = orgId
    ? await invoiceQuery.or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
    : await invoiceQuery.eq('owner_id', user.id)

  const totalOutstanding = (invoices ?? [])
    .filter(i => i.status === 'sent' || i.status === 'overdue')
    .reduce((s, i) => s + Number(i.subtotal), 0)

  const totalPaid = (invoices ?? [])
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + Number(i.subtotal), 0)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Outstanding</p>
            <p className="mt-1 text-3xl font-black text-amber-600">${totalOutstanding.toFixed(2)}</p>
          </div>
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Paid (all time)</p>
            <p className="mt-1 text-3xl font-black text-green-600">${totalPaid.toFixed(2)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 flex items-center">
            <Link href="/dashboard/invoices/new"
              className="w-full rounded-2xl bg-cyan-500 px-6 py-4 text-center text-sm font-bold text-white transition-colors hover:bg-cyan-600">
              + New invoice
            </Link>
          </div>
        </div>

        {/* Invoice list */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <InvoiceTable invoices={(invoices ?? []) as unknown as import('@/components/invoices/InvoiceTable').InvoiceRow[]} />
        </div>

      </div>
    </div>
  )
}
