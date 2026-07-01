'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Library, Eye, X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import LinkedProgramDrawer from '@/components/programs/LinkedProgramDrawer'
import type { LinkedProgramBundle, Program } from '@/types/programs'

export default function SessionProgramLink({
  sessionId,
  orgId,
  linkedProgram,
}: {
  sessionId: string
  orgId: string | null
  linkedProgram: LinkedProgramBundle | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const [showPicker, setShowPicker] = useState(false)
  const [showDrawer, setShowDrawer] = useState(false)
  const [options, setOptions] = useState<Program[] | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [linking, setLinking] = useState(false)

  async function openPicker() {
    setShowPicker(true)
    if (options !== null) return
    setLoadingOptions(true)
    const res = await fetch('/api/programs')
    const all: Program[] = res.ok ? await res.json() : []
    setOptions(all.filter(p => p.org_id === orgId))
    setLoadingOptions(false)
  }

  async function linkProgram(programId: string) {
    setLinking(true)
    await supabase.from('sessions').update({ program_id: programId }).eq('id', sessionId)
    setLinking(false)
    setShowPicker(false)
    router.refresh()
  }

  async function unlinkProgram() {
    await supabase.from('sessions').update({ program_id: null }).eq('id', sessionId)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      {linkedProgram ? (
        <>
          <span
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:text-slate-300"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: linkedProgram.program.cover_colour }}
            />
            {linkedProgram.program.name}
          </span>
          <button
            type="button"
            onClick={() => setShowDrawer(true)}
            className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Eye size={12} />
            View
          </button>
          <button
            type="button"
            onClick={openPicker}
            className="text-xs font-semibold text-cyan-600 hover:underline"
          >
            Change
          </button>
          <button
            type="button"
            onClick={unlinkProgram}
            className="text-xs font-semibold text-red-500 hover:underline"
          >
            Unlink
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Library size={12} />
          Link program
        </button>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Link a program</h2>
              <button
                type="button"
                onClick={() => setShowPicker(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>

            {loadingOptions && (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">Loading…</p>
            )}

            {!loadingOptions && options !== null && options.length === 0 && (
              <p className="py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                No programs available for this organisation yet.
              </p>
            )}

            {!loadingOptions && options !== null && options.length > 0 && (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {options.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={linking}
                    onClick={() => linkProgram(p.id)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.cover_colour }} />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showDrawer && linkedProgram && (
        <LinkedProgramDrawer
          program={linkedProgram.program}
          categories={linkedProgram.categories}
          assets={linkedProgram.assets}
          onClose={() => setShowDrawer(false)}
        />
      )}
    </div>
  )
}
