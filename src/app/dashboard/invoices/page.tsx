import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'

const STATUS_STYLE: Record<string, string> = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-cyan-100 text-cyan-700',
  paid:      'bg-green-100 text-green-700',
  overdue:   'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-400',
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function InvoicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, issue_date, due_date, subtotal, currency, clients(name)')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false })

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
          {!invoices?.length ? (
            <div className="p-8 text-center">
              <p className="text-sm font-semibold text-gray-400">No invoices yet.</p>
              <Link href="/dashboard/invoices/new" className="mt-3 inline-block text-sm font-bold text-cyan-600 hover:underline">Create your first invoice →</Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Invoice</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Client</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Issued</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-400">Due</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-400">Amount</th>
                  <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoices.map(inv => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const clientName = (inv as any).clients?.name ?? '—'
                  return (
                    <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/invoices/${inv.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{inv.invoice_number}</Link>
                      </td>
                      <td className="px-5 py-4 text-gray-600">{clientName}</td>
                      <td className="px-5 py-4 text-gray-500">{fmtDate(inv.issue_date)}</td>
                      <td className="px-5 py-4 text-gray-500">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                      <td className="px-5 py-4 text-right font-bold text-gray-900">{inv.currency} {Number(inv.subtotal).toFixed(2)}</td>
                      <td className="px-5 py-4 text-center">
                        <span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[inv.status]}`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
