'use client'

import Link from 'next/link'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

const STATUS_STYLE: Record<string, string> = {
  pending_approval: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  quote:     'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  draft:     'bg-slate-500/15 text-slate-400 border border-slate-500/30',
  sent:      'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  paid:      'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  overdue:   'bg-red-500/15 text-red-400 border border-red-500/30',
  cancelled: 'bg-slate-500/15 text-slate-500 border border-slate-500/30',
}
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export type InvoiceRow = {
  id: string; invoice_number: string; status: string
  issue_date: string; due_date: string | null
  subtotal: number; currency: string
  clients: { name: string } | { name: string }[] | null
}

function clientName(c: InvoiceRow['clients']): string {
  return Array.isArray(c) ? (c[0]?.name ?? '') : (c?.name ?? '')
}

export default function InvoiceTable({
  invoices,
  emptyMessage = 'No invoices yet.',
  emptyLink = { href: '/dashboard/invoices/new', label: 'Create your first invoice →' },
}: {
  invoices: InvoiceRow[]
  emptyMessage?: string
  emptyLink?: { href: string; label: string }
}) {
  const { query, setQuery, filtered } = useTextFilter(
    invoices,
    i => `${i.invoice_number} ${clientName(i.clients)} ${i.status}`,
  )

  if (invoices.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm font-semibold text-slate-500">{emptyMessage}</p>
        <Link href={emptyLink.href} className="mt-3 inline-block text-sm font-bold text-cyan-400 hover:underline">{emptyLink.label}</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="p-4"><SearchInput value={query} onChange={setQuery} placeholder="Search invoices…" /></div>
      {filtered.length === 0 ? (
        <p className="px-5 pb-6 text-sm font-semibold text-slate-500">No matches.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-800 bg-slate-800/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-slate-500">Invoice</th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-slate-500 sm:table-cell">Issued</th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-slate-500 sm:table-cell">Due</th>
              <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-widest text-slate-500">Amount</th>
              <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-slate-800/60 transition-colors">
                <td className="px-4 py-4">
                  <Link href={`/dashboard/invoices/${inv.id}`} className="font-bold text-slate-100 hover:text-cyan-400">{inv.invoice_number}</Link>
                  {clientName(inv.clients) && <p className="mt-0.5 text-xs text-slate-500">{clientName(inv.clients)}</p>}
                </td>
                <td className="hidden px-4 py-4 text-slate-400 sm:table-cell">{fmtDate(inv.issue_date)}</td>
                <td className="hidden px-4 py-4 text-slate-400 sm:table-cell">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                <td className="px-4 py-4 text-right font-bold text-slate-100 whitespace-nowrap">{inv.currency} {Number(inv.subtotal).toFixed(2)}</td>
                <td className="px-4 py-4 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[inv.status] ?? STATUS_STYLE.draft}`}>{inv.status === 'pending_approval' ? 'Pending' : inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
