'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export default function ExportButton({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false)

  async function handleExport() {
    setLoading(true)
    const supabase = createClient()

    const from = new Date()
    from.setDate(from.getDate() - 30)

    const { data } = await supabase
      .from('time_entries')
      .select('started_at, ended_at, duration_seconds, description')
      .eq('user_id', userId)
      .not('ended_at', 'is', null)
      .gte('started_at', from.toISOString())
      .order('started_at', { ascending: false })

    if (!data) { setLoading(false); return }

    const rows = [
      ['Date', 'Start', 'End', 'Duration', 'Description'],
      ...data.map(e => [
        new Date(e.started_at).toLocaleDateString('en-AU'),
        new Date(e.started_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        new Date(e.ended_at!).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
        e.duration_seconds ? formatDuration(e.duration_seconds) : '',
        e.description ?? '',
      ]),
    ]

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `time-entries-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setLoading(false)
  }

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-3 py-2 text-xs font-semibold disabled:opacity-50"
    >
      {loading ? 'Exporting...' : 'Export CSV (30 days)'}
    </button>
  )
}

