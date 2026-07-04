'use client'

import { useState } from 'react'
import { FileText, Image, Music, Link as LinkIcon, BookOpen, FileSpreadsheet, File, Send } from 'lucide-react'
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
  sessionChat,
}: {
  linkedProgram: LinkedProgramBundle
  sessionChat: { conversationId: string } | null
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [sharingId, setSharingId] = useState<string | null>(null)

  const { categories, assets } = linkedProgram
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

  async function shareToChat(asset: ProgramAsset) {
    if (!sessionChat) return
    setSharingId(asset.id)
    await fetch(`/api/programs/${linkedProgram.program.id}/assets/${asset.id}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: sessionChat.conversationId }),
    }).catch(() => {})
    setSharingId(null)
  }

  return (
    <>
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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleAssetClick(asset)}
                    className="flex flex-1 min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800 transition-colors"
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded"
                      style={{ backgroundColor: `${colour}33`, color: colour }}
                    >
                      <Icon size={13} />
                    </span>
                    <span className="text-xs text-slate-200 truncate">{asset.name}</span>
                  </button>
                  {sessionChat && (
                    <button
                      onClick={() => shareToChat(asset)}
                      disabled={sharingId === asset.id}
                      className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-cyan-400 disabled:opacity-50"
                      title="Share to chat"
                    >
                      <Send size={12} />
                    </button>
                  )}
                </div>
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
    </>
  )
}
