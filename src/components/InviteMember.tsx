'use client'

import { useState } from 'react'

type Role = 'admin' | 'manager' | 'employee'

export default function InviteMember({ orgId }: { orgId: string }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInviteLink(null)

    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, email, role }),
    })
    const data = await res.json() as { token?: string; error?: string }

    if (!res.ok || !data.token) {
      setError(data.error ?? 'Could not create invitation')
      setLoading(false)
      return
    }

    setInviteLink(`${location.origin}/invite/${data.token}`)
    setEmail('')
    setLoading(false)
  }

  function copyLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <h3 className="mb-3 text-xl font-bold text-gray-900 dark:text-slate-100">Invite a team member</h3>

      <form onSubmit={handleInvite} className="flex gap-2 flex-wrap">
        <input
          type="email"
          required
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="min-w-0 flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400"
        />
        <select
          value={role}
          onChange={e => setRole(e.target.value as Role)}
          className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Generate invite'}
        </button>
      </form>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

      {inviteLink && (
        <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-slate-400">Share this link — expires in 7 days:</p>
          <div className="flex gap-2 items-center">
            <p className="text-xs text-gray-700 truncate flex-1 font-mono dark:text-slate-300">{inviteLink}</p>
            <button
              onClick={copyLink}
              className="shrink-0 rounded-xl bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-600"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

