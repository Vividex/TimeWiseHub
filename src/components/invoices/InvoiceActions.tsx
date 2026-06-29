'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InvoiceActions({ invoiceId, status, paymentLink, canSend, canApprove = false, isEmployee = false }: {
  invoiceId: string
  status: string
  paymentLink: string | null
  canSend: boolean
  canApprove?: boolean
  isEmployee?: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function handleConvert() {
    setLoading('convert')
    setError(null)
    const res = await fetch(`/api/invoices/${invoiceId}/convert`, { method: 'POST' })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(null); return }
    router.refresh()
    setLoading(null)
  }

  async function handleSend() {
    setLoading('send')
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON error body */ }
      if (!res.ok) { setError((data.error as string) ?? 'Something went wrong. Please try again.'); setLoading(null); return }
      if (data.email_sent && data.to) {
        setNotice(`Invoice emailed to ${data.to}.`)
      } else if (data.email_error) {
        setNotice(`Invoice was prepared, but email was not sent: ${data.email_error}`)
      } else if (data.email_skipped) {
        setNotice('Invoice was prepared. Email is not configured.')
      } else {
        setNotice('Invoice was prepared. Add an email address to the client to send it directly.')
      }
      router.refresh()
    } catch {
      setError('Network error. Please check your connection and try again.')
    }
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

  if (status === 'pending_approval') {
    if (canApprove) {
      return (
        <div className="flex items-center gap-2">
          {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
          <span className="text-xs font-semibold text-amber-600">Awaiting your approval</span>
          <button onClick={async () => {
            setLoading('approve')
            setError(null)
            const res = await fetch(`/api/invoices/${invoiceId}/approve`, { method: 'POST' })
            const data = await res.json()
            if (!res.ok) { setError(data.error); setLoading(null); return }
            router.refresh()
            setLoading(null)
          }} disabled={loading === 'approve'}
            className="rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50">
            {loading === 'approve' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      )
    }
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
        {isEmployee ? 'Submitted — awaiting manager approval' : 'Pending approval'}
      </div>
    )
  }

  if (status === 'quote') {
    return (
      <div className="flex items-center gap-2">
        {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
        <button onClick={handleConvert} disabled={loading === 'convert'}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
          {loading === 'convert' ? 'Converting…' : 'Convert to invoice'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
      {notice && <span className="basis-full text-xs font-semibold text-green-700">{notice}</span>}

      {status === 'draft' && (
        canSend ? (
          <button onClick={handleSend} disabled={loading === 'send'}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading === 'send' ? 'Sending…' : 'Send invoice'}
          </button>
        ) : (
          <a href="/dashboard/billing"
            className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700 transition-colors hover:bg-cyan-100">
            Upgrade to Pro to send invoices
          </a>
        )
      )}

      {(status === 'sent' || status === 'overdue') && (
        canSend ? (
          <button onClick={handleSend} disabled={loading === 'send'}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50">
            {loading === 'send' ? 'Sending…' : 'Email invoice'}
          </button>
        ) : (
          <a href="/dashboard/billing"
            className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-bold text-cyan-700 transition-colors hover:bg-cyan-100">
            Upgrade to Pro to email invoices
          </a>
        )
      )}

      {(status === 'sent' || status === 'overdue') && paymentLink && (
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
