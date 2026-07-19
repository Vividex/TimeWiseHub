'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import ConfirmDialog from '@/components/ConfirmDialog'
import { resolveSwmsCategoryLabel } from '@/lib/swms-category-label'
import type { SwmsDocument } from '@/types/swms'

export default function ProjectSwmsPanel({
  clientId,
  projectId,
  documents,
  crewSize,
  currentUserId,
  isCrewMember,
  canManage,
  hasSignature,
  hasSignedInToday,
}: {
  clientId: string
  projectId: string
  documents: SwmsDocument[]
  crewSize: number
  currentUserId: string
  isCrewMember: boolean
  canManage: boolean
  hasSignature: boolean
  hasSignedInToday: boolean
}) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<SwmsDocument | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    const path = `${projectId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, file)
    if (uploadError) { setError(uploadError.message); setUploading(false); return }

    const { error: insertError } = await supabase.from('project_swms_documents').insert({
      project_id: projectId,
      name: file.name,
      storage_path: path,
      uploaded_by: user.id,
    })
    setUploading(false)
    e.target.value = ''
    if (insertError) { setError(insertError.message); return }
    router.refresh()
  }

  function handleView(doc: SwmsDocument) {
    router.push(`/dashboard/clients/${clientId}/projects/${projectId}/swms/${doc.id}`)
  }

  async function handleDelete(doc: SwmsDocument) {
    const supabase = createClient()
    await supabase.storage.from('project-swms').remove([doc.storagePath])
    await supabase.from('project_swms_documents').delete().eq('id', doc.id)
    setPendingDelete(null)
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-slate-100">
          <ShieldCheck size={20} className="text-cyan-600" />
          Safety
        </h2>
        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new`}
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
            >
              + Build SWMS
            </Link>
            <Link
              href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?type=jsa`}
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
            >
              + Build JSA
            </Link>
            <label className={`cursor-pointer rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
              {uploading ? 'Uploading…' : '+ Upload SWMS'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}

      {documents.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-gray-500 dark:text-slate-400">No SWMS documents added yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {documents.map(doc => {
            const hasAcknowledged = doc.acknowledgments.some(a => a.userId === currentUserId)
            return (
              <li key={doc.id} className="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-slate-800/60">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{doc.name}</p>
                    {doc.source === 'authored' && doc.category && (
                      <p className="truncate text-xs font-medium text-gray-500 dark:text-slate-400">
                        {resolveSwmsCategoryLabel(doc.category, doc.docType)}
                      </p>
                    )}
                    {canManage && (
                      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">
                        {doc.acknowledgments.length} of {crewSize} crew acknowledged
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button onClick={() => handleView(doc)} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">View</button>
                    {canManage && doc.source === 'authored' && (
                      <Link href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?documentId=${doc.id}`} className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400">Edit</Link>
                    )}
                    {(isCrewMember || hasSignedInToday) && hasAcknowledged && (
                      <span className="text-xs font-bold text-green-600 dark:text-green-400">✓ Acknowledged</span>
                    )}
                    {canManage && (
                      <button onClick={() => setPendingDelete(doc)} className="text-xs font-semibold text-red-500 transition-colors hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete SWMS document"
        message={`"${pendingDelete?.name}" will be permanently deleted and crew will lose access to it.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && handleDelete(pendingDelete)}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
