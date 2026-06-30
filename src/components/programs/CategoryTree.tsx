'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Plus, Trash2, Folder, FolderOpen } from 'lucide-react'
import CategoryForm from '@/components/programs/CategoryForm'
import type { CategoryNode, ProgramCategory } from '@/types/programs'

function CategoryNodeItem({
  node,
  depth,
  programId,
  selectedId,
  onSelect,
  canManage,
  onCategoryAdded,
  onCategoryDeleted,
}: {
  node: CategoryNode
  depth: number
  programId: string
  selectedId: string | null
  onSelect: (id: string | null) => void
  canManage: boolean
  onCategoryAdded: (cat: ProgramCategory) => void
  onCategoryDeleted: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [showAddChild, setShowAddChild] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isSelected = selectedId === node.id
  const hasChildren = node.children.length > 0

  async function handleDelete() {
    if (!confirm(`Delete "${node.name}"? Assets inside will become uncategorised.`)) return
    setDeleting(true)
    await fetch(`/api/programs/${programId}/categories/${node.id}`, { method: 'DELETE' })
    onCategoryDeleted(node.id)
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium transition-colors ${
          isSelected
            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
            : 'text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && setExpanded(e => !e)}
          className="shrink-0 text-gray-400 dark:text-slate-600"
        >
          {hasChildren
            ? expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            : <span className="inline-block w-3" />}
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 text-left"
          onClick={() => onSelect(isSelected ? null : node.id)}
        >
          {isSelected ? <FolderOpen size={13} /> : <Folder size={13} />}
          <span className="truncate">{node.name}</span>
        </button>
        {canManage && (
          <div className="hidden items-center gap-0.5 group-hover:flex">
            {depth < 2 && (
              <button
                type="button"
                onClick={() => setShowAddChild(true)}
                className="rounded p-0.5 text-gray-400 hover:text-cyan-500 dark:text-slate-600"
                title="Add subcategory"
              >
                <Plus size={11} />
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded p-0.5 text-gray-400 hover:text-red-500 dark:text-slate-600"
              title="Delete category"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>

      {showAddChild && (
        <CategoryForm
          programId={programId}
          parentId={node.id}
          onSaved={onCategoryAdded}
          onClose={() => setShowAddChild(false)}
        />
      )}

      {expanded && node.children.map(child => (
        <CategoryNodeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          programId={programId}
          selectedId={selectedId}
          onSelect={onSelect}
          canManage={canManage}
          onCategoryAdded={onCategoryAdded}
          onCategoryDeleted={onCategoryDeleted}
        />
      ))}
    </div>
  )
}

export default function CategoryTree({
  programId,
  tree,
  selectedId,
  onSelect,
  canManage,
  onCategoryAdded,
  onCategoryDeleted,
}: {
  programId: string
  tree: CategoryNode[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  canManage: boolean
  onCategoryAdded: (cat: ProgramCategory) => void
  onCategoryDeleted: (id: string) => void
}) {
  const [showAddRoot, setShowAddRoot] = useState(false)

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-semibold transition-colors ${
          selectedId === null
            ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400'
            : 'text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800'
        }`}
      >
        <FolderOpen size={13} />
        All files
      </button>

      <div className="mt-1">
        {tree.map(node => (
          <CategoryNodeItem
            key={node.id}
            node={node}
            depth={0}
            programId={programId}
            selectedId={selectedId}
            onSelect={onSelect}
            canManage={canManage}
            onCategoryAdded={onCategoryAdded}
            onCategoryDeleted={onCategoryDeleted}
          />
        ))}
      </div>

      {canManage && (
        <>
          {showAddRoot ? (
            <CategoryForm
              programId={programId}
              parentId={null}
              onSaved={onCategoryAdded}
              onClose={() => setShowAddRoot(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAddRoot(true)}
              className="flex w-full items-center gap-1 rounded-xl px-2 py-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 dark:text-slate-600 dark:hover:text-slate-300"
            >
              <Plus size={12} />
              Add category
            </button>
          )}
        </>
      )}
    </div>
  )
}
