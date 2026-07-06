'use client'

import { useEffect, useState } from 'react'
import { FileText, Link as LinkIcon, StickyNote, Trash2, PenSquare } from 'lucide-react'
import WorksheetAnnotatorModal from '@/components/worksheets/WorksheetAnnotatorModal'
import { createClient } from '@/lib/supabase-browser'

type Asset = {
  id: string
  name: string
  asset_type: 'pdf' | 'docx' | 'xlsx' | 'image' | 'link' | 'note'
  file_size_bytes: number | null
  external_url: string | null
}

const FILE_TYPES = new Set(['pdf', 'docx', 'xlsx', 'image'])

function fmtSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function WorksheetAnnotatorModalLoader({
  topicId, assetId, assetType, currentUserId, onClose,
}: {
  topicId: string; assetId: string; assetType: 'pdf' | 'image'; currentUserId: string; onClose: () => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/topics/${topicId}/assets/${assetId}/signed-url`)
      .then(res => res.ok ? res.json() as Promise<{ url: string }> : null)
      .then(data => setUrl(data?.url ?? null))
  }, [topicId, assetId])
  if (!url) return null
  return (
    <WorksheetAnnotatorModal
      topicAssetId={assetId}
      assetType={assetType}
      fileUrl={url}
      currentUserId={currentUserId}
      onClose={onClose}
    />
  )
}

export default function TopicAssetsPanel({ topicId }: { topicId: string }) {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [noteName, setNoteName] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [annotatingAsset, setAnnotatingAsset] = useState<{ id: string; assetType: 'pdf' | 'image' } | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? ''))
  }, [])

  async function load() {
    setLoading(true)
    const res = await fetch(`/api/topics/${topicId}/assets`)
    const data = res.ok ? await res.json() as Asset[] : []
    setAssets(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [topicId])

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`/api/topics/${topicId}/assets`, { method: 'POST', body: formData })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Upload failed')
    } else {
      await load()
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleAddLink(e: React.FormEvent) {
    e.preventDefault()
    if (!linkName.trim() || !linkUrl.trim()) return
    const res = await fetch(`/api/topics/${topicId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_type: 'link', name: linkName.trim(), external_url: linkUrl.trim() }),
    })
    if (res.ok) { setLinkName(''); setLinkUrl(''); await load() }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!noteName.trim()) return
    const res = await fetch(`/api/topics/${topicId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_type: 'note', name: noteName.trim(), note_content: noteContent }),
    })
    if (res.ok) { setNoteName(''); setNoteContent(''); await load() }
  }

  async function handleDelete(assetId: string) {
    await fetch(`/api/topics/${topicId}/assets/${assetId}`, { method: 'DELETE' })
    await load()
  }

  async function handleView(assetId: string) {
    const res = await fetch(`/api/topics/${topicId}/assets/${assetId}/signed-url`)
    const data = res.ok ? await res.json() as { url: string } : null
    if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer')
  }

  function handleAnnotate(assetId: string, assetType: 'pdf' | 'image') {
    setAnnotatingAsset({ id: assetId, assetType })
  }

  return (
    <div className="mt-2 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-950">
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {assets.length === 0 && <p className="text-xs text-gray-400">No files yet.</p>}
          {assets.map(a => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-slate-900">
              {FILE_TYPES.has(a.asset_type) ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleView(a.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <FileText size={14} className="shrink-0 text-cyan-600" />
                    <span className="truncate font-medium text-gray-900 dark:text-slate-100">{a.name}</span>
                    <span className="shrink-0 text-xs text-gray-400">{fmtSize(a.file_size_bytes)}</span>
                  </button>
                  {(a.asset_type === 'pdf' || a.asset_type === 'image') && (
                    <button
                      type="button"
                      onClick={() => handleAnnotate(a.id, a.asset_type as 'pdf' | 'image')}
                      className="shrink-0 text-gray-400 hover:text-cyan-600"
                      title="Annotate"
                    >
                      <PenSquare size={14} />
                    </button>
                  )}
                </>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {a.asset_type === 'link' ? <LinkIcon size={14} className="shrink-0 text-cyan-600" /> : <StickyNote size={14} className="shrink-0 text-cyan-600" />}
                  <span className="truncate font-medium text-gray-900 dark:text-slate-100">{a.name}</span>
                  {a.asset_type === 'link' && a.external_url && (
                    <a href={a.external_url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs text-cyan-600 hover:underline">Open</a>
                  )}
                </div>
              )}
              <button type="button" onClick={() => handleDelete(a.id)} className="shrink-0 text-gray-400 hover:text-red-500">
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}

      <div className="mt-3 space-y-3 border-t border-gray-200 pt-3 dark:border-slate-800">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Upload a file</label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={uploading}>
            {uploading ? 'Uploading…' : 'Choose file'}
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
              className="hidden"
            />
          </label>
        </div>

        <form onSubmit={handleAddLink} className="flex gap-2">
          <input value={linkName} onChange={e => setLinkName(e.target.value)} placeholder="Link name" className="w-1/3 rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600">Add link</button>
        </form>

        <form onSubmit={handleAddNote} className="space-y-1">
          <input value={noteName} onChange={e => setNoteName(e.target.value)} placeholder="Note title" className="w-full rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} placeholder="Note content" rows={2} className="w-full resize-none rounded-lg border border-gray-200 px-2 py-1 text-xs" />
          <button type="submit" className="rounded-lg bg-cyan-500 px-3 py-1 text-xs font-semibold text-white hover:bg-cyan-600">Add note</button>
        </form>
      </div>

      {annotatingAsset && currentUserId && (
        <WorksheetAnnotatorModalLoader
          topicId={topicId}
          assetId={annotatingAsset.id}
          assetType={annotatingAsset.assetType}
          currentUserId={currentUserId}
          onClose={() => setAnnotatingAsset(null)}
        />
      )}
    </div>
  )
}
