'use client'

import { useState } from 'react'
import {
  FileText, Image, Music, Link, BookOpen, FileSpreadsheet, File,
  MoreVertical, Trash2, ExternalLink, Sparkles, X,
} from 'lucide-react'
import type { ProgramAsset, ProgramAssetType } from '@/types/programs'

const TYPE_ICON: Record<ProgramAssetType, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf:   FileText,
  docx:  FileText,
  xlsx:  FileSpreadsheet,
  image: Image,
  audio: Music,
  video: Link,
  note:  BookOpen,
  link:  Link,
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

function fmtBytes(n: number | null) {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export default function AssetCard({
  asset,
  programId,
  canManage,
  onDeleted,
  onUpdated,
}: {
  asset: ProgramAsset
  programId: string
  canManage: boolean
  onDeleted: (id: string) => void
  onUpdated: (asset: ProgramAsset) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showSummary, setShowSummary] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const Icon = TYPE_ICON[asset.asset_type] ?? File
  const colour = TYPE_COLOUR[asset.asset_type] ?? '#64748b'

  async function handleDelete() {
    if (!confirm(`Delete "${asset.name}"?`)) return
    setDeleting(true)
    await fetch(`/api/programs/${programId}/assets/${asset.id}`, { method: 'DELETE' })
    onDeleted(asset.id)
  }

  function handleOpen() {
    if (asset.signed_url) {
      window.open(asset.signed_url, '_blank')
    } else if (asset.external_url) {
      window.open(asset.external_url, '_blank')
    }
  }

  // suppress unused warning — onUpdated available for future rename flow
  void onUpdated

  const showKebab = canManage || !!asset.ai_summary

  return (
    <div className="group relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-colors hover:border-gray-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${colour}1a`, color: colour }}
      >
        <Icon size={20} />
      </div>

      <p className="mb-1 text-sm font-bold leading-snug text-gray-900 line-clamp-2 dark:text-slate-100">
        {asset.name}
      </p>

      <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-slate-500">
        {asset.asset_type}
        {asset.file_size_bytes ? ` · ${fmtBytes(asset.file_size_bytes)}` : ''}
      </p>

      {asset.ai_status === 'done' && asset.ai_tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {asset.ai_tags.slice(0, 3).map(tag => (
            <span
              key={tag}
              className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        {(asset.signed_url || asset.external_url) && (
          <button
            type="button"
            onClick={handleOpen}
            className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ExternalLink size={11} />
            Open
          </button>
        )}
        {asset.asset_type === 'note' && asset.note_content && (
          <span className="flex-1 text-xs text-gray-400 line-clamp-1 dark:text-slate-500">
            {asset.note_content.slice(0, 60)}
          </span>
        )}
      </div>

      {showKebab && (
        <div className="absolute right-3 top-3">
          <button
            type="button"
            onClick={() => setMenuOpen(m => !m)}
            className="hidden h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 group-hover:flex dark:text-slate-600 dark:hover:bg-slate-800"
          >
            <MoreVertical size={14} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 min-w-[160px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                {asset.ai_summary && (
                  <button
                    type="button"
                    onClick={() => { setShowSummary(true); setMenuOpen(false) }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    <Sparkles size={12} />
                    View AI summary
                  </button>
                )}
                {canManage && (
                  <button
                    type="button"
                    onClick={() => { handleDelete(); setMenuOpen(false) }}
                    disabled={deleting}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {showSummary && asset.ai_summary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowSummary(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900"
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">AI summary</h3>
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm text-gray-700 dark:text-slate-300">{asset.ai_summary}</p>
          </div>
        </div>
      )}
    </div>
  )
}
