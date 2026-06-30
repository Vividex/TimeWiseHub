'use client'

import { useState } from 'react'
import { Upload, Plus } from 'lucide-react'
import AssetCard from '@/components/programs/AssetCard'
import AssetUploadZone from '@/components/programs/AssetUploadZone'
import type { ProgramAsset } from '@/types/programs'

export default function AssetGrid({
  programId,
  assets,
  selectedCategoryId,
  canManage,
  onAssetAdded,
  onAssetDeleted,
  onAssetUpdated,
}: {
  programId: string
  assets: ProgramAsset[]
  selectedCategoryId: string | null
  canManage: boolean
  onAssetAdded: (asset: ProgramAsset) => void
  onAssetDeleted: (id: string) => void
  onAssetUpdated: (asset: ProgramAsset) => void
}) {
  const [showUpload, setShowUpload] = useState(false)

  return (
    <div className="flex flex-1 flex-col p-5">
      {canManage && (
        <div className="mb-5 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 dark:text-slate-500">
            {assets.length} {assets.length === 1 ? 'item' : 'items'}
          </p>
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-white shadow shadow-cyan-500/20 hover:bg-cyan-600"
          >
            <Plus size={14} />
            Add content
          </button>
        </div>
      )}

      {assets.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-16 dark:border-slate-700">
          <Upload size={32} className="mb-3 text-gray-300 dark:text-slate-600" />
          <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No content yet</p>
          {canManage && (
            <button
              type="button"
              onClick={() => setShowUpload(true)}
              className="mt-3 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-600"
            >
              Add content
            </button>
          )}
        </div>
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map(asset => (
            <AssetCard
              key={asset.id}
              asset={asset}
              programId={programId}
              canManage={canManage}
              onDeleted={onAssetDeleted}
              onUpdated={onAssetUpdated}
            />
          ))}
        </div>
      )}

      {showUpload && (
        <AssetUploadZone
          programId={programId}
          categoryId={selectedCategoryId}
          onAssetAdded={onAssetAdded}
          onClose={() => setShowUpload(false)}
        />
      )}
    </div>
  )
}
