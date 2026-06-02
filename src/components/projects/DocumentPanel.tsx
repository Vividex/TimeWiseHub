'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

type Doc = { id: string; name: string; storage_path: string; size_bytes: number | null; created_at: string }

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

export default function DocumentPanel({ projectId, userId, initialDocuments }: {
  projectId: string
  userId: string
  initialDocuments: Doc[]
}) {
  const router = useRouter()
  const [docs, setDocs] = useState(initialDocuments)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  }

  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Documents</h2>
        <label className={`text-sm text-blue-600 hover:underline cursor-pointer font-medium ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          {uploading ? 'Uploading...' : '+ Upload'}
          <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400">No documents uploaded yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map(doc => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{doc.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button onClick={() => handleView(doc.storage_path)} className="text-xs text-blue-500 hover:underline">View</button>
                <button onClick={() => handleDelete(doc)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
