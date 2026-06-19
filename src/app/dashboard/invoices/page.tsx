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

  const now = new Date()
  const fyStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1
  const fyStart = `${fyStartYear}-07-01`
  const fyEnd = `${fyStartYear + 1}-06-30`
  const totalPaid = (invoices ?? [])
    .filter(i => i.status === 'paid' && i.issue_date && i.issue_date >= fyStart && i.issue_date <= fyEnd)
    .reduce((s, i) => s + Number(i.subtotal), 0)

  const draftCount = (invoices ?? []).filter(i => i.status === 'draft').length
  const overdueCount = (invoices ?? []).filter(i => i.status === 'overdue').length

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Outstanding</p>
            <p className="mt-2 text-2xl font-black text-amber-400">${totalOutstanding.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Paid (FY{String(fyStartYear).slice(2)}–{String(fyStartYear + 1).slice(2)})</p>
            <p className="mt-2 text-2xl font-black text-emerald-400">${totalPaid.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Drafts</p>
            <p className="mt-2 text-2xl font-black text-slate-300">{draftCount}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Overdue</p>
            <p className="mt-2 text-2xl font-black text-red-400">{overdueCount}</p>
          </div>
        </div>

        <div className="flex justify-end">
          <Link href="/dashboard/invoices/new"
            className="rounded-2xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-cyan-600 shadow-lg shadow-cyan-500/20">
            + New invoice
          </Link>
        </div>

        {/* Invoice list */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
          <InvoiceTable invoices={(invoices ?? []) as unknown as import('@/components/invoices/InvoiceTable').InvoiceRow[]} />
        </div>

      </div>
    </div>
  )
}
