'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import type { DeactivationReason } from '@/types/account-deactivation'
import { REASON_LABEL } from '@/lib/account-deactivation'

const REASONS: DeactivationReason[] = ['too_expensive', 'missing_features', 'switched_tools', 'no_longer_needed', 'other']

export default function DangerZoneDeactivate({
  accountLabel,
  blockedByPlan,
  cancelAtPeriodEnd,
  periodEndDate,
}: {
  accountLabel: string
  blockedByPlan: boolean
  cancelAtPeriodEnd: boolean
  periodEndDate: string | null
}) {
  const router = useRouter()
  const [step, setStep] = useState<'idle' | 'reason' | 'confirm'>('idle')
  const [reason, setReason] = useState<DeactivationReason | ''>('')
  const [feedback, setFeedback] = useState('')
  const [typedConfirm, setTypedConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  async function goToBillingPortal() {
    setOpeningPortal(true)
    setPortalError(null)

    const res = await fetch('/api/stripe/portal', { method: 'POST' })
    const json = await res.json()

    if (!res.ok || !json.url) {
      setPortalError(json.error ?? 'Failed to open the billing portal.')
      setOpeningPortal(false)
      return
    }

    router.push(json.url)
  }

  async function submitDeactivation() {
    if (typedConfirm !== accountLabel) return
    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/account/deactivate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, feedback: feedback.trim() || undefined }),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to deactivate account.')
      setSubmitting(false)
      return
    }

    router.push('/account-deactivated')
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-500/20 dark:bg-red-500/10">
      <div className="flex items-center gap-2">
        <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
        <h2 className="text-lg font-bold text-red-700 dark:text-red-300">Deactivate account</h2>
      </div>
      <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-300">
        Closes {accountLabel} for everyone. No data is deleted — you can reactivate any time.
      </p>

      {blockedByPlan && cancelAtPeriodEnd ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-slate-900 dark:text-red-300">
          You&apos;ve already cancelled{periodEndDate ? ` — your access continues until ${periodEndDate}` : ''}. You can deactivate once that date passes.
        </div>
      ) : blockedByPlan ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-4 text-sm font-semibold text-red-700 dark:border-red-500/20 dark:bg-slate-900 dark:text-red-300">
          You&apos;re on a paid plan. Cancel your subscription first, then come back here.
          <button
            onClick={goToBillingPortal}
            disabled={openingPortal}
            className="mt-2 block text-cyan-600 hover:underline disabled:opacity-50 dark:text-cyan-400"
          >
            {openingPortal ? 'Opening…' : 'Manage subscription →'}
          </button>
          {portalError && <p className="mt-2 text-xs font-semibold text-red-600">{portalError}</p>}
        </div>
      ) : step === 'idle' ? (
        <button
          onClick={() => setStep('reason')}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        >
          Deactivate account
        </button>
      ) : step === 'reason' ? (
        <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-white p-4 dark:border-red-500/20 dark:bg-slate-900">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Why are you leaving? *</label>
            <select
              value={reason}
              onChange={event => setReason(event.target.value as DeactivationReason)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Select a reason</option>
              {REASONS.map(r => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-slate-400">Anything else? (optional)</label>
            <textarea
              value={feedback}
              onChange={event => setFeedback(event.target.value)}
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStep('idle')}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              onClick={() => setStep('confirm')}
              disabled={!reason}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-red-700 dark:text-red-300">Confirm deactivation</h3>
            <p className="mt-2 text-sm font-medium text-gray-600 dark:text-slate-300">
              Type <span className="font-bold text-gray-900 dark:text-slate-100">{accountLabel}</span> to confirm.
              Everyone in {accountLabel} will be locked out until it&apos;s reactivated.
            </p>
            <input
              value={typedConfirm}
              onChange={event => setTypedConfirm(event.target.value)}
              className="mt-3 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              autoFocus
            />
            {error && <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => { setStep('reason'); setTypedConfirm(''); setError(null) }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300"
              >
                Back
              </button>
              <button
                onClick={submitDeactivation}
                disabled={typedConfirm !== accountLabel || submitting}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? 'Deactivating…' : 'Deactivate account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
