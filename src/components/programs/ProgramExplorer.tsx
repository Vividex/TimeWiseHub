'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FolderOpen, Copy, X } from 'lucide-react'
import CategoryTree from '@/components/programs/CategoryTree'
import AssetGrid from '@/components/programs/AssetGrid'
import { buildCategoryTree } from '@/lib/programs/build-tree'
import type { Program, ProgramCategory, ProgramAsset } from '@/types/programs'

export default function ProgramExplorer({
  program,
  categories,
  assets,
  canManage,
}: {
  program: Program
  categories: ProgramCategory[]
  assets: ProgramAsset[]
  canManage: boolean
}) {
  const router = useRouter()
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [localCategories, setLocalCategories] = useState<ProgramCategory[]>(categories)
  const [localAssets, setLocalAssets] = useState<ProgramAsset[]>(assets)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState(`${program.name} template`)
  const [savingTemplate, setSavingTemplate] = useState(false)

  const tree = buildCategoryTree(localCategories)

  const visibleAssets =
    selectedCategoryId === null
      ? localAssets
      : localAssets.filter(a => a.category_id === selectedCategoryId)

  const handleCategoryAdded = useCallback((cat: ProgramCategory) => {
    setLocalCategories(prev => [...prev, cat])
  }, [])

  const handleCategoryDeleted = useCallback((id: string) => {
    setLocalCategories(prev => prev.filter(c => c.id !== id))
    setLocalAssets(prev => prev.map(a => a.category_id === id ? { ...a, category_id: null } : a))
    setSelectedCategoryId(prev => prev === id ? null : prev)
  }, [])

  const handleAssetAdded = useCallback((asset: ProgramAsset) => {
    setLocalAssets(prev => [asset, ...prev])
  }, [])

  const handleAssetDeleted = useCallback((assetId: string) => {
    setLocalAssets(prev => prev.filter(a => a.id !== assetId))
  }, [])

  const handleAssetUpdated = useCallback((asset: ProgramAsset) => {
    setLocalAssets(prev => prev.map(a => a.id === asset.id ? asset : a))
  }, [])

  async function submitSaveTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    const res = await fetch(`/api/programs/${program.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName.trim(), is_template: true }),
    })
    const json = await res.json()
    setSavingTemplate(false)
    if (!res.ok) return
    setShowSaveTemplate(false)
    router.push(`/dashboard/programs/${json.id}`)
    router.refresh()
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/programs"
            className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
          >
            <ArrowLeft size={14} />
            Programs
          </Link>
          <span className="text-gray-300 dark:text-slate-700">/</span>
          <div className="flex items-center gap-2">
            <span
              className="flex h-6 w-6 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: program.cover_colour }}
            >
              <FolderOpen size={12} />
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{program.name}</span>
          </div>
        </div>
        {canManage && !program.is_template && (
          <button
            type="button"
            onClick={() => setShowSaveTemplate(true)}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <Copy size={12} />
            Save as template
          </button>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-100 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
          <CategoryTree
            programId={program.id}
            tree={tree}
            selectedId={selectedCategoryId}
            onSelect={setSelectedCategoryId}
            canManage={canManage}
            onCategoryAdded={handleCategoryAdded}
            onCategoryDeleted={handleCategoryDeleted}
          />
        </aside>

        <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 dark:bg-slate-950">
          <AssetGrid
            programId={program.id}
            assets={visibleAssets}
            selectedCategoryId={selectedCategoryId}
            canManage={canManage}
            onAssetAdded={handleAssetAdded}
            onAssetDeleted={handleAssetDeleted}
            onAssetUpdated={handleAssetUpdated}
          />
        </main>
      </div>

      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Save as template</h2>
              <button
                type="button"
                onClick={() => setShowSaveTemplate(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Template name</label>
            <input
              autoFocus
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
              Copies the category structure and note/link content only — uploaded files aren't included.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowSaveTemplate(false)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSaveTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {savingTemplate ? 'Saving…' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
