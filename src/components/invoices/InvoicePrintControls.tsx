'use client'

import { useRouter } from 'next/navigation'

export default function InvoicePrintControls({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  return (
    <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
      <a
        href={`/api/invoices/${invoiceId}/pdf`}
        download
        style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
      >
        Download PDF
      </a>
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
