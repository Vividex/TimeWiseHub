'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

// ── Helpers ──────────────────────────────────────────────────

function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
}

function downloadCSV(rows: (string | number | null | undefined)[][], filename: string) {
  const csv = '﻿' + rows.map(csvRow).join('\r\n') // BOM for Excel UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function decimalHours(seconds: number): string {
  return (seconds / 3600).toFixed(2)
}

function workingDays(start: string, end: string, halfDay: boolean): number {
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  let days = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) days++
    cur.setDate(cur.getDate() + 1)
  }
  return halfDay ? 0.5 : days
}

function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10) }
function today() { return new Date().toISOString().slice(0, 10) }
function currentYear() { return new Date().getFullYear() }

const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', personal: 'Personal',
  public_holiday: 'Public Holiday', unpaid: 'Unpaid', other: 'Other',
}

// ── Report card ───────────────────────────────────────────────

function ReportCard({ title, description, children }: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        <p className="mt-0.5 text-sm text-gray-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

function DateRange({ from, to, onFrom, onTo }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">From</label>
        <input type="date" value={from} onChange={e => onFrom(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold text-gray-500">To</label>
        <input type="date" value={to} onChange={e => onTo(e.target.value)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
      </div>
    </div>
  )
}

function DownloadBtn({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={loading}
      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:opacity-50">
      {loading ? 'Preparing…' : `↓ ${label}`}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────

export default function ReportsClient({ userId, orgId, isManager }: {
  userId: string
  orgId: string | null
  isManager: boolean
}) {
  const [timeFrom, setTimeFrom] = useState(monthStart)
  const [timeTo, setTimeTo]     = useState(today)
  const [expFrom, setExpFrom]   = useState(monthStart)
  const [expTo, setExpTo]       = useState(today)
  const [leaveYear, setLeaveYear] = useState(String(currentYear()))
  const [orgTimeFrom, setOrgTimeFrom] = useState(monthStart)
  const [orgTimeTo, setOrgTimeTo]     = useState(today)
  const [orgLeaveYear, setOrgLeaveYear] = useState(String(currentYear()))
  const [orgExpFrom, setOrgExpFrom] = useState(monthStart)
  const [orgExpTo, setOrgExpTo]     = useState(today)
  const [loading, setLoading] = useState<string | null>(null)

  const supabase = createClient()
  const years = [currentYear(), currentYear() - 1, currentYear() - 2].map(String)

  // ── Individual: time log ─────────────────────────────────────
  async function downloadTimeLog() {
    setLoading('time')
    const { data } = await supabase
      .from('time_entries')
      .select('started_at, ended_at, duration_seconds, description, tasks(title, projects(name))')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .gte('started_at', timeFrom + 'T00:00:00')
      .lte('started_at', timeTo + 'T23:59:59')
      .order('started_at')

    const rows: (string | number | null)[][] = [
      ['Date', 'Day', 'Start', 'End', 'Hours (decimal)', 'Hours (hm)', 'Task', 'Project', 'Description'],
    ]
    ;(data ?? []).forEach(e => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const task = (e as any).tasks as { title: string; projects: { name: string } | null } | null
      const d = new Date(e.started_at)
      const day = d.toLocaleDateString('en-AU', { weekday: 'long' })
      const secs = e.duration_seconds ?? 0
      const hm = `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`
      rows.push([
        fmtDate(e.started_at), day,
        fmtTime(e.started_at), fmtTime(e.ended_at!),
        decimalHours(secs), hm,
        task?.title ?? '', task?.projects?.name ?? '',
        e.description ?? '',
      ])
    })
    // Totals row
    const totalSecs = (data ?? []).reduce((s, e) => s + (e.duration_seconds ?? 0), 0)
    rows.push([])
    rows.push(['TOTAL', '', '', '', decimalHours(totalSecs), `${Math.floor(totalSecs / 3600)}h ${Math.floor((totalSecs % 3600) / 60)}m`, '', '', ''])

    downloadCSV(rows, `time-log-${timeFrom}-to-${timeTo}.csv`)
    setLoading(null)
  }

  // ── Individual: expenses ──────────────────────────────────────
  async function downloadExpenses() {
    setLoading('exp')
    const { data } = await supabase
      .from('expenses')
      .select('expense_date, amount, currency, description, status, expense_categories(name), review_note')
      .eq('user_id', userId)
      .gte('expense_date', expFrom)
      .lte('expense_date', expTo)
      .order('expense_date')

    const rows: (string | number | null)[][] = [
      ['Date', 'Category', 'Description', 'Amount', 'Currency', 'Status', 'Review Note'],
    ]
    ;(data ?? []).forEach(e => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = (e as any).expense_categories as { name: string } | null
      rows.push([
        fmtDate(e.expense_date), cat?.name ?? '',
        e.description ?? '', Number(e.amount).toFixed(2),
        e.currency, e.status,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e as any).review_note ?? '',
      ])
    })
    const total = (data ?? []).reduce((s, e) => s + Number(e.amount), 0)
    rows.push([])
    rows.push(['TOTAL', '', '', total.toFixed(2), '', '', ''])

    downloadCSV(rows, `expenses-${expFrom}-to-${expTo}.csv`)
    setLoading(null)
  }

  // ── Individual: leave ─────────────────────────────────────────
  async function downloadLeave() {
    setLoading('leave')
    const { data } = await supabase
      .from('leave_requests')
      .select('leave_type, start_date, end_date, half_day, notes, status, review_note')
      .eq('user_id', userId)
      .gte('start_date', `${leaveYear}-01-01`)
      .lte('start_date', `${leaveYear}-12-31`)
      .order('start_date')

    const rows: (string | number | null)[][] = [
      ['Leave Type', 'Start Date', 'End Date', 'Working Days', 'Half Day', 'Status', 'Notes', 'Review Note'],
    ]
    ;(data ?? []).forEach(r => {
      rows.push([
        LEAVE_LABELS[r.leave_type] ?? r.leave_type,
        fmtDate(r.start_date), fmtDate(r.end_date),
        workingDays(r.start_date, r.end_date, r.half_day),
        r.half_day ? 'Yes' : 'No',
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.notes ?? '', r.review_note ?? '',
      ])
    })
    const totalDays = (data ?? [])
      .filter(r => r.status === 'approved')
      .reduce((s, r) => s + workingDays(r.start_date, r.end_date, r.half_day), 0)
    rows.push([])
    rows.push(['TOTAL APPROVED DAYS', '', '', totalDays, '', '', '', ''])

    downloadCSV(rows, `leave-${leaveYear}.csv`)
    setLoading(null)
  }

  // ── Org: team hours ───────────────────────────────────────────
  async function downloadOrgTime() {
    setLoading('orgtime')
    const { data } = await supabase
      .from('time_entries')
      .select('user_id, started_at, ended_at, duration_seconds, description, profiles(full_name, email)')
      .not('ended_at', 'is', null)
      .gte('started_at', orgTimeFrom + 'T00:00:00')
      .lte('started_at', orgTimeTo + 'T23:59:59')
      .order('profiles(full_name)', { ascending: true })
      .order('started_at')

    const rows: (string | number | null)[][] = [
      ['Employee', 'Email', 'Date', 'Day', 'Start', 'End', 'Hours (decimal)', 'Description'],
    ]
    const totals: Record<string, number> = {}
    ;(data ?? []).forEach(e => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (e as any).profiles as { full_name: string | null; email: string } | null
      const name = p?.full_name ?? p?.email ?? e.user_id
      const secs = e.duration_seconds ?? 0
      const day = new Date(e.started_at).toLocaleDateString('en-AU', { weekday: 'long' })
      rows.push([
        name, p?.email ?? '',
        fmtDate(e.started_at), day,
        fmtTime(e.started_at), fmtTime(e.ended_at!),
        decimalHours(secs), e.description ?? '',
      ])
      totals[name] = (totals[name] ?? 0) + secs
    })
    rows.push([])
    rows.push(['SUMMARY BY EMPLOYEE', '', '', '', '', '', '', ''])
    rows.push(['Employee', '', '', '', '', '', 'Total Hours', ''])
    Object.entries(totals).sort().forEach(([name, secs]) => {
      rows.push([name, '', '', '', '', '', decimalHours(secs), ''])
    })

    downloadCSV(rows, `team-hours-${orgTimeFrom}-to-${orgTimeTo}.csv`)
    setLoading(null)
  }

  // ── Org: leave payroll summary ────────────────────────────────
  async function downloadOrgLeave() {
    setLoading('orgleave')
    const { data } = await supabase
      .from('leave_requests')
      .select('user_id, leave_type, start_date, end_date, half_day, status, notes, profiles(full_name, email)')
      .eq('org_id', orgId)
      .gte('start_date', `${orgLeaveYear}-01-01`)
      .lte('start_date', `${orgLeaveYear}-12-31`)
      .order('start_date')

    const rows: (string | number | null)[][] = [
      ['Employee', 'Email', 'Leave Type', 'Start Date', 'End Date', 'Working Days', 'Half Day', 'Status', 'Notes'],
    ]
    ;(data ?? []).forEach(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (r as any).profiles as { full_name: string | null; email: string } | null
      rows.push([
        p?.full_name ?? p?.email ?? r.user_id, p?.email ?? '',
        LEAVE_LABELS[r.leave_type] ?? r.leave_type,
        fmtDate(r.start_date), fmtDate(r.end_date),
        workingDays(r.start_date, r.end_date, r.half_day),
        r.half_day ? 'Yes' : 'No',
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.notes ?? '',
      ])
    })

    // Summary per employee per leave type
    const summary: Record<string, Record<string, number>> = {}
    ;(data ?? []).filter(r => r.status === 'approved').forEach(r => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (r as any).profiles as { full_name: string | null; email: string } | null
      const name = p?.full_name ?? p?.email ?? r.user_id
      const lt = LEAVE_LABELS[r.leave_type] ?? r.leave_type
      summary[name] ??= {}
      summary[name][lt] = (summary[name][lt] ?? 0) + workingDays(r.start_date, r.end_date, r.half_day)
    })
    rows.push([])
    rows.push(['APPROVED LEAVE SUMMARY', '', '', '', '', '', '', '', ''])
    rows.push(['Employee', 'Leave Type', 'Total Days', '', '', '', '', '', ''])
    Object.entries(summary).sort().forEach(([name, types]) => {
      Object.entries(types).forEach(([lt, days]) => {
        rows.push([name, lt, days, '', '', '', '', '', ''])
      })
    })

    downloadCSV(rows, `leave-payroll-${orgLeaveYear}.csv`)
    setLoading(null)
  }

  // ── Org: expense summary ──────────────────────────────────────
  async function downloadOrgExpenses() {
    setLoading('orgexp')
    const { data } = await supabase
      .from('expenses')
      .select('user_id, expense_date, amount, currency, description, status, expense_categories(name), profiles(full_name, email)')
      .eq('org_id', orgId)
      .gte('expense_date', orgExpFrom)
      .lte('expense_date', orgExpTo)
      .order('expense_date')

    const rows: (string | number | null)[][] = [
      ['Employee', 'Email', 'Date', 'Category', 'Description', 'Amount', 'Currency', 'Status'],
    ]
    ;(data ?? []).forEach(e => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (e as any).profiles as { full_name: string | null; email: string } | null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cat = (e as any).expense_categories as { name: string } | null
      rows.push([
        p?.full_name ?? p?.email ?? e.user_id, p?.email ?? '',
        fmtDate(e.expense_date), cat?.name ?? '',
        e.description ?? '', Number(e.amount).toFixed(2),
        e.currency, e.status,
      ])
    })
    const total = (data ?? []).filter(e => e.status === 'approved').reduce((s, e) => s + Number(e.amount), 0)
    rows.push([])
    rows.push(['TOTAL APPROVED', '', '', '', '', total.toFixed(2), '', ''])

    downloadCSV(rows, `team-expenses-${orgExpFrom}-to-${orgExpTo}.csv`)
    setLoading(null)
  }

  return (
    <div className="space-y-8">

      {/* Individual reports */}
      <div>
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-400">My reports</h2>
        <div className="space-y-4">

          <ReportCard
            title="Time Log"
            description="All time entries for the selected period — includes hours (decimal for payroll), task, and project.">
            <DateRange from={timeFrom} to={timeTo} onFrom={setTimeFrom} onTo={setTimeTo} />
            <DownloadBtn onClick={downloadTimeLog} loading={loading === 'time'} label="Download Time Log CSV" />
          </ReportCard>

          <ReportCard
            title="Expense Report"
            description="All expenses for the period with category, amount, and approval status.">
            <DateRange from={expFrom} to={expTo} onFrom={setExpFrom} onTo={setExpTo} />
            <DownloadBtn onClick={downloadExpenses} loading={loading === 'exp'} label="Download Expense Report CSV" />
          </ReportCard>

          <ReportCard
            title="Leave Summary"
            description="All leave requests for the year — suitable for self-service records.">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500">Year</label>
              <select value={leaveYear} onChange={e => setLeaveYear(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <DownloadBtn onClick={downloadLeave} loading={loading === 'leave'} label="Download Leave Summary CSV" />
          </ReportCard>

        </div>
      </div>

      {/* Manager / org reports */}
      {isManager && (
        <div>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-gray-400">Team reports</h2>
          <div className="space-y-4">

            <ReportCard
              title="Team Hours"
              description="All employees' time entries for the period — includes decimal hours and a per-employee summary at the bottom.">
              <DateRange from={orgTimeFrom} to={orgTimeTo} onFrom={setOrgTimeFrom} onTo={setOrgTimeTo} />
              <DownloadBtn onClick={downloadOrgTime} loading={loading === 'orgtime'} label="Download Team Hours CSV" />
            </ReportCard>

            <ReportCard
              title="Leave Payroll Report"
              description="All employees' leave for the year with working days calculated — designed to hand to your payroll officer or accountant.">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Year</label>
                <select value={orgLeaveYear} onChange={e => setOrgLeaveYear(e.target.value)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <DownloadBtn onClick={downloadOrgLeave} loading={loading === 'orgleave'} label="Download Leave Payroll CSV" />
            </ReportCard>

            <ReportCard
              title="Team Expense Summary"
              description="All employees' expenses for the period — shows approved totals per employee at the bottom.">
              <DateRange from={orgExpFrom} to={orgExpTo} onFrom={setOrgExpFrom} onTo={setOrgExpTo} />
              <DownloadBtn onClick={downloadOrgExpenses} loading={loading === 'orgexp'} label="Download Team Expenses CSV" />
            </ReportCard>

          </div>
        </div>
      )}

    </div>
  )
}
