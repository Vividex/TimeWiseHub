'use client'

import { X } from 'lucide-react'

export default function WorksheetFullScreen({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800 px-4 py-3">
        <div className="min-w-0">
          <span className="text-sm font-bold text-white">Worksheet</span>
          <p className="truncate text-xs text-slate-400">
            Tip: click Daily&apos;s Picture-in-Picture button first if you want to keep seeing each other while you work here.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        >
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
