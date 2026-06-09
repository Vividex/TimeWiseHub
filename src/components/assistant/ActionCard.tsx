// src/components/assistant/ActionCard.tsx
'use client'

const TOOL_LABELS: Record<string, string> = {
  create_task: 'Create task',
  update_task: 'Update task',
  create_project: 'Create project',
  update_project: 'Update project',
  create_client: 'Create client',
  update_client: 'Update client',
  create_time_entry: 'Log time',
  start_timer: 'Start timer',
  stop_timer: 'Stop timer',
  create_expense: 'Log expense',
  create_calendar_event: 'Create event',
  create_leave_request: 'Submit leave',
}

const SKIP_KEYS = new Set(['id'])

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

export type ActionProposal = {
  tool: string
  input: Record<string, unknown>
  id: string
}

export default function ActionCard({
  proposal,
  onConfirm,
  onCancel,
  loading,
}: {
  proposal: ActionProposal
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  const label = TOOL_LABELS[proposal.tool] ?? proposal.tool
  const entries = Object.entries(proposal.input).filter(
    ([k, v]) => !SKIP_KEYS.has(k) && v !== null && v !== undefined && v !== '',
  )

  return (
    <div className="my-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950/40">
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
        {label}
      </p>
      {entries.length > 0 && (
        <dl className="mb-4 space-y-1">
          {entries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-sm">
              <dt className="w-32 shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                {formatKey(k)}
              </dt>
              <dd className="text-slate-900 dark:text-slate-100">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={loading}
          className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? 'Confirming…' : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
