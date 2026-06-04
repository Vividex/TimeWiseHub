import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return notFound()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, invoice_items(*), clients(name, email, address)')
    .eq('id', id)
    .single()

  if (!invoice || invoice.owner_id !== user.id) notFound()

  const { data: profile } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = (invoice.invoice_items as any[]).sort((a, b) => a.sort_order - b.sort_order)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (invoice as any).clients as { name: string; email: string | null; address: string | null } | null

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{invoice.invoice_number}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: 'Inter', -apple-system, sans-serif; font-size: 14px; color: #111827; background: #fff; }
          .page { max-width: 780px; margin: 0 auto; padding: 48px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
          .logo { font-size: 22px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px; }
          .tagline { font-size: 11px; color: #06b6d4; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
          .invoice-title { text-align: right; }
          .invoice-title h1 { font-size: 28px; font-weight: 900; color: #0f172a; }
          .invoice-title .number { color: #06b6d4; font-size: 16px; font-weight: 700; margin-top: 4px; }
          .status { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
          .status-paid { background: #dcfce7; color: #16a34a; }
          .status-sent { background: #cffafe; color: #0e7490; }
          .status-draft { background: #f3f4f6; color: #4b5563; }
          .meta { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 24px; margin-bottom: 40px; padding: 24px 0; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
          .meta-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 4px; }
          .meta-value { font-weight: 600; color: #111827; }
          .meta-sub { font-size: 12px; color: #6b7280; margin-top: 1px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
          th { padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; border-bottom: 1px solid #e5e7eb; }
          th:not(:first-child) { text-align: right; }
          td { padding: 12px 12px; border-bottom: 1px solid #f3f4f6; color: #111827; }
          td:not(:first-child) { text-align: right; }
          .total-row { border-top: 2px solid #111827; }
          .total-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; }
          .total-amount { font-size: 24px; font-weight: 900; color: #111827; }
          .notes { background: #f9fafb; border-radius: 8px; padding: 16px; margin-top: 24px; }
          .notes-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #9ca3af; margin-bottom: 8px; }
          .notes-text { color: #374151; line-height: 1.6; white-space: pre-wrap; }
          .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
        `}</style>
      </head>
      <body>
        <div className="page">

          {/* Print / close button */}
          <div className="no-print" style={{ marginBottom: 24, display: 'flex', gap: 12 }}>
            <button onClick={() => window.print()} style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              Print / Save PDF
            </button>
            <button onClick={() => window.close()} style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
              Close
            </button>
          </div>

          {/* Header */}
          <div className="header">
            <div>
              <div className="logo">TimeWiseHub</div>
              <div className="tagline">Track Time. Control Costs. Grow Smarter.</div>
            </div>
            <div className="invoice-title">
              <h1>INVOICE</h1>
              <div className="number">{invoice.invoice_number}</div>
              <div style={{ marginTop: 8 }}>
                <span className={`status status-${invoice.status}`}>{invoice.status}</span>
              </div>
            </div>
          </div>

          {/* From / To / Dates */}
          <div className="meta">
            <div>
              <div className="meta-label">From</div>
              <div className="meta-value">{profile?.full_name || profile?.email}</div>
              {profile?.full_name && <div className="meta-sub">{profile.email}</div>}
            </div>
            <div>
              <div className="meta-label">To</div>
              <div className="meta-value">{client?.name || '—'}</div>
              {client?.email && <div className="meta-sub">{client.email}</div>}
              {client?.address && <div className="meta-sub">{client.address}</div>}
            </div>
            <div>
              <div className="meta-label">Issue date</div>
              <div className="meta-value">{fmtDate(invoice.issue_date)}</div>
            </div>
            <div>
              <div className="meta-label">Due date</div>
              <div className="meta-value">{invoice.due_date ? fmtDate(invoice.due_date) : '—'}</div>
            </div>
          </div>

          {/* Line items */}
          <table>
            <thead>
              <tr>
                <th style={{ width: '50%' }}>Description</th>
                <th>Qty</th>
                <th>Unit price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: { id: string; description: string; quantity: number; unit_price: number }) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>{Number(item.quantity).toFixed(2)}</td>
                  <td>{invoice.currency} {Number(item.unit_price).toFixed(2)}</td>
                  <td>{invoice.currency} {(Number(item.quantity) * Number(item.unit_price)).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 24, alignItems: 'center' }}>
            <span className="total-label">Total due</span>
            <span className="total-amount">{invoice.currency} {Number(invoice.subtotal).toFixed(2)}</span>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="notes">
              <div className="notes-label">Notes</div>
              <div className="notes-text">{invoice.notes}</div>
            </div>
          )}

          <div className="footer">
            Generated by TimeWiseHub · timewisehub.vercel.app
          </div>
        </div>
      </body>
    </html>
  )
}
