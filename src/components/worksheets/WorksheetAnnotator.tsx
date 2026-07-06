'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import getStroke from 'perfect-freehand'
import { Type, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { fetchAnnotations, insertAnnotation, updateAnnotationContent, deleteAnnotation, worksheetChannelName } from '@/lib/worksheets/annotations'
import { findBuiltinSticker } from '@/lib/worksheets/stickers'
import StickerPalette from './StickerPalette'
import type { AnnotationContent, WorksheetAnnotation } from '@/types/worksheets'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

type Tool = 'text' | 'pen' | 'sticker' | null

function strokeToPath(points: [number, number][]): string {
  const outline = getStroke(points, { size: 3 })
  if (outline.length === 0) return ''
  return outline.reduce((acc, [x, y], i) => `${acc}${i === 0 ? 'M' : 'L'}${x},${y} `, '') + 'Z'
}

export default function WorksheetAnnotator({
  topicAssetId,
  studentId,
  fileUrl,
  assetType,
  currentUserId,
}: {
  topicAssetId: string
  studentId: string
  fileUrl: string
  assetType: 'pdf' | 'image'
  currentUserId: string
}) {
  const [annotations, setAnnotations] = useState<WorksheetAnnotation[]>([])
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [tool, setTool] = useState<Tool>(null)
  const [drawingPoints, setDrawingPoints] = useState<[number, number][]>([])
  const pageRef = useRef<HTMLDivElement>(null)
  const textDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAnnotations(topicAssetId, studentId).then(rows => {
      if (!cancelled) setAnnotations(rows)
    })
    return () => { cancelled = true }
  }, [topicAssetId, studentId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase.channel(worksheetChannelName(topicAssetId, studentId))
    channel
      .on('broadcast', { event: 'upsert' }, ({ payload }) => {
        const row = payload as WorksheetAnnotation
        setAnnotations(prev => {
          const idx = prev.findIndex(a => a.id === row.id)
          if (idx === -1) return [...prev, row]
          const next = [...prev]
          next[idx] = row
          return next
        })
      })
      .on('broadcast', { event: 'delete' }, ({ payload }) => {
        const { id } = payload as { id: string }
        setAnnotations(prev => prev.filter(a => a.id !== id))
      })
      .subscribe()
    channelRef.current = channel
    return () => { supabase.removeChannel(channel) }
  }, [topicAssetId, studentId])

  function broadcastUpsert(row: WorksheetAnnotation) {
    channelRef.current?.send({ type: 'broadcast', event: 'upsert', payload: row })
  }

  async function handleDeleteAnnotation(id: string) {
    setAnnotations(prev => prev.filter(a => a.id !== id))
    channelRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id } })
    await deleteAnnotation(id)
  }

  function relativePosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  const [pendingStickerId, setPendingStickerId] = useState<string | null>(null)

  const handlePageClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'text' && tool !== 'sticker') return
    const { x, y } = relativePosition(e.clientX, e.clientY)

    const content: AnnotationContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : { kind: 'sticker_builtin', id: pendingStickerId ?? 'star' }

    const saved = await insertAnnotation({
      topic_asset_id: topicAssetId,
      student_id: studentId,
      page_number: pageNumber,
      object_type: tool === 'text' ? 'text_box' : 'sticker',
      x, y, width: tool === 'text' ? 0.2 : 0.06, height: tool === 'text' ? 0.05 : 0.06,
      content,
      created_by: currentUserId,
    })
    setAnnotations(prev => [...prev, saved])
    broadcastUpsert(saved)
    setTool(null)
    setPendingStickerId(null)
  }, [tool, pageNumber, topicAssetId, studentId, currentUserId, pendingStickerId])

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (tool !== 'pen') return
    const { x, y } = relativePosition(e.clientX, e.clientY)
    setDrawingPoints([[x, y]])
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (tool !== 'pen' || drawingPoints.length === 0) return
    const { x, y } = relativePosition(e.clientX, e.clientY)
    setDrawingPoints(prev => [...prev, [x, y]])
  }

  async function handlePointerUp() {
    if (tool !== 'pen' || drawingPoints.length < 2) { setDrawingPoints([]); return }
    const xs = drawingPoints.map(p => p[0])
    const ys = drawingPoints.map(p => p[1])
    const minX = Math.min(...xs), minY = Math.min(...ys)
    const maxX = Math.max(...xs), maxY = Math.max(...ys)
    const normalised: [number, number][] = drawingPoints.map(([x, y]) => [x - minX, y - minY])

    const saved = await insertAnnotation({
      topic_asset_id: topicAssetId,
      student_id: studentId,
      page_number: pageNumber,
      object_type: 'stroke',
      x: minX, y: minY, width: Math.max(maxX - minX, 0.01), height: Math.max(maxY - minY, 0.01),
      content: { kind: 'stroke', points: normalised, color: '#ef4444', strokeWidth: 3 },
      created_by: currentUserId,
    })
    setAnnotations(prev => [...prev, saved])
    broadcastUpsert(saved)
    setDrawingPoints([])
  }

  function handleTextChange(annotation: WorksheetAnnotation, text: string) {
    const updated: WorksheetAnnotation = { ...annotation, content: { kind: 'text_box', text } }
    setAnnotations(prev => prev.map(a => (a.id === annotation.id ? updated : a)))
    broadcastUpsert(updated)

    clearTimeout(textDebounceRef.current[annotation.id])
    textDebounceRef.current[annotation.id] = setTimeout(() => {
      updateAnnotationContent(annotation.id, updated.content)
    }, 500)
  }

  const pageAnnotations = annotations.filter(a => a.page_number === pageNumber)

  return (
    <div className="flex h-full flex-col bg-slate-950">
      <div className="flex items-center gap-2 border-b border-slate-800 p-2">
        <button
          type="button"
          onClick={() => setTool(tool === 'text' ? null : 'text')}
          className={`rounded-lg p-2 ${tool === 'text' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Add text"
        >
          <Type size={16} />
        </button>
        <button
          type="button"
          onClick={() => setTool(tool === 'pen' ? null : 'pen')}
          className={`rounded-lg p-2 ${tool === 'pen' ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300'}`}
          title="Draw"
        >
          <Pencil size={16} />
        </button>
        <StickerPalette onPick={id => { setPendingStickerId(id); setTool('sticker') }} />
        {assetType === 'pdf' && numPages > 1 && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <button type="button" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>‹</button>
            Page {pageNumber} / {numPages}
            <button type="button" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>›</button>
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-auto p-4">
        <div
          ref={pageRef}
          className="relative mx-auto bg-white"
          style={{ width: 800, cursor: tool ? 'crosshair' : 'default' }}
          onClick={handlePageClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {assetType === 'pdf' ? (
            <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
              <Page pageNumber={pageNumber} width={800} />
            </Document>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt="Worksheet" style={{ width: 800, display: 'block' }} />
          )}

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {pageAnnotations
              .filter(a => a.object_type === 'stroke')
              .map(a => {
                const c = a.content as { kind: 'stroke'; points: [number, number][]; color: string }
                const scaled: [number, number][] = c.points.map(([x, y]) => [
                  (a.x + x * a.width) * 800,
                  (a.y + y * a.height) * 800,
                ])
                return <path key={a.id} d={strokeToPath(scaled)} fill={c.color} />
              })}
            {drawingPoints.length > 1 && (
              <path d={strokeToPath(drawingPoints.map(([x, y]) => [x * 800, y * 800]))} fill="#ef4444" />
            )}
          </svg>

          {pageAnnotations
            .filter(a => a.object_type === 'text_box')
            .map(a => {
              const c = a.content as { kind: 'text_box'; text: string }
              return (
                <div
                  key={a.id}
                  className="group absolute"
                  style={{ left: `${a.x * 800}px`, top: `${a.y * 800}px`, width: `${a.width * 800}px`, height: `${a.height * 800}px` }}
                >
                  <textarea
                    value={c.text}
                    onChange={e => handleTextChange(a, e.target.value)}
                    className="h-full w-full resize-none border border-cyan-400 bg-white/90 p-1 text-sm text-slate-900 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnotation(a.id)}
                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )
            })}

          {pageAnnotations
            .filter(a => a.object_type === 'sticker')
            .map(a => {
              const c = a.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              if (c.kind !== 'sticker_builtin') return null
              const sticker = findBuiltinSticker(c.id)
              if (!sticker) return null
              const Icon = sticker.icon
              return (
                <div
                  key={a.id}
                  className="group absolute flex items-center justify-center"
                  style={{ left: `${a.x * 800}px`, top: `${a.y * 800}px`, width: `${a.width * 800}px`, height: `${a.height * 800}px`, color: sticker.color }}
                >
                  <Icon size={28} />
                  <button
                    type="button"
                    onClick={() => handleDeleteAnnotation(a.id)}
                    className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
