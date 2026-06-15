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
  create_session: 'Book session',
  update_session: 'Update session',
  add_session_todo: 'Add to checklist',
  check_session_todo: 'Check item',
  add_progress_note: 'Add progress note',
  create_quote: 'Create quote',
}

// Keys that are internal IDs — never shown to users
function isIdKey(key: string) {
  return key === 'id' || key.endsWith('_id')
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) return `${value.length} item${value.length !== 1 ? 's' : ''}`
  return String(value)
}

// Best human-readable label for a single action
function actionSummary(tool: string, input: Record<string, unknown>): string {
  const label = TOOL_LABELS[tool] ?? tool
  const name = input.title ?? input.name ?? input.description ?? input.body ?? null
  return name ? `${label}: ${String(name)}` : label
}

export type ActionProposal = {
  tool: string
  input: Record<string, unknown>
  id: string
}

export default function ActionCard({
  proposals,
  onConfirm,
  onCancel,
  loading,
}: {
  proposals: ActionProposal[]
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  if (proposals.length === 0) return null

  const isBulk = proposals.length > 1

  // For bulk: group by tool to produce a header like "Create 9 tasks"
  const toolCount = proposals.reduce<Record<string, number>>((acc, p) => {
    acc[p.tool] = (acc[p.tool] ?? 0) + 1
    return acc
  }, {})
  const bulkHeader = Object.entries(toolCount)
    .map(([tool, n]) => `${n} ${(TOOL_LABELS[tool] ?? tool).toLowerCase()}${n > 1 ? 's' : ''}`)
    .join(' + ')

  // For single: show field-by-field detail
  const single = proposals[0]
  const singleEntries = isBulk ? [] : Object.entries(single.input).filter(
    ([k, v]) => !isIdKey(k) && v !== null && v !== undefined && v !== '',
  )

  return (
    <div className="my-2 rounded-2xl border border-cyan-200 bg-cyan-50 p-4 dark:border-cyan-900 dark:bg-cyan-950/40">
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-cyan-700 dark:text-cyan-400">
        {isBulk ? `Confirm: ${bulkHeader}` : (TOOL_LABELS[single.tool] ?? single.tool)}
      </p>

      {isBulk ? (
        <ul className="mb-4 space-y-1">
          {proposals.map(p => (
            <li key={p.id} className="text-sm text-slate-700 dark:text-slate-300">
              · {actionSummary(p.tool, p.input)}
            </li>
          ))}
        </ul>
      ) : singleEntries.length > 0 ? (
        <dl className="mb-4 space-y-1">
          {singleEntries.map(([k, v]) => (
            <div key={k} className="flex gap-2 text-sm">
              <dt className="w-32 shrink-0 font-semibold text-slate-500 dark:text-slate-400">
                {formatKey(k)}
              </dt>
              <dd className="text-slate-900 dark:text-slate-100">{formatValue(v)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

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
          {loading ? 'Confirming…' : isBulk ? `Confirm all ${proposals.length}` : 'Confirm'}
        </button>
      </div>
    </div>
  )
}
