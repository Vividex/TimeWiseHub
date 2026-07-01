import type { ProgramCategory, CategoryNode } from '@/types/programs'

export function buildCategoryTree(categories: ProgramCategory[]): CategoryNode[] {
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
