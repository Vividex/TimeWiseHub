'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ClientOption = { id: string; name: string }

export default function AddStudentButton({ clients }: { clients: ClientOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState('')

  if (clients.length === 0) return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
      >
        + New student
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-black text-gray-900">New student</h2>
        <p className="mb-4 text-sm text-gray-500">Which client is this student enrolled under?</p>
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
        >
          <option value="">— Select —</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.965]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!clientId}
            onClick={() => router.push(`/dashboard/clients/${clientId}/students?new=1`)}
            className="flex-1 rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 disabled:opacity-50 disabled:pointer-events-none"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
