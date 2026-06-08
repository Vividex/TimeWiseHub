'use client'

import ProjectCard from '@/components/projects/ProjectCard'
import { useTextFilter } from '@/lib/use-text-filter'
import SearchInput from '@/components/ui/SearchInput'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Project = any

export default function ProjectsGrid({ projects, scope }: { projects: Project[]; scope?: 'personal' | 'org' }) {
  const { query, setQuery, filtered } = useTextFilter(projects, p => `${p.name ?? ''}`)

  return (
    <div className="space-y-4">
      <SearchInput value={query} onChange={setQuery} placeholder="Search projects…" />
      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-gray-100 bg-white p-6 text-sm font-semibold text-gray-500 shadow-sm">No matches.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map(p => <ProjectCard key={p.id} project={p} scope={scope} />)}
        </div>
      )}
    </div>
  )
}
