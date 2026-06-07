'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { computeIndicativeNet } from '@/lib/payroll/compute'

export type PayStatement = {
  id: string
  period_start: string
  period_end: string
  approved_seconds: number
  hourly_rate: number
  gross: number
  super_rate: number
  super_amount: number
  notes: string | null
}

function formatAUD(n: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)
}

export default function PayStatementCard({
  statement,
  showNet,
  userId,
  initialTaxPct,
}: {
  statement: PayStatement
  showNet: boolean
  userId?: string
  initialTaxPct?: number | null
}) {
  const [taxPct, setTaxPct] = useState<string>(initialTaxPct != null ? String(initialTaxPct) : '')

  const hours = (statement.approved_seconds / 3600).toFixed(2)
  const pctNum = taxPct.trim() === '' ? null : Number(taxPct)
  const net = pctNum != null && !Number.isNaN(pctNum) ? computeIndicativeNet(statement.gross, pctNum) : null

  async function persistTaxPct() {
    if (!showNet || !userId) return
    const supabase = createClient()
    const value = taxPct.trim() === '' ? null : Number(taxPct)
    await supabase.from('profiles').update({ tax_estimate_pct: value }).eq('id', userId)
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
        ⚠ Indicative only — not a payslip or tax advice. Figures are estimates. Refer to the ATO and your payroll provider.
      </div>
      <div className="space-y-2 p-4 text-sm">
        <div className="flex justify-between font-semibold text-slate-500 dark:text-slate-400">
          <span>{statement.period_start} – {statement.period_end}</span>
          <span>{hours} h @ {formatAUD(statement.hourly_rate)}</span>
        </div>

        <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-slate-800">
          <span className="font-bold text-slate-900 dark:text-slate-100">Gross</span>
          <span className="font-extrabold text-green-600 dark:text-green-400">{formatAUD(statement.gross)}</span>
        </div>

        {showNet && (
          <>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={`tax-${statement.id}`} className="text-slate-600 dark:text-slate-300">Estimated tax %</label>
              <input
                id={`tax-${statement.id}`}
                type="number" min="0" max="100" step="0.1"
                value={taxPct}
                onChange={e => setTaxPct(e.target.value)}
                onBlur={persistTaxPct}
                placeholder="—"
                className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-2 dark:border-slate-800">
              <span className="font-bold text-slate-900 dark:text-slate-100">Indicative net</span>
              <span className="font-extrabold text-slate-900 dark:text-slate-100">{net != null ? formatAUD(net) : '—'}</span>
            </div>
            <a
              href="https://www.ato.gov.au/calculators-and-tools/tax-withheld-calculator"
              target="_blank" rel="noopener noreferrer"
              className="block text-xs font-semibold text-cyan-600 hover:underline"
            >
              Estimate your tax % with the ATO Tax Withheld calculator →
            </a>
          </>
        )}

        <div className="flex justify-between border-t border-gray-100 pt-2 text-blue-700 dark:border-slate-800 dark:text-blue-300">
          <span className="font-semibold">Super ({statement.super_rate}%, paid on top)</span>
          <span className="font-bold">+ {formatAUD(statement.super_amount)}</span>
        </div>

        {statement.notes && (
          <p className="border-t border-gray-100 pt-2 text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Note: {statement.notes}
          </p>
        )}
      </div>
    </div>
  )
}
