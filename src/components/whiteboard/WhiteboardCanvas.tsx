// src/components/whiteboard/WhiteboardCanvas.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import getStroke from 'perfect-freehand'
import { Type, Pencil, Eraser, Move } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  fetchWhiteboardObjects,
  insertWhiteboardObject,
  updateWhiteboardObjectContent,
  updateWhiteboardObjectPosition,
  updateWhiteboardObjectStroke,
  deleteWhiteboardObject,
  whiteboardChannelName,
} from '@/lib/whiteboard/objects'
import { findBuiltinSticker } from '@/lib/worksheets/stickers'
import StickerPalette from '@/components/worksheets/StickerPalette'
import ScrollFade from '@/components/ui/ScrollFade'
import type { WhiteboardObject, WhiteboardObjectContent, WhiteboardStrokeContent } from '@/types/whiteboard'

const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 600
const ERASER_RADIUS = 14

const PEN_COLORS = ['#0f172a', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']
const PEN_WIDTHS = [2, 7, 14] as const

type Tool = 'pen' | 'eraser' | 'text' | 'sticker' | null

function strokeToPath(points: [number, number][], width: number): string {
  const outline = getStroke(points, { size: width })
  if (outline.length === 0) return ''
  return outline.reduce((acc, [x, y], i) => `${acc}${i === 0 ? 'M' : 'L'}${x},${y} `, '') + 'Z'
}

// Walks `points` in original order, dropping any index in `erased`, and
// returns each contiguous surviving run with >=2 points (a single leftover
// point isn't a visible stroke, so it's not worth keeping).
function contiguousSurvivingRuns(points: [number, number][], erased: Set<number>): [number, number][][] {
  const runs: [number, number][][] = []
  let current: [number, number][] = []
  points.forEach((p, i) => {
    if (erased.has(i)) {
      if (current.length >= 2) runs.push(current)
      current = []
    } else {
      current.push(p)
    }
  })
  if (current.length >= 2) runs.push(current)
  return runs
}

// Converts a run of points expressed in `original`'s own local space (0-1
// within original's own x/y/width/height) into a fresh, tightly-normalized
// stroke — the same min/max-based normalization a freshly-drawn stroke gets.
function runToNewStroke(
  run: [number, number][],
  original: WhiteboardObject,
): { x: number; y: number; width: number; height: number; content: WhiteboardStrokeContent } {
  const c = original.content as WhiteboardStrokeContent
  const canvasFractionPoints: [number, number][] = run.map(([lx, ly]) => [
    original.x + lx * original.width,
    original.y + ly * original.height,
  ])
  const xs = canvasFractionPoints.map(p => p[0])
  const ys = canvasFractionPoints.map(p => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const maxX = Math.max(...xs), maxY = Math.max(...ys)
  const width = Math.max(maxX - minX, 0.01)
  const height = Math.max(maxY - minY, 0.01)
  // Points are stored as a 0-1 fraction of THIS stroke's own bounding box
  // (not a raw canvas-fraction delta) — the renderer reconstructs canvas
  // position via `o.x + x * o.width`, so this division is required or a
  // stroke renders shrunk by its own width/height a second time.
  const normalised: [number, number][] = canvasFractionPoints.map(([x, y]) => [(x - minX) / width, (y - minY) / height])
  return {
    x: minX,
    y: minY,
    width,
    height,
    content: { kind: 'stroke', points: normalised, color: c.color, strokeWidth: c.strokeWidth },
  }
}

export default function WhiteboardCanvas({
  sessionId,
  currentUserId,
}: {
  sessionId: string
  currentUserId: string
}) {
  const [objects, setObjects] = useState<WhiteboardObject[]>([])
  const [customStickerUrls, setCustomStickerUrls] = useState<Record<string, string>>({})
  const [tool, setTool] = useState<Tool>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [penColor, setPenColor] = useState(PEN_COLORS[0])
  const [penWidth, setPenWidth] = useState<typeof PEN_WIDTHS[number]>(PEN_WIDTHS[1])
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([])
  const [eraserPos, setEraserPos] = useState<{ x: number; y: number } | null>(null)
  const [eraserTick, setEraserTick] = useState(0)
  const canvasRef = useRef<HTMLDivElement>(null)
  const textDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const erasedPointIndicesRef = useRef<Map<string, Set<number>>>(new Map())

  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchWhiteboardObjects(sessionId).then(rows => {
      if (!cancelled) setObjects(rows)
    })
    return () => { cancelled = true }
  }, [sessionId])

  useEffect(() => {
    const customPaths = objects
      .filter(o => o.object_type === 'sticker' && (o.content as { kind: string }).kind === 'sticker_custom')
      .map(o => (o.content as { kind: 'sticker_custom'; storagePath: string }).storagePath)
      .filter(p => !customStickerUrls[p])
    if (customPaths.length === 0) return
    const supabase = createClient()
    Promise.all(customPaths.map(p => supabase.storage.from('whiteboard-stickers').createSignedUrl(p, 3600)))
      .then(results => {
        setCustomStickerUrls(prev => {
          const next = { ...prev }
          results.forEach((r, i) => { if (r.data) next[customPaths[i]] = r.data.signedUrl })
          return next
        })
      })
  }, [objects, customStickerUrls])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(whiteboardChannelName(sessionId))
    channel
      .on('broadcast', { event: 'upsert' }, ({ payload }) => {
        const row = payload as WhiteboardObject
        setObjects(prev => {
          const idx = prev.findIndex(o => o.id === row.id)
          if (idx === -1) return [...prev, row]
          const next = [...prev]
          next[idx] = row
          return next
        })
      })
      .on('broadcast', { event: 'delete' }, ({ payload }) => {
        const { id } = payload as { id: string }
        setObjects(prev => prev.filter(o => o.id !== id))
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  function broadcastUpsert(row: WhiteboardObject) {
    channelRef.current?.send({ type: 'broadcast', event: 'upsert', payload: row })
  }

  function broadcastDelete(id: string) {
    channelRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id } })
  }

  async function handleDeleteObject(id: string) {
    setObjects(prev => prev.filter(o => o.id !== id))
    if (selectedId === id) setSelectedId(null)
    broadcastDelete(id)
    await deleteWhiteboardObject(id)
  }

  function relativePosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  const [pendingStickerId, setPendingStickerId] = useState<string | null>(null)
  const [pendingCustomSticker, setPendingCustomSticker] = useState<string | null>(null)

  async function handleCanvasClick(e: React.MouseEvent<HTMLDivElement>) {
    if (tool !== 'text' && tool !== 'sticker') {
      setSelectedId(null)
      return
    }
    const { x, y } = relativePosition(e.clientX, e.clientY)

    const content: WhiteboardObjectContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : pendingCustomSticker
        ? { kind: 'sticker_custom', storagePath: pendingCustomSticker }
        : { kind: 'sticker_builtin', id: pendingStickerId ?? 'star' }

    const saved = await insertWhiteboardObject({
      session_id: sessionId,
      object_type: tool === 'text' ? 'text_box' : 'sticker',
      x, y, width: tool === 'text' ? 0.2 : 0.06, height: tool === 'text' ? 0.05 : 0.06,
      content,
      created_by: currentUserId,
    })
    setObjects(prev => [...prev, saved])
    broadcastUpsert(saved)
    if (tool === 'text') setSelectedId(saved.id)
    setTool(null)
    setPendingStickerId(null)
    setPendingCustomSticker(null)
  }

  function handleEraserMove(clientX: number, clientY: number) {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH
    const py = ((clientY - rect.top) / rect.height) * CANVAS_HEIGHT
    setEraserPos({ x: px, y: py })

    let changed = false
    for (const o of objects) {
      if (o.object_type !== 'stroke') continue
      const c = o.content as WhiteboardStrokeContent
      const erasedForThis = erasedPointIndicesRef.current.get(o.id) ?? new Set<number>()
      let localChanged = false
      c.points.forEach(([lx, ly], i) => {
        if (erasedForThis.has(i)) return
        const absX = (o.x + lx * o.width) * CANVAS_WIDTH
        const absY = (o.y + ly * o.height) * CANVAS_HEIGHT
        const dx = absX - px, dy = absY - py
        if (dx * dx + dy * dy <= ERASER_RADIUS * ERASER_RADIUS) {
          erasedForThis.add(i)
          localChanged = true
        }
      })
      if (localChanged) {
        erasedPointIndicesRef.current.set(o.id, erasedForThis)
        changed = true
      }
    }
    if (changed) setEraserTick(t => t + 1)
  }

  async function completeErase() {
    const touched = Array.from(erasedPointIndicesRef.current.entries())
    erasedPointIndicesRef.current = new Map()
    setEraserTick(t => t + 1)
    setEraserPos(null)

    for (const [strokeId, erasedIndices] of touched) {
      const original = objects.find(o => o.id === strokeId)
      if (!original || original.object_type !== 'stroke') continue
      const c = original.content as WhiteboardStrokeContent
      const runs = contiguousSurvivingRuns(c.points, erasedIndices)

      if (runs.length === 0) {
        setObjects(prev => prev.filter(o => o.id !== strokeId))
        broadcastDelete(strokeId)
        await deleteWhiteboardObject(strokeId)
        continue
      }

      if (runs.length === 1) {
        const { x, y, width, height, content } = runToNewStroke(runs[0], original)
        const updated: WhiteboardObject = { ...original, x, y, width, height, content }
        setObjects(prev => prev.map(o => (o.id === strokeId ? updated : o)))
        broadcastUpsert(updated)
        await updateWhiteboardObjectStroke(strokeId, { x, y, width, height, content })
        continue
      }

      // Two or more surviving runs (the eraser crossed the stroke in more
      // than one place during this drag): delete the original, insert one
      // fresh row per surviving run.
      setObjects(prev => prev.filter(o => o.id !== strokeId))
      broadcastDelete(strokeId)
      await deleteWhiteboardObject(strokeId)

      for (const run of runs) {
        const { x, y, width, height, content } = runToNewStroke(run, original)
        const saved = await insertWhiteboardObject({
          session_id: sessionId,
          object_type: 'stroke',
          x, y, width, height, content,
          created_by: original.created_by,
        })
        setObjects(prev => [...prev, saved])
        broadcastUpsert(saved)
      }
    }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === 'pen') {
      const { x, y } = relativePosition(e.clientX, e.clientY)
      setDrawingPoints([[x, y]])
    } else if (tool === 'eraser') {
      handleEraserMove(e.clientX, e.clientY)
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (tool === 'pen' && drawingPoints.length > 0) {
      const { x, y } = relativePosition(e.clientX, e.clientY)
      setDrawingPoints(prev => [...prev, [x, y]])
    } else if (tool === 'eraser') {
      handleEraserMove(e.clientX, e.clientY)
    }
  }

  async function handlePointerUp() {
    if (tool === 'eraser') {
      await completeErase()
      return
    }

    if (tool !== 'pen' || drawingPoints.length < 2) { setDrawingPoints([]); return }
    const xs = drawingPoints.map(p => p[0])
    const ys = drawingPoints.map(p => p[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs), maxY = Math.max(...ys)
    const width = Math.max(maxX - minX, 0.01)
    const height = Math.max(maxY - minY, 0.01)
    // Points are stored as a 0-1 fraction of this stroke's own bounding box
    // (see runToNewStroke's comment) — dividing by width/height, not just
    // subtracting minX/minY, is what makes the renderer's
    // `o.x + x * o.width` reconstruct the original canvas position.
    const normalised: [number, number][] = drawingPoints.map(([x, y]) => [(x - minX) / width, (y - minY) / height])

    const saved = await insertWhiteboardObject({
      session_id: sessionId,
      object_type: 'stroke',
      x: minX, y: minY, width, height,
      content: { kind: 'stroke', points: normalised, color: penColor, strokeWidth: penWidth },
      created_by: currentUserId,
    })
    setObjects(prev => [...prev, saved])
    broadcastUpsert(saved)
    setDrawingPoints([])
  }

  function handleTextChange(object: WhiteboardObject, text: string) {
    const updated: WhiteboardObject = { ...object, content: { kind: 'text_box', text } }
    setObjects(prev => prev.map(o => (o.id === object.id ? updated : o)))
    broadcastUpsert(updated)

    clearTimeout(textDebounceRef.current[object.id])
    textDebounceRef.current[object.id] = setTimeout(() => {
      updateWhiteboardObjectContent(object.id, updated.content)
    }, 500)
  }

  function beginDrag(e: React.PointerEvent, object: WhiteboardObject, mode: 'move' | 'resize') {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(object.id)
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const startClientX = e.clientX
    const startClientY = e.clientY
    const start = { x: object.x, y: object.y, width: object.width, height: object.height }

    function onMove(ev: PointerEvent) {
      const dxFrac = (ev.clientX - startClientX) / rect!.width
      const dyFrac = (ev.clientY - startClientY) / rect!.height
      setObjects(prev => prev.map(o => {
        if (o.id !== object.id) return o
        if (mode === 'move') {
          return { ...o, x: start.x + dxFrac, y: start.y + dyFrac }
        }
        return { ...o, width: Math.max(0.03, start.width + dxFrac), height: Math.max(0.02, start.height + dyFrac) }
      }))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setObjects(prev => {
        const updated = prev.find(o => o.id === object.id)
        if (updated) {
          broadcastUpsert(updated)
          updateWhiteboardObjectPosition(updated.id, { x: updated.x, y: updated.y, width: updated.width, height: updated.height })
        }
        return prev
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setTool(tool === 'pen' ? null : 'pen')}
          className={`rounded-lg p-2 ${tool === 'pen' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          title="Pen"
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          onClick={() => setTool(tool === 'eraser' ? null : 'eraser')}
          className={`rounded-lg p-2 ${tool === 'eraser' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          title="Eraser"
        >
          <Eraser size={16} />
        </button>
        <button
          type="button"
          onClick={() => setTool(tool === 'text' ? null : 'text')}
          className={`rounded-lg p-2 ${tool === 'text' ? 'bg-cyan-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          title="Add text"
        >
          <Type size={16} />
        </button>
        <StickerPalette
          bucket="whiteboard-stickers"
          buildUploadPath={file => `${sessionId}/${crypto.randomUUID()}-${file.name}`}
          onPick={id => { setPendingStickerId(id); setTool('sticker') }}
          onUploadCustom={storagePath => { setPendingCustomSticker(storagePath); setTool('sticker') }}
        />

        {tool === 'pen' && (
          <div className="ml-2 flex items-center gap-2 border-l border-gray-200 pl-2">
            {PEN_COLORS.map(color => (
              <button
                key={color}
                type="button"
                onClick={() => setPenColor(color)}
                title={color}
                className={`h-6 w-6 rounded-full ${penColor === color ? 'ring-2 ring-cyan-500 ring-offset-2 ring-offset-white' : ''}`}
                style={{ backgroundColor: color }}
              />
            ))}
            <div className="ml-2 flex items-center gap-1">
              {PEN_WIDTHS.map(width => (
                <button
                  key={width}
                  type="button"
                  onClick={() => setPenWidth(width)}
                  title={`${width}px`}
                  className={`flex h-7 w-7 items-center justify-center rounded ${penWidth === width ? 'bg-gray-200' : ''}`}
                >
                  <span className="rounded-full" style={{ width: width + 2, height: width + 2, backgroundColor: penColor }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {tool && (
        <div className="bg-cyan-500 px-3 py-1.5 text-center text-xs font-semibold text-white">
          {tool === 'pen' ? 'Draw on the whiteboard' : tool === 'eraser' ? 'Drag over ink to erase it' : 'Click the whiteboard to place it'}
        </div>
      )}

      <ScrollFade wrapperClassName="flex-1" className="p-4" fadeFrom="from-gray-50">
        <div
          ref={canvasRef}
          className="relative mx-auto border border-gray-200 bg-white shadow-sm"
          style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, cursor: tool === 'pen' ? 'crosshair' : tool === 'eraser' ? 'cell' : tool ? 'crosshair' : 'default' }}
          onClick={handleCanvasClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {objects
              .filter(o => o.object_type === 'stroke')
              .flatMap(o => {
                const c = o.content as WhiteboardStrokeContent
                const erasedForThis = erasedPointIndicesRef.current.get(o.id)
                const runs = erasedForThis && erasedForThis.size > 0
                  ? contiguousSurvivingRuns(c.points, erasedForThis)
                  : [c.points]
                return runs.map((run, idx) => {
                  const scaled: [number, number][] = run.map(([x, y]) => [
                    (o.x + x * o.width) * CANVAS_WIDTH,
                    (o.y + y * o.height) * CANVAS_HEIGHT,
                  ])
                  return <path key={`${o.id}-${idx}`} d={strokeToPath(scaled, c.strokeWidth)} fill={c.color} />
                })
              })}
            {drawingPoints.length > 1 && (
              <path d={strokeToPath(drawingPoints.map(([x, y]) => [x * CANVAS_WIDTH, y * CANVAS_HEIGHT]), penWidth)} fill={penColor} />
            )}
          </svg>

          {tool === 'eraser' && eraserPos && (
            <div
              className="pointer-events-none absolute rounded-full border-2 border-slate-400 bg-slate-200/40"
              style={{
                left: eraserPos.x - ERASER_RADIUS, top: eraserPos.y - ERASER_RADIUS,
                width: ERASER_RADIUS * 2, height: ERASER_RADIUS * 2,
              }}
            />
          )}

          {objects
            .filter(o => o.object_type === 'text_box')
            .map(o => {
              const c = o.content as { kind: 'text_box'; text: string }
              const isSelected = selectedId === o.id
              return (
                <div
                  key={o.id}
                  className="group absolute"
                  style={{ left: `${o.x * CANVAS_WIDTH}px`, top: `${o.y * CANVAS_HEIGHT}px`, width: `${o.width * CANVAS_WIDTH}px`, height: `${o.height * CANVAS_HEIGHT}px` }}
                  onClick={e => { e.stopPropagation(); setSelectedId(o.id) }}
                >
                  {isSelected ? (
                    <>
                      <textarea
                        autoFocus
                        value={c.text}
                        onChange={e => handleTextChange(o, e.target.value)}
                        className="h-full w-full resize-none !border-cyan-400 !bg-white !text-slate-900 border p-1 text-sm focus:outline-none"
                      />
                      <div
                        onPointerDown={e => beginDrag(e, o, 'move')}
                        className="absolute -top-3 left-1/2 flex h-5 w-8 -translate-x-1/2 cursor-move items-center justify-center rounded-full bg-cyan-600 text-white"
                        title="Drag to move"
                      >
                        <Move size={12} />
                      </div>
                      <div
                        onPointerDown={e => beginDrag(e, o, 'resize')}
                        className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-full bg-cyan-600"
                        title="Drag to resize"
                      />
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleDeleteObject(o.id) }}
                        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white"
                        title="Delete"
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <p className="h-full w-full overflow-hidden whitespace-pre-wrap break-words p-1 text-sm text-slate-900">
                      {c.text}
                    </p>
                  )}
                </div>
              )
            })}

          {objects
            .filter(o => o.object_type === 'sticker')
            .map(o => {
              const c = o.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              const style = { left: `${o.x * CANVAS_WIDTH}px`, top: `${o.y * CANVAS_HEIGHT}px`, width: `${o.width * CANVAS_WIDTH}px`, height: `${o.height * CANVAS_HEIGHT}px` }
              const deleteButton = (
                <button
                  type="button"
                  onClick={() => handleDeleteObject(o.id)}
                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                  title="Delete"
                >
                  ×
                </button>
              )
              if (c.kind === 'sticker_custom') {
                const url = customStickerUrls[c.storagePath]
                return (
                  <div key={o.id} className="group absolute" style={style}>
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="Sticker" className="h-full w-full object-contain" />
                    )}
                    {deleteButton}
                  </div>
                )
              }
              const sticker = findBuiltinSticker(c.id)
              if (!sticker) return null
              const Icon = sticker.icon
              return (
                <div key={o.id} className="group absolute flex items-center justify-center" style={{ ...style, color: sticker.color }}>
                  <Icon size={28} />
                  {deleteButton}
                </div>
              )
            })}
        </div>
      </ScrollFade>
    </div>
  )
}
