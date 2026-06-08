'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

type Doc = { id: string; name: string; storage_path: string; size_bytes: number | null; created_at: string; confidential: boolean }

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function DocumentPanel({ projectId, userId, initialDocuments, isOrgProject, canManageConfidential }: {
  projectId: string
  userId: string
  initialDocuments: Doc[]
  isOrgProject: boolean
  canManageConfidential: boolean
}) {
  const router = useRouter()
  const [docs, setDocs] = useState(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Doc | null>(null)
  const [uploadConfidential, setUploadConfidential] = useState(false)
  const [confFilter, setConfFilter] = useState<'all' | 'confidential' | 'standard'>('all')

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const supabase = createClient()
    const path = `${userId}/${projectId}/${Date.now()}-${file.name}`

    const { error: uploadError } = await supabase.storage.from('project-documents').upload(path, file)
    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { data: doc, error: dbError } = await supabase.from('project_documents').insert({
      project_id: projectId,
      uploaded_by: userId,
      name: file.name,
      storage_path: path,
      size_bytes: file.size,
      confidential: isOrgProject && uploadConfidential,
    }).select().single()

    if (dbError) { setError(dbError.message); setUploading(false); return }

    setDocs(prev => [doc as Doc, ...prev])
    setUploading(false)
    e.target.value = ''
    router.refresh()
  }

  async function handleView(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from('project-documents').createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(doc: Doc) {
    const supabase = createClient()
    await supabase.storage.from('project-documents').remove([doc.storage_path])
    await supabase.from('project_documents').delete().eq('id', doc.id)
    setDocs(prev => prev.filter(d => d.id !== doc.id))
    setPendingDelete(null)
  }

  const { query, setQuery, filtered: nameFiltered } = useTextFilter(docs, d => d.name)
  const visibleDocs = nameFiltered.filter(d =>
    confFilter === 'all' ? true
    : confFilter === 'confidential' ? d.confidential
    : !d.confidential,
  )

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Documents</h2>
        <div className="flex items-center gap-3">
          {isOrgProject && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={uploadConfidential}
                onChange={e => setUploadConfidential(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
              />
              Confidential
            </label>
          )}
          <label className={`cursor-pointer rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploading ? 'Uploading...' : '+ Upload'}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <SearchInput value={query} onChange={setQuery} placeholder="Search documents…" />
        {canManageConfidential && (
          <select
            value={confFilter}
            onChange={e => setConfFilter(e.target.value as 'all' | 'confidential' | 'standard')}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400"
          >
            <option value="all">All</option>
            <option value="confidential">Confidential only</option>
            <option value="standard">Standard only</option>
          </select>
        )}
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No documents uploaded yet.</p>
      ) : visibleDocs.length === 0 ? (
        <p className="text-sm font-semibold text-gray-500">No matches.</p>
      ) : (
        <ul className="space-y-2">
          {visibleDocs.map(doc => (
            <li key={doc.id} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{doc.name}</p>
                  {doc.confidential && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-100 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-amber-700">
                      <Lock className="h-3 w-3" /> Confidential
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-gray-500">{formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => handleView(doc.storage_path)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700">View</button>
                <button onClick={() => setPendingDelete(doc)} className="text-xs font-semibold text-red-600 transition-colors hover:text-red-700">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete document"
        message={`"${pendingDelete?.name}" will be permanently deleted from storage and cannot be recovered.`}
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
