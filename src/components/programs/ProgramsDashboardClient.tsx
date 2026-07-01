'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Library, Plus, BookOpen, Copy, X } from 'lucide-react'
import ProgramForm from '@/components/programs/ProgramForm'
import type { Program } from '@/types/programs'

export default function ProgramsDashboardClient({
  programs,
  templates,
  orgId,
}: {
  programs: Program[]
  templates: Program[]
  orgId: string | null
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'programs' | 'templates'>('programs')
  const [showForm, setShowForm] = useState(false)
  const [useTemplateTarget, setUseTemplateTarget] = useState<Program | null>(null)
  const [useTemplateName, setUseTemplateName] = useState('')
  const [creatingFromTemplate, setCreatingFromTemplate] = useState(false)

  const list = tab === 'programs' ? programs : templates

  function openUseTemplate(e: React.MouseEvent, template: Program) {
    e.preventDefault()
    e.stopPropagation()
    setUseTemplateTarget(template)
    setUseTemplateName(template.name)
  }

  async function submitUseTemplate() {
    if (!useTemplateTarget || !useTemplateName.trim()) return
    setCreatingFromTemplate(true)
    const res = await fetch(`/api/programs/${useTemplateTarget.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: useTemplateName.trim(), is_template: false }),
    })
    const json = await res.json()
    setCreatingFromTemplate(false)
    if (!res.ok) return
    setUseTemplateTarget(null)
    router.push(`/dashboard/programs/${json.id}`)
    router.refresh()
  }

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-['Poppins'] text-2xl font-black tracking-tight text-gray-900 dark:text-white">
              Programs
            </h1>
            <p className="mt-1 text-sm font-medium text-gray-500 dark:text-slate-400">
              Reusable knowledge containers for your work
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 rounded-2xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-600"
          >
            <Plus size={16} />
            {tab === 'programs' ? 'New program' : 'New template'}
          </button>
        </div>

        <div className="mb-6 flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('programs')}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${tab === 'programs' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
          >
            Programs
          </button>
          <button
            type="button"
            onClick={() => setTab('templates')}
            className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-colors ${tab === 'templates' ? 'bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-white' : 'text-gray-500 dark:text-slate-400'}`}
          >
            Templates
          </button>
        </div>

        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center dark:border-slate-700">
            <Library size={40} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">
              {tab === 'programs' ? 'No programs yet' : 'No templates yet'}
            </p>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              {tab === 'programs'
                ? 'Create your first program to start organising your content.'
                : 'Save a program as a template, or create one from scratch.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
            >
              {tab === 'programs' ? 'Create program' : 'Create template'}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map(p => (
              <Link
                key={p.id}
                href={`/dashboard/programs/${p.id}`}
                className="group relative rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
              >
                <div
                  className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${p.cover_colour}1a`, color: p.cover_colour }}
                >
                  <BookOpen size={20} />
                </div>
                <p className="font-bold text-gray-900 dark:text-slate-100">{p.name}</p>
                {p.description && (
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2 dark:text-slate-400">{p.description}</p>
                )}
                <p className="mt-3 text-xs font-medium text-gray-400 dark:text-slate-500">
                  Created {new Date(p.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                {tab === 'templates' && (
                  <button
                    type="button"
                    onClick={e => openUseTemplate(e, p)}
                    className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 opacity-0 hover:bg-gray-50 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <Copy size={11} />
                    Use template
                  </button>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ProgramForm orgId={orgId} onClose={() => setShowForm(false)} isTemplate={tab === 'templates'} />
      )}

      {useTemplateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Create program from template</h2>
              <button
                type="button"
                onClick={() => setUseTemplateTarget(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-800"
              >
                <X size={16} />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Program name</label>
            <input
              autoFocus
              type="text"
              value={useTemplateName}
              onChange={e => setUseTemplateName(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setUseTemplateTarget(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300">
                Cancel
              </button>
              <button
                type="button"
                onClick={submitUseTemplate}
                disabled={creatingFromTemplate || !useTemplateName.trim()}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50"
              >
                {creatingFromTemplate ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
