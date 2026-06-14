'use client'

import { useState } from 'react'
import { Video, CalendarPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ScheduleCallDialog from './ScheduleCallDialog'

type OrgMember = {
  userId: string
  email: string
  fullName: string | null
}

type Props = {
  orgId: string
  members: OrgMember[]
  canSchedule: boolean
}

export default function VideoPageClient({ orgId, members, canSchedule }: Props) {
  const [showSchedule, setShowSchedule] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function startInstantCall() {
    setLoading(true)
    const res = await fetch('/api/video/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    })
    if (res.ok) {
      const { roomId } = await res.json() as { roomId: string }
      router.push(`/dashboard/video/${roomId}`)
    } else {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          onClick={startInstantCall}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          <Video size={16} />
          {loading ? 'Starting…' : 'Start instant call'}
        </button>
        {canSchedule && (
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 transition-colors"
          >
            <CalendarPlus size={16} />
            Schedule a call
          </button>
        )}
      </div>
      {showSchedule && (
        <ScheduleCallDialog
          orgId={orgId}
          members={members}
          onClose={() => setShowSchedule(false)}
        />
      )}
    </>
  )
}
