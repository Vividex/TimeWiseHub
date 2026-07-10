'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, BookOpen, Link, X, Search, FileText } from 'lucide-react'
import ScrollFade from '@/components/ui/ScrollFade'
import type { ProgramAsset } from '@/types/programs'

type Tab = 'file' | 'note' | 'link' | 'subjects'

type SubjectsSearchResult = {
  id: string
  name: string
  asset_type: string
  topic_id: string
  year_group: string
  subject_id: string
  subject_name: string
  topic_name: string
}

const ACCEPTED = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a'

export default function AssetUploadZone({
  programId,
  categoryId,
  onAssetAdded,
  onClose,
}: {
  programId: string
  categoryId: string | null
  onAssetAdded: (asset: ProgramAsset) => void
  onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('file')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [noteName, setNoteName] = useState('')
  const [noteContent, setNoteContent] = useState('')

  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [linkType, setLinkType] = useState<'link' | 'video'>('link')
  const [subjectsQuery, setSubjectsQuery] = useState('')
  const [subjectsResults, setSubjectsResults] = useState<SubjectsSearchResult[]>([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)

  function triggerSummarise(asset: ProgramAsset) {
    if (asset.asset_type === 'note' || asset.asset_type === 'image' || asset.asset_type === 'pdf') {
      fetch(`/api/programs/${programId}/assets/${asset.id}/summarise`, { method: 'POST' })
    }
  }

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    setUploadProgress(`Uploading ${file.name}…`)
    const formData = new FormData()
    formData.append('file', file)
    if (categoryId) formData.append('category_id', categoryId)

    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      body: formData,
    })
    const json = await res.json()
    setUploading(false)
    setUploadProgress(null)
    if (!res.ok) { setError(json.error ?? 'Upload failed'); return }
    onAssetAdded(json as ProgramAsset)
    triggerSummarise(json as ProgramAsset)
    onClose()
  }, [programId, categoryId, onAssetAdded, onClose])

  useEffect(() => {
    if (!subjectsQuery.trim()) { setSubjectsResults([]); return }
    setSubjectsLoading(true)
    const t = setTimeout(() => {
      fetch(`/api/topics/search?q=${encodeURIComponent(subjectsQuery.trim())}`)
        .then(res => (res.ok ? (res.json() as Promise<SubjectsSearchResult[]>) : []))
        .then(data => { setSubjectsResults(data); setSubjectsLoading(false) })
    }, 300)
    return () => clearTimeout(t)
  }, [subjectsQuery])

  async function handleLinkSubjectsAsset(result: SubjectsSearchResult) {
    setUploading(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_topic_asset_id: result.id, category_id: categoryId }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error ?? 'Failed to link'); return }
    onAssetAdded(json as ProgramAsset)
    onClose()
  }

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) await uploadFile(file)
  }, [uploadFile])

  async function handleSaveNote() {
    if (!noteName.trim()) { setError('Name required'); return }
    setUploading(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_type: 'note', name: noteName, note_content: noteContent, category_id: categoryId }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onAssetAdded(json as ProgramAsset)
    triggerSummarise(json as ProgramAsset)
    onClose()
  }

  async function handleSaveLink() {
    if (!linkName.trim()) { setError('Name required'); return }
    if (!linkUrl.trim()) { setError('URL required'); return }
    setUploading(true)
    setError(null)
    const res = await fetch(`/api/programs/${programId}/assets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asset_type: linkType, name: linkName, external_url: linkUrl, category_id: categoryId }),
    })
    const json = await res.json()
    setUploading(false)
    if (!res.ok) { setError(json.error ?? 'Failed'); return }
    onAssetAdded(json as ProgramAsset)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-bold text-gray-900 dark:text-white">Add content</h2>
          <button type="button" onClick={onClose} className="rounded-xl p-1 text-gray-400 hover:text-gray-700 dark:text-slate-500">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-1 border-b border-gray-100 px-5 dark:border-slate-800">
          {([['file', Upload, 'File'], ['note', BookOpen, 'Note'], ['link', Link, 'Link / Video'], ['subjects', Search, 'From Subjects']] as const).map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => { setTab(key); setError(null) }}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-3 text-xs font-bold transition-colors ${
                tab === key
                  ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                  : 'border-transparent text-gray-400 hover:text-gray-700 dark:text-slate-500'
              }`}
            >
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === 'file' && (
            <div>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-10 transition-colors ${
                  dragging
                    ? 'border-cyan-400 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-950/30'
                    : 'border-gray-200 hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600'
                }`}
              >
                <Upload size={32} className={`mb-3 ${dragging ? 'text-cyan-500' : 'text-gray-300 dark:text-slate-600'}`} />
                <p className="text-sm font-semibold text-gray-600 dark:text-slate-400">
                  {uploadProgress ?? 'Drop a file or click to browse'}
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                  PDF, Word, Excel, images, audio · Max 50MB (images 10MB, audio 100MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (file) await uploadFile(file)
                    e.target.value = ''
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
                Video? Use the Link tab to paste a YouTube, Vimeo, or Loom URL.
              </p>
            </div>
          )}

          {tab === 'note' && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Title</label>
                <input
                  autoFocus
                  type="text"
                  value={noteName}
                  onChange={e => setNoteName(e.target.value)}
                  placeholder="e.g. Session notes template"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Content</label>
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  rows={6}
                  placeholder="Write your note here…"
                  className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveNote} disabled={uploading}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                  {uploading ? 'Saving…' : 'Save note'}
                </button>
              </div>
            </div>
          )}

          {tab === 'link' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                {(['link', 'video'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setLinkType(t)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      linkType === t
                        ? 'bg-cyan-500 text-white'
                        : 'border border-gray-200 text-gray-600 dark:border-slate-700 dark:text-slate-400'
                    }`}>
                    {t === 'link' ? 'Web link' : 'Video (YouTube / Vimeo / Loom)'}
                  </button>
                ))}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
                <input
                  autoFocus
                  type="text"
                  value={linkName}
                  onChange={e => setLinkName(e.target.value)}
                  placeholder="e.g. Intro video"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">URL</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                  Cancel
                </button>
                <button type="button" onClick={handleSaveLink} disabled={uploading}
                  className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                  {uploading ? 'Saving…' : 'Save link'}
                </button>
              </div>
            </div>
          )}

          {tab === 'subjects' && (
            <div className="space-y-3">
              <input
                autoFocus
                value={subjectsQuery}
                onChange={e => setSubjectsQuery(e.target.value)}
                placeholder="Search worksheets by name…"
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {subjectsQuery.trim() && (
                <ScrollFade
                  wrapperClassName="max-h-64 rounded-xl border border-gray-100 dark:border-slate-800"
                  fadeFrom="from-white dark:from-slate-900"
                >
                  {subjectsLoading ? (
                    <p className="p-3 text-xs text-gray-400">Searching…</p>
                  ) : subjectsResults.length === 0 ? (
                    <p className="p-3 text-xs text-gray-400">No worksheets match &quot;{subjectsQuery}&quot;.</p>
                  ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-slate-800">
                      {subjectsResults.map(r => (
                        <li key={r.id}>
                          <button
                            type="button"
                            disabled={uploading}
                            onClick={() => handleLinkSubjectsAsset(r)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-50 dark:hover:bg-slate-800"
                          >
                            <FileText size={14} className="shrink-0 text-cyan-600" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-gray-900 dark:text-slate-100">{r.name}</span>
                              <span className="block truncate text-xs text-gray-400">{r.year_group} · {r.subject_name} · {r.topic_name}</span>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollFade>
              )}
            </div>
          )}

          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  )
}
