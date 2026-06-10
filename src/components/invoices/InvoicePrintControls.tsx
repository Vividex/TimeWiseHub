'use client'

export default function InvoicePrintControls() {
  return (
    <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
      <button
        type="button"
        onClick={() => window.print()}
        style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
      >
        Print / Save PDF
      </button>
      <button
        type="button"
        onClick={() => window.close()}
        style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}
      >
        Close
      </button>
    </div>
  )
}
