'use client'

import { useState } from 'react'
import WorksheetAnnotator from '@/components/worksheets/WorksheetAnnotator'

export type StudentWorksheetAsset = { id: string; name: string; asset_type: 'pdf' | 'image'; signed_url: string }

export default function StudentWorksheets({
  assets,
  studentId,
  currentUserId,
}: {
  assets: StudentWorksheetAsset[]
  studentId: string
  currentUserId: string
}) {
  const [selected, setSelected] = useState<StudentWorksheetAsset | null>(null)

  if (assets.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">No annotated worksheets yet.</p>
  }

  if (selected) {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setSelected(null)}
          className="text-sm font-semibold text-cyan-600 hover:underline"
        >
          ← All worksheets
        </button>
        <div className="h-[70vh] overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800">
          <WorksheetAnnotator
            topicAssetId={selected.id}
            studentId={studentId}
            fileUrl={selected.signed_url}
            assetType={selected.asset_type}
            currentUserId={currentUserId}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {assets.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => setSelected(a)}
          className="rounded-2xl border border-gray-100 bg-white p-4 text-left text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
        >
          {a.name}
        </button>
      ))}
    </div>
  )
}
