'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Video } from 'lucide-react'

type Props = {
  orgId: string
}

export default function StartCallButton({ orgId }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
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
    <button
      onClick={handleClick}
      disabled={loading}
      title="Start video call"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-800 disabled:opacity-50"
    >
      <Video size={16} />
    </button>
  )
}
