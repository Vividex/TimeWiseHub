'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import WorksheetAnnotator from './WorksheetAnnotator'

type StudentOption = { id: string; name: string }

export default function WorksheetAnnotatorModal({
  topicAssetId,
  assetType,
  fileUrl,
  currentUserId,
  onClose,
}: {
  topicAssetId: string
  assetType: 'pdf' | 'image'
  fileUrl: string
  currentUserId: string
  onClose: () => void
}) {
  const [students, setStudents] = useState<StudentOption[]>([])
  const [studentId, setStudentId] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('students')
      .select('id, name')
      .eq('archived', false)
      .order('name')
      .then(({ data }) => setStudents((data ?? []) as StudentOption[]))
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-slate-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-800 p-3">
          {studentId ? (
            <span className="text-sm font-semibold text-slate-200">
              Annotating: {students.find(s => s.id === studentId)?.name}
            </span>
          ) : (
            <select
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200"
            >
              <option value="">Select a student…</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {studentId ? (
            <WorksheetAnnotator
              topicAssetId={topicAssetId}
              studentId={studentId}
              fileUrl={fileUrl}
              assetType={assetType}
              currentUserId={currentUserId}
            />
          ) : (
            <p className="p-4 text-sm text-slate-400">Choose a student to open their attempt.</p>
          )}
        </div>
      </div>
    </div>
  )
}
