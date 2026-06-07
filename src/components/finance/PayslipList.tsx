'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export type PayslipRow = {
  id: string
  label: string
  pay_date: string
  file_path: string
  uploaded_at: string
  employeeName?: string
}

export default function PayslipList({
  payslips,
  canDelete = false,
}: {
  payslips: PayslipRow[]
  canDelete?: boolean
}) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function download(path: string) {
    setError(null)
    const supabase = createClient()
    const { data, error: e } = await supabase.storage.from('payslips').createSignedUrl(path, 60)
    if (e || !data) {
      setError('Could not open payslip.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function remove(row: PayslipRow) {
    setBusyId(row.id)
    setError(null)
    const supabase = createClient()
    await supabase.storage.from('payslips').remove([row.file_path])
    const { error: e } = await supabase.from('payslips').delete().eq('id', row.id)
    if (e) {
      setError(e.message)
      setBusyId(null)
      return
    }
    router.refresh()
    setBusyId(null)
  }

  if (payslips.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-4 text-sm font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        No payslips yet.
      </p>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {error && <p className="px-4 py-2 text-sm font-semibold text-red-600 dark:text-red-400">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-slate-800">
            {payslips.some(p => p.employeeName) && (
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Employee</th>
            )}
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Payslip</th>
            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Pay date</th>
            <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Actions</th>
          </tr>
        </thead>
        <tbody>
          {payslips.map(p => (
            <tr key={p.id} className="border-b border-gray-50 last:border-0 dark:border-slate-800">
              {payslips.some(x => x.employeeName) && (
                <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.employeeName ?? ''}</td>
              )}
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{p.label}</td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{p.pay_date}</td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => download(p.file_path)} className="rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-600">Download</button>
                  {canDelete && (
                    <button type="button" onClick={() => remove(p)} disabled={busyId === p.id} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                      {busyId === p.id ? '…' : 'Delete'}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
