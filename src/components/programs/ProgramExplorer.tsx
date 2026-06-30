'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import CategoryTree from '@/components/programs/CategoryTree'
import AssetGrid from '@/components/programs/AssetGrid'
import type { Program, ProgramCategory, ProgramAsset, CategoryNode } from '@/types/programs'

function buildTree(categories: ProgramCategory[]): CategoryNode[] {
  const map = new Map<string, CategoryNode>()
  categories.forEach(c => map.set(c.id, { ...c, children: [] }))
  const roots: CategoryNode[] = []
  categories.forEach(c => {
    if (c.parent_id) {
      map.get(c.parent_id)?.children.push(map.get(c.id)!)
    } else {
      roots.push(map.get(c.id)!)
    }
  })
  return roots
}

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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const [localCategories, setLocalCategories] = useState<ProgramCategory[]>(categories)
  const [localAssets, setLocalAssets] = useState<ProgramAsset[]>(assets)

  const tree = buildTree(localCategories)

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

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
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
    </div>
  )
}
