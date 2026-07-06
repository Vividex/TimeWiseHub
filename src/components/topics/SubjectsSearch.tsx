'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, PenSquare } from 'lucide-react'
import WorksheetAnnotatorModal from '@/components/worksheets/WorksheetAnnotatorModal'
import { createClient } from '@/lib/supabase-browser'

type SearchResult = {
  id: string
  name: string
  asset_type: string
  topic_id: string
  year_group: string
  subject_id: string
  subject_name: string
  topic_name: string
}

export default function SubjectsSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [annotating, setAnnotating] = useState<SearchResult | null>(null)
  const [annotateUrl, setAnnotateUrl] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ''))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) { setResults([]); return }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/topics/search?q=${encodeURIComponent(query.trim())}`)
        .then(res => (res.ok ? (res.json() as Promise<SearchResult[]>) : []))
        .then(data => { setResults(data); setLoading(false) })
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  async function handleView(r: SearchResult) {
    const res = await fetch(`/api/topics/${r.topic_id}/assets/${r.id}/signed-url`)
    const data = res.ok ? await res.json() as { url: string } : null
    if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(r: SearchResult) {
    await fetch(`/api/topics/${r.topic_id}/assets/${r.id}`, { method: 'DELETE' })
    setResults(prev => prev.filter(x => x.id !== r.id))
  }

  async function handleAnnotate(r: SearchResult) {
    const res = await fetch(`/api/topics/${r.topic_id}/assets/${r.id}/signed-url`)
    const data = res.ok ? await res.json() as { url: string } : null
    if (data?.url) { setAnnotateUrl(data.url); setAnnotating(r) }
  }

  return (
    <div className="space-y-2">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search all worksheets by name…"
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />

      {query.trim() && (
        <div className="rounded-xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <p className="p-3 text-xs text-gray-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="p-3 text-xs text-gray-400">No files match &quot;{query}&quot;.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-slate-800">
              {results.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="shrink-0 text-cyan-600" />
                      <span className="truncate font-medium text-gray-900 dark:text-slate-100">{r.name}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-400">{r.year_group} · {r.subject_name} · {r.topic_name}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button type="button" onClick={() => handleView(r)} className="text-xs font-bold text-cyan-600 hover:underline">View</button>
                    {(r.asset_type === 'pdf' || r.asset_type === 'image') && (
                      <button type="button" onClick={() => handleAnnotate(r)} className="text-gray-400 hover:text-cyan-600" title="Annotate">
                        <PenSquare size={14} />
                      </button>
                    )}
                    <button type="button" onClick={() => handleDelete(r)} className="text-xs font-bold text-red-500 hover:underline">Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {annotating && annotateUrl && currentUserId && (
        <WorksheetAnnotatorModal
          topicAssetId={annotating.id}
          assetType={annotating.asset_type as 'pdf' | 'image'}
          fileUrl={annotateUrl}
          currentUserId={currentUserId}
          onClose={() => { setAnnotating(null); setAnnotateUrl(null) }}
        />
      )}
    </div>
  )
}
