'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Library, Plus, BookOpen } from 'lucide-react'
import ProgramForm from '@/components/programs/ProgramForm'
import type { Program } from '@/types/programs'

export default function ProgramsDashboardClient({
  programs,
  orgId,
}: {
  programs: Program[]
  orgId: string | null
}) {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between">
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
            New program
          </button>
        </div>

        {programs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center dark:border-slate-700">
            <Library size={40} className="mx-auto mb-3 text-gray-300 dark:text-slate-600" />
            <p className="text-sm font-semibold text-gray-500 dark:text-slate-400">No programs yet</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
              Create your first program to start organising your content.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-600"
            >
              Create program
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {programs.map(p => (
              <Link
                key={p.id}
                href={`/dashboard/programs/${p.id}`}
                className="group rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-colors hover:border-cyan-200 hover:bg-cyan-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30"
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
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && <ProgramForm orgId={orgId} onClose={() => setShowForm(false)} />}
    </div>
  )
}
