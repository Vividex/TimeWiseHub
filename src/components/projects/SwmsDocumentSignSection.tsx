'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import SignaturePad from '@/components/settings/SignaturePad'

export default function SwmsDocumentSignSection({
  documentId,
  currentUserId,
  canAcknowledge,
  hasAcknowledged,
  hasSignature,
}: {
  documentId: string
  currentUserId: string
  canAcknowledge: boolean
  hasAcknowledged: boolean
  hasSignature: boolean
}) {
  const router = useRouter()
  const [showSignaturePrompt, setShowSignaturePrompt] = useState(false)
  const [acking, setAcking] = useState(false)
  const [localHasSignature, setLocalHasSignature] = useState(hasSignature)
  const [error, setError] = useState<string | null>(null)

  async function handleAcknowledge() {
    setAcking(true)
    setError(null)
    const supabase = createClient()
    const { error: insertError } = await supabase.from('project_swms_acknowledgments').insert({
      swms_document_id: documentId,
      user_id: currentUserId,
    })
    setAcking(false)
    if (insertError) { setError(insertError.message); return }
    setShowSignaturePrompt(false)
    router.refresh()
  }

  function handleAcknowledgeClick() {
    if (!localHasSignature) {
      setShowSignaturePrompt(true)
      return
    }
    handleAcknowledge()
  }

  if (!canAcknowledge) return null

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-lg font-bold text-gray-900 dark:text-slate-100">Sign</p>
      {hasAcknowledged ? (
        <p className="mt-3 text-sm font-bold text-green-600 dark:text-green-400">✓ You&apos;ve acknowledged this document.</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">
            Confirm you&apos;ve read and understood this document before starting work.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleAcknowledgeClick}
              disabled={acking}
              className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
            >
              {acking ? 'Saving…' : "I've read and understood this"}
            </button>
            {localHasSignature && !showSignaturePrompt && (
              <button
                onClick={() => setShowSignaturePrompt(true)}
                className="text-xs font-semibold text-cyan-600 transition-colors hover:text-cyan-700 dark:text-cyan-400"
              >
                Redraw signature
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
          {showSignaturePrompt && (
            <div className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50/50 p-4 dark:border-cyan-500/30 dark:bg-cyan-500/10">
              <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-slate-300">
                Draw your signature to confirm you&apos;ve read and understood this document. It&apos;s saved to your profile and reused next time.
              </p>
              <SignaturePad
                userId={currentUserId}
                initialSignatureUrl={null}
                onSaved={() => {
                  setLocalHasSignature(true)
                  handleAcknowledge()
                }}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
