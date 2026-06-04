'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InvoiceActions({ invoiceId, status, paymentLink }: {
  invoiceId: string
  status: string
  paymentLink: string | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    setLoading('send')
    setError(null)
    const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(null); return }
    router.refresh()
    setLoading(null)
  }

  async function handleMarkPaid() {
    setLoading('paid')
    setError(null)
    await fetch(`/api/invoices/${invoiceId}/mark-paid`, { method: 'POST' })
    router.refresh()
    setLoading(null)
  }

  async function copyLink() {
    if (!paymentLink) return
    await navigator.clipboard.writeText(paymentLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (status === 'paid' || status === 'cancelled') return null

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}

      {status === 'draft' && (
        <button onClick={handleSend} disabled={loading === 'send'}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
          {loading === 'send' ? 'Generating link…' : 'Send invoice'}
        </button>
      )}

      {status === 'sent' && paymentLink && (
        <button onClick={copyLink}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50">
          {copied ? 'Copied!' : 'Copy payment link'}
        </button>
      )}

      {(status === 'sent' || status === 'overdue') && (
        <button onClick={handleMarkPaid} disabled={loading === 'paid'}
          className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
          {loading === 'paid' ? 'Saving…' : 'Mark as paid'}
        </button>
      )}
    </div>
  )
}
