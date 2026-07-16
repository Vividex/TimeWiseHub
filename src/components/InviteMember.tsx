'use client'

import { useState } from 'react'

type Role = 'admin' | 'manager' | 'employee'

export default function InviteMember({ orgId, canInvite }: { orgId: string; canInvite: boolean }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('employee')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [invitedEmail, setInvitedEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInviteLink(null)
    setEmailSent(false)

    const res = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId, email, role }),
    })
    const data = await res.json() as { token?: string; emailSent?: boolean; error?: string }

    if (!res.ok || !data.token) {
      setError(data.error ?? 'Could not create invitation')
      setLoading(false)
      return
    }

    setInvitedEmail(email)
    setEmailSent(data.emailSent === true)
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
          className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {loading ? 'Sending...' : 'Send invite'}
        </button>
      </form>

      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 dark:bg-red-950/40 dark:text-red-400">{error}</p>}

      {inviteLink && (
        <div className="mt-3 space-y-2">
          {emailSent && (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-400">
              Invite email sent to {invitedEmail}
            </div>
          )}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-slate-400">
              {emailSent ? 'Backup link — expires in 7 days:' : 'Share this link — expires in 7 days:'}
            </p>
            <div className="flex gap-2 items-center">
              <p className="text-xs text-gray-700 truncate flex-1 font-mono dark:text-slate-300">{inviteLink}</p>
              <button
                onClick={copyLink}
                className="shrink-0 rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-3 py-1.5 text-xs font-semibold"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

