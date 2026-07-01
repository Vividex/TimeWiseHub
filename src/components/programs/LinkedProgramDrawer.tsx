'use client'

import { useState } from 'react'
import { X, FolderOpen } from 'lucide-react'
import CategoryTree from '@/components/programs/CategoryTree'
import AssetGrid from '@/components/programs/AssetGrid'
import { buildCategoryTree } from '@/lib/programs/build-tree'
import type { Program, ProgramCategory, ProgramAsset } from '@/types/programs'

const NOOP_CATEGORY = () => {}
const NOOP_ASSET = () => {}

export default function LinkedProgramDrawer({
  program,
  categories,
  assets,
  onClose,
}: {
  program: Program
  categories: ProgramCategory[]
  assets: ProgramAsset[]
  onClose: () => void
}) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)

  const tree = buildCategoryTree(categories)
  const visibleAssets =
    selectedCategoryId === null
      ? assets
      : assets.filter(a => a.category_id === selectedCategoryId)

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50">
      <div className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: program.cover_colour }}
            >
              <FolderOpen size={14} />
            </span>
            <span className="text-sm font-bold text-gray-900 dark:text-slate-100">{program.name}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-gray-100 bg-white px-3 py-4 dark:border-slate-800 dark:bg-slate-900">
            <CategoryTree
              programId={program.id}
              tree={tree}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
              canManage={false}
              onCategoryAdded={NOOP_CATEGORY}
              onCategoryDeleted={NOOP_CATEGORY}
            />
          </aside>

          <main className="flex flex-1 flex-col overflow-y-auto bg-gray-50 dark:bg-slate-950">
            <AssetGrid
              programId={program.id}
              assets={visibleAssets}
              selectedCategoryId={selectedCategoryId}
              canManage={false}
              onAssetAdded={NOOP_ASSET}
              onAssetDeleted={NOOP_ASSET}
              onAssetUpdated={NOOP_ASSET}
            />
          </main>
        </div>
      </div>
    </div>
  )
}
