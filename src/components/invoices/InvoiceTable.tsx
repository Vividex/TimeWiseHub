'use client'

import Link from 'next/link'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

const STATUS_STYLE: Record<string, string> = {
  quote: 'bg-violet-100 text-violet-700',
  draft: 'bg-gray-100 text-gray-600', sent: 'bg-cyan-100 text-cyan-700',
  paid: 'bg-green-100 text-green-700', overdue: 'bg-red-100 text-red-700', cancelled: 'bg-gray-100 text-gray-400',
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
        <p className="text-sm font-semibold text-gray-400">{emptyMessage}</p>
        <Link href={emptyLink.href} className="mt-3 inline-block text-sm font-bold text-cyan-600 hover:underline">{emptyLink.label}</Link>
      </div>
    )
  }

  return (
    <div>
      <div className="p-4"><SearchInput value={query} onChange={setQuery} placeholder="Search invoices…" /></div>
      {filtered.length === 0 ? (
        <p className="px-5 pb-6 text-sm font-semibold text-gray-400">No matches.</p>
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
            {filtered.map(inv => (
              <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-4"><Link href={`/dashboard/invoices/${inv.id}`} className="font-bold text-slate-900 hover:text-cyan-600">{inv.invoice_number}</Link></td>
                <td className="px-5 py-4 text-gray-600">{clientName(inv.clients) || '—'}</td>
                <td className="px-5 py-4 text-gray-500">{fmtDate(inv.issue_date)}</td>
                <td className="px-5 py-4 text-gray-500">{inv.due_date ? fmtDate(inv.due_date) : '—'}</td>
                <td className="px-5 py-4 text-right font-bold text-gray-900">{inv.currency} {Number(inv.subtotal).toFixed(2)}</td>
                <td className="px-5 py-4 text-center"><span className={`rounded-xl px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[inv.status]}`}>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
