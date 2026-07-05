'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import IndustryPicker from './IndustryPicker'
import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'

type WizardStepId = 'welcome' | 'industry'

const WIZARD_STEPS: { id: WizardStepId; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'industry', label: 'Industry' },
]

export default function SetupWizard({
  orgId,
  userId,
}: {
  orgId: string | null
  userId: string
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const [complete, setComplete] = useState(false)
  const [selected, setSelected] = useState<WorkspaceProfileKey | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const currentStep = WIZARD_STEPS[stepIndex]

  async function handleSelectIndustry(key: WorkspaceProfileKey) {
    setSelected(key)
    setError(null)
    const supabase = createClient()
    const table = orgId ? 'organisations' : 'profiles'
    const id = orgId ?? userId
    const { error: updateError } = await supabase
      .from(table)
      .update({ workspace_profile: key })
      .eq('id', id)
    if (updateError) setError(updateError.message)
  }

  async function handleFinish() {
    setSaving(true)
    setError(null)
    const supabase = createClient()
    const table = orgId ? 'organisations' : 'profiles'
    const id = orgId ?? userId
    const { error: updateError } = await supabase
      .from(table)
      .update({ setup_completed: true, setup_completed_at: new Date().toISOString() })
      .eq('id', id)
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setComplete(true)
  }

  if (complete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">TimeWiseHub</p>
          <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">You&apos;re all set</h1>
          <p className="mb-8 text-sm font-medium text-gray-500 dark:text-slate-400">
            Saved — as more industry-specific features roll out, this is what shapes them.
          </p>
          <button
            type="button"
            onClick={() => { window.location.href = '/dashboard' }}
            className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
          >
            Go to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="mb-2 text-sm font-bold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">TimeWiseHub</p>
        <p className="mb-6 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
          Step {stepIndex + 1} of {WIZARD_STEPS.length}
        </p>

        {currentStep.id === 'welcome' && (
          <>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">Let&apos;s set up your workspace</h1>
            <p className="mb-8 text-sm font-medium text-gray-500 dark:text-slate-400">
              A couple of quick questions so TimeWiseHub fits how you actually work.
            </p>
            <button
              type="button"
              onClick={() => setStepIndex(1)}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
            >
              Next
            </button>
          </>
        )}

        {currentStep.id === 'industry' && (
          <>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">What field are you in?</h1>
            <p className="mb-6 text-sm font-medium text-gray-500 dark:text-slate-400">
              Not sure, or don&apos;t see your field? Choose &quot;Other / Not Listed&quot; — you can change this anytime in Settings.
            </p>

            <div className="mb-6">
              <IndustryPicker value={selected} onChange={handleSelectIndustry} />
            </div>

            {error && (
              <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleFinish}
              disabled={!selected || saving}
              className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Finish'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
