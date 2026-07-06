'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'
import WorksheetAnnotator from '@/components/worksheets/WorksheetAnnotator'

export type LinkedTopicAsset = { id: string; name: string; asset_type: 'pdf' | 'image'; signed_url: string }

type Selection = { asset: LinkedTopicAsset; studentId: string }

export function callWorksheetChannelName(callId: string): string {
  return `call-worksheet:${callId}`
}

export default function WorksheetTab({
  callId,
  assets,
  studentId,
  currentUserId,
  canPick,
}: {
  callId: string
  assets: LinkedTopicAsset[]
  studentId: string | null
  currentUserId: string
  canPick: boolean
}) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(callWorksheetChannelName(callId))
    channel
      .on('broadcast', { event: 'select' }, ({ payload }) => {
        setSelected(payload as Selection)
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [callId])

  function pick(asset: LinkedTopicAsset) {
    if (!studentId) return
    const selection: Selection = { asset, studentId }
    channelRef.current?.send({ type: 'broadcast', event: 'select', payload: selection })
    setSelected(selection)
  }

  if (selected) {
    return (
      <WorksheetAnnotator
        topicAssetId={selected.asset.id}
        studentId={selected.studentId}
        fileUrl={selected.asset.signed_url}
        assetType={selected.asset.asset_type}
        currentUserId={currentUserId}
      />
    )
  }

  if (!canPick) {
    return <p className="p-3 text-xs text-slate-500">Waiting for the tutor to open a worksheet…</p>
  }

  if (!studentId) {
    return <p className="p-3 text-xs text-slate-500">This session has no student assigned — worksheets need a student to attach to.</p>
  }

  if (assets.length === 0) {
    return <p className="p-3 text-xs text-slate-500">No worksheet PDFs or images uploaded for this topic yet.</p>
  }

  return (
    <div className="space-y-1 p-2">
      {assets.map(a => (
        <button
          key={a.id}
          type="button"
          onClick={() => pick(a)}
          className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
        >
          {a.name}
        </button>
      ))}
    </div>
  )
}
