'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InvoicePrintControls({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/pdf`)
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `invoice.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF download failed:', err)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, border: 'none', cursor: downloading ? 'wait' : 'pointer', opacity: downloading ? 0.7 : 1 }}
      >
        {downloading ? 'Generating…' : 'Download PDF'}
      </button>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
      >
        Print
      </button>
      <button
        type="button"
        onClick={() => router.back()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
      >
        Back
      </button>
    </div>
  )
}
