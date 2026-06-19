'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export type OrgMemberOption = { user_id: string; name: string }

export default function PayslipUpload({
  orgId,
  uploadedBy,
  members,
}: {
  orgId: string
  uploadedBy: string
  members: OrgMemberOption[]
}) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState(members[0]?.user_id ?? '')
  const [label, setLabel] = useState('')
  const [payDate, setPayDate] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!employeeId || !label.trim() || !payDate || !file) {
      setError('All fields and a PDF are required.')
      return
    }
    if (file.type !== 'application/pdf') {
      setError('Payslip must be a PDF.')
      return
    }

    setLoading(true); setError(null); setDone(false)
    const supabase = createClient()
    const path = `${employeeId}/${crypto.randomUUID()}.pdf`

    const { error: upErr } = await supabase.storage.from('payslips').upload(path, file)
    if (upErr) {
      setError(upErr.message); setLoading(false); return
    }

    const { data: insertedRow, error: rowErr } = await supabase.from('payslips').insert({
      org_id: orgId,
      user_id: employeeId,
      label: label.trim(),
      pay_date: payDate,
      file_path: path,
      uploaded_by: uploadedBy,
    }).select('id').single()

    if (rowErr) {
      await supabase.storage.from('payslips').remove([path]) // avoid orphaned file
      setError(rowErr.message); setLoading(false); return
    }

    if (insertedRow?.id) {
      fetch('/api/notifications/payslip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payslipId: insertedRow.id }),
      }).catch(err => console.error('Payslip notification failed', err))
    }

    setLabel(''); setPayDate(''); setFile(null); setDone(true)
    router.refresh()
    setLoading(false)
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Upload payslip</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="ps-emp" className="block text-xs font-bold text-gray-500 dark:text-slate-400">Employee</label>
          <select id="ps-emp" value={employeeId} onChange={e => setEmployeeId(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
            {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="ps-date" className="block text-xs font-bold text-gray-500 dark:text-slate-400">Pay date</label>
          <input id="ps-date" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ps-label" className="block text-xs font-bold text-gray-500 dark:text-slate-400">Label</label>
          <input id="ps-label" type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Fortnight ending 31 May 2026" className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="ps-file" className="block text-xs font-bold text-gray-500 dark:text-slate-400">PDF</label>
          <input id="ps-file" type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-1 w-full text-sm text-slate-600 dark:text-slate-300" />
        </div>
      </div>
      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-300">{error}</p>}
      {done && <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">Payslip uploaded.</p>}
      <button type="submit" disabled={loading} className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
        {loading ? 'Uploading…' : 'Upload payslip'}
      </button>
    </form>
  )
}
