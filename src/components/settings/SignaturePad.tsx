'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

export default function SignaturePad({
  userId,
  initialSignatureUrl,
  onSaved,
}: {
  userId: string
  initialSignatureUrl: string | null
  onSaved?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const rectRef = useRef<DOMRect | null>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [signatureUrl, setSignatureUrl] = useState(initialSignatureUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function getCtx() {
    return canvasRef.current?.getContext('2d') ?? null
  }

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>, rect: DOMRect) {
    const canvas = canvasRef.current!
    // The canvas's CSS-rendered size (rect) can be smaller than its pixel-buffer
    // size (canvas.width/height) on narrow screens, since it's responsive but the
    // buffer isn't -- without this scale factor, touch points land at the wrong
    // spot on the buffer (often off the visible drawing area entirely).
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getCtx()
    const canvas = canvasRef.current
    if (!ctx || !canvas) return
    // Measure the rect once per stroke and reuse it for every move in that stroke.
    // Re-measuring on each event (the old behaviour) could pick up a mid-stroke
    // layout shift -- e.g. a focus outline appearing once setPointerCapture below
    // moves focus to the canvas -- producing a visibly different rect between the
    // down point and the first move point, which draws as a stray line jumping
    // from the wrong spot to the cursor instead of a smooth stroke.
    rectRef.current = canvas.getBoundingClientRect()
    drawingRef.current = true
    lastPointRef.current = pointFromEvent(e, rectRef.current)
    canvas.setPointerCapture(e.pointerId)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !rectRef.current) return
    const ctx = getCtx()
    if (!ctx || !lastPointRef.current) return
    const point = pointFromEvent(e, rectRef.current)
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    lastPointRef.current = point
    setHasDrawn(true)
  }

  function handlePointerUp() {
    drawingRef.current = false
    lastPointRef.current = null
    rectRef.current = null
  }

  function handleClear() {
    const canvas = canvasRef.current
    const ctx = getCtx()
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    setError(null)
  }

  async function handleSave() {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) return
    setSaving(true)
    setError(null)

    const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) { setError('Could not export signature.'); setSaving(false); return }

    const supabase = createClient()
    const path = `${userId}/signature.png`
    const { error: uploadError } = await supabase.storage
      .from('signatures')
      .upload(path, blob, { upsert: true, contentType: 'image/png' })
    if (uploadError) { setError(uploadError.message); setSaving(false); return }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ signature_path: path })
      .eq('id', userId)
    if (updateError) { setError(updateError.message); setSaving(false); return }

    const { data } = await supabase.storage.from('signatures').createSignedUrl(path, 3600)
    setSignatureUrl(data?.signedUrl ?? null)
    setSaving(false)
    setSaved(true)
    setHasDrawn(false)
    setTimeout(() => setSaved(false), 3000)
    onSaved?.()
  }

  return (
    <div className="space-y-3">
      {signatureUrl && !hasDrawn && (
        <div>
          <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-slate-400">Current signature</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={signatureUrl} alt="Your saved signature" className="h-16 rounded-lg border border-gray-200 bg-white dark:border-slate-700 px-2" />
        </div>
      )}
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-500 dark:text-slate-400">
          {signatureUrl ? 'Draw a new signature to replace it' : 'Draw your signature'}
        </p>
        <canvas
          ref={canvasRef}
          width={400}
          height={140}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          className="touch-none w-full max-w-[400px] rounded-xl border border-gray-200 bg-white dark:border-slate-700"
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={handleClear} disabled={!hasDrawn} className="rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50">
          Clear
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasDrawn || saving}
          className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save signature'}
        </button>
        {saved && <span className="text-xs font-semibold text-cyan-500">Saved!</span>}
      </div>
    </div>
  )
}
