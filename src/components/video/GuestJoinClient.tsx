'use client'

import { useState } from 'react'
import CallRoom from './CallRoom'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  callTitle: string
  roomUrl: string
  dailyRoomName: string
  guestToken: string
  defaultName: string
}

export default function GuestJoinClient({ callTitle, roomUrl, dailyRoomName, guestToken, defaultName }: Props) {
  const [name, setName] = useState(defaultName)
  const [token, setToken] = useState<string | null>(null)
  const [sessionChat, setSessionChat] = useState<{ conversationId: string; userId: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch(
      `/api/video/token?room=${encodeURIComponent(dailyRoomName)}&guestToken=${encodeURIComponent(guestToken)}&displayName=${encodeURIComponent(name.trim())}`,
    )

    if (!res.ok) {
      setError('Unable to join — this link may have expired.')
      setLoading(false)
      return
    }

    const { token: t, chat } = await res.json() as {
      token: string
      chat: { conversationId: string; email: string; tokenHash: string } | null
    }

    if (chat) {
      const supabase = createClient()
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: chat.tokenHash,
        type: 'email',
      })
      if (!verifyError && data.user) {
        setSessionChat({ conversationId: chat.conversationId, userId: data.user.id })
      }
    }

    setToken(t)
  }

  if (token) {
    return (
      <CallRoom
        roomUrl={roomUrl}
        token={token}
        dailyRoomName={dailyRoomName}
        isCreator={false}
        sessionChat={sessionChat}
      />
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">You&apos;re invited</h1>
        <p className="text-slate-400 text-sm mb-6">{callTitle}</p>
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Enter your name"
              className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="w-full py-3 rounded-xl bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Joining…' : 'Join call'}
          </button>
        </form>
      </div>
    </div>
  )
}
