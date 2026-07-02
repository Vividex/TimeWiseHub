'use client'

import { useState } from 'react'
import { X, FileText, Image, Music, Link as LinkIcon, BookOpen, FileSpreadsheet, File, FolderOpen } from 'lucide-react'
import type { LinkedProgramBundle, ProgramAsset, ProgramAssetType } from '@/types/programs'

const TYPE_ICON: Record<ProgramAssetType, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf:   FileText,
  docx:  FileText,
  xlsx:  FileSpreadsheet,
  image: Image,
  audio: Music,
  video: LinkIcon,
  note:  BookOpen,
  link:  LinkIcon,
}

const TYPE_COLOUR: Record<ProgramAssetType, string> = {
  pdf:   '#ef4444',
  docx:  '#3b82f6',
  xlsx:  '#10b981',
  image: '#8b5cf6',
  audio: '#f59e0b',
  video: '#ec4899',
  note:  '#06b6d4',
  link:  '#64748b',
}

export default function ProgramReferencePanel({
  linkedProgram,
  open,
  onClose,
}: {
  linkedProgram: LinkedProgramBundle | null
  open: boolean
  onClose: () => void
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  if (!linkedProgram) return null

  const { program, categories, assets } = linkedProgram
  const visibleAssets =
    selectedCategoryId === 'all'
      ? assets
      : assets.filter(a => a.category_id === selectedCategoryId)

  function handleAssetClick(asset: ProgramAsset) {
    if (asset.asset_type === 'note') {
      setExpandedNoteId(prev => (prev === asset.id ? null : asset.id))
      return
    }
    const url = asset.signed_url ?? asset.external_url
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div
      className={`absolute inset-y-0 right-0 w-72 bg-slate-900/95 border-l border-slate-700 flex flex-col z-20 overflow-hidden transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white"
            style={{ backgroundColor: program.cover_colour }}
          >
            <FolderOpen size={11} />
          </span>
          <span className="text-xs font-bold text-slate-200 truncate">{program.name}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 shrink-0">
          <X size={14} />
        </button>
      </div>

      {categories.length > 0 && (
        <div className="px-3 py-2 border-b border-slate-700 shrink-0">
          <select
            value={selectedCategoryId}
            onChange={e => setSelectedCategoryId(e.target.value)}
            className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500"
          >
            <option value="all">All categories</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {visibleAssets.length === 0 ? (
          <p className="text-xs text-slate-500 px-1 py-2">No files in this program yet.</p>
        ) : (
          visibleAssets.map(asset => {
            const Icon = TYPE_ICON[asset.asset_type] ?? File
            const colour = TYPE_COLOUR[asset.asset_type] ?? '#64748b'
            const isExpandedNote = asset.asset_type === 'note' && expandedNoteId === asset.id
            return (
              <div key={asset.id}>
                <button
                  onClick={() => handleAssetClick(asset)}
                  className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800 transition-colors"
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                    style={{ backgroundColor: `${colour}33`, color: colour }}
                  >
                    <Icon size={13} />
                  </span>
                  <span className="text-xs text-slate-200 truncate">{asset.name}</span>
                </button>
                {isExpandedNote && (
                  <p className="mx-2 mb-1 rounded-lg bg-slate-800 px-2 py-1.5 text-xs text-slate-300 whitespace-pre-line">
                    {asset.note_content}
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
