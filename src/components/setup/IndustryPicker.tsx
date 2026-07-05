'use client'

import type { WorkspaceProfileKey } from '@/lib/workspace-profiles/types'
import { WORKSPACE_PROFILES } from '@/lib/workspace-profiles/registry'

export default function IndustryPicker({
  value,
  onChange,
}: {
  value: WorkspaceProfileKey | null
  onChange: (key: WorkspaceProfileKey) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {Object.values(WORKSPACE_PROFILES).map(profile => (
        <button
          key={profile.key}
          type="button"
          onClick={() => onChange(profile.key)}
          className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${
            value === profile.key
              ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-500/10 dark:text-cyan-300'
              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {profile.label}
        </button>
      ))}
    </div>
  )
}
