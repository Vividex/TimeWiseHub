'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import getStroke from 'perfect-freehand'
import { Type, Pencil, Move } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { fetchAnnotations, insertAnnotation, updateAnnotationContent, updateAnnotationPosition, deleteAnnotation, worksheetChannelName } from '@/lib/worksheets/annotations'
import { findBuiltinSticker } from '@/lib/worksheets/stickers'
import StickerPalette from './StickerPalette'
import ScrollFade from '@/components/ui/ScrollFade'
import type { AnnotationContent, WorksheetAnnotation } from '@/types/worksheets'

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

const PAGE_WIDTH = 800

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
  const [customStickerUrls, setCustomStickerUrls] = useState<Record<string, string>>({})
  const [pageNumber, setPageNumber] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [pageHeight, setPageHeight] = useState(PAGE_WIDTH)
  const [tool, setTool] = useState<Tool>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
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
    const customPaths = annotations
      .filter(a => a.object_type === 'sticker' && (a.content as { kind: string }).kind === 'sticker_custom')
      .map(a => (a.content as { kind: 'sticker_custom'; storagePath: string }).storagePath)
      .filter(p => !customStickerUrls[p])
    if (customPaths.length === 0) return
    const supabase = createClient()
    Promise.all(customPaths.map(p => supabase.storage.from('worksheet-stickers').createSignedUrl(p, 3600)))
      .then(results => {
        setCustomStickerUrls(prev => {
          const next = { ...prev }
          results.forEach((r, i) => { if (r.data) next[customPaths[i]] = r.data.signedUrl })
          return next
        })
      })
  }, [annotations, customStickerUrls])

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
    if (selectedId === id) setSelectedId(null)
    channelRef.current?.send({ type: 'broadcast', event: 'delete', payload: { id } })
    await deleteAnnotation(id)
  }

  function relativePosition(clientX: number, clientY: number): { x: number; y: number } {
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left) / rect.width, y: (clientY - rect.top) / rect.height }
  }

  function measurePageHeight() {
    const h = pageRef.current?.getBoundingClientRect().height
    if (h) setPageHeight(h)
  }

  const [pendingStickerId, setPendingStickerId] = useState<string | null>(null)
  const [pendingCustomSticker, setPendingCustomSticker] = useState<string | null>(null)

  const handlePageClick = useCallback(async (e: React.MouseEvent<HTMLDivElement>) => {
    if (tool !== 'text' && tool !== 'sticker') {
      setSelectedId(null)
      return
    }
    const { x, y } = relativePosition(e.clientX, e.clientY)

    const content: AnnotationContent = tool === 'text'
      ? { kind: 'text_box', text: '' }
      : pendingCustomSticker
        ? { kind: 'sticker_custom', storagePath: pendingCustomSticker }
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
    if (tool === 'text') setSelectedId(saved.id)
    setTool(null)
    setPendingStickerId(null)
    setPendingCustomSticker(null)
  }, [tool, pageNumber, topicAssetId, studentId, currentUserId, pendingStickerId, pendingCustomSticker])

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

  // Dragging a text box (move or resize) is handled independently of the page's own
  // pen/click handlers via window-level listeners, so it never conflicts with drawing.
  function beginDrag(e: React.PointerEvent, annotation: WorksheetAnnotation, mode: 'move' | 'resize') {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(annotation.id)
    const rect = pageRef.current?.getBoundingClientRect()
    if (!rect) return
    const startClientX = e.clientX
    const startClientY = e.clientY
    const start = { x: annotation.x, y: annotation.y, width: annotation.width, height: annotation.height }

    function onMove(ev: PointerEvent) {
      const dxFrac = (ev.clientX - startClientX) / rect!.width
      const dyFrac = (ev.clientY - startClientY) / pageHeight
      setAnnotations(prev => prev.map(a => {
        if (a.id !== annotation.id) return a
        if (mode === 'move') {
          return { ...a, x: start.x + dxFrac, y: start.y + dyFrac }
        }
        return { ...a, width: Math.max(0.03, start.width + dxFrac), height: Math.max(0.02, start.height + dyFrac) }
      }))
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setAnnotations(prev => {
        const updated = prev.find(a => a.id === annotation.id)
        if (updated) {
          broadcastUpsert(updated)
          updateAnnotationPosition(updated.id, { x: updated.x, y: updated.y, width: updated.width, height: updated.height })
        }
        return prev
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
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
        <StickerPalette
          topicAssetId={topicAssetId}
          studentId={studentId}
          onPick={id => { setPendingStickerId(id); setTool('sticker') }}
          onUploadCustom={storagePath => { setPendingCustomSticker(storagePath); setTool('sticker') }}
        />
        {assetType === 'pdf' && numPages > 1 && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <button type="button" onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1}>‹</button>
            Page {pageNumber} / {numPages}
            <button type="button" onClick={() => setPageNumber(p => Math.min(numPages, p + 1))} disabled={pageNumber >= numPages}>›</button>
          </div>
        )}
      </div>

      {tool && (
        <div className="bg-cyan-600/90 px-3 py-1.5 text-center text-xs font-semibold text-white">
          {tool === 'pen' ? 'Draw on the worksheet to add your mark' : 'Click the worksheet to place it'}
        </div>
      )}

      <ScrollFade wrapperClassName="flex-1" className="p-4" fadeFrom="from-slate-950">
        <div
          ref={pageRef}
          className="relative mx-auto bg-white"
          style={{ width: PAGE_WIDTH, cursor: tool ? 'crosshair' : 'default' }}
          onClick={handlePageClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          {assetType === 'pdf' ? (
            <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => setNumPages(n)}>
              <Page pageNumber={pageNumber} width={PAGE_WIDTH} onRenderSuccess={measurePageHeight} />
            </Document>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fileUrl} alt="Worksheet" style={{ width: PAGE_WIDTH, display: 'block' }} onLoad={measurePageHeight} />
          )}

          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {pageAnnotations
              .filter(a => a.object_type === 'stroke')
              .map(a => {
                const c = a.content as { kind: 'stroke'; points: [number, number][]; color: string }
                const scaled: [number, number][] = c.points.map(([x, y]) => [
                  (a.x + x * a.width) * PAGE_WIDTH,
                  (a.y + y * a.height) * pageHeight,
                ])
                return <path key={a.id} d={strokeToPath(scaled)} fill={c.color} />
              })}
            {drawingPoints.length > 1 && (
              <path d={strokeToPath(drawingPoints.map(([x, y]) => [x * PAGE_WIDTH, y * pageHeight]))} fill="#ef4444" />
            )}
          </svg>

          {pageAnnotations
            .filter(a => a.object_type === 'text_box')
            .map(a => {
              const c = a.content as { kind: 'text_box'; text: string }
              const isSelected = selectedId === a.id
              return (
                <div
                  key={a.id}
                  className="group absolute"
                  style={{ left: `${a.x * PAGE_WIDTH}px`, top: `${a.y * pageHeight}px`, width: `${a.width * PAGE_WIDTH}px`, height: `${a.height * pageHeight}px` }}
                  onClick={e => { e.stopPropagation(); setSelectedId(a.id) }}
                >
                  {isSelected ? (
                    <>
                      <textarea
                        autoFocus
                        value={c.text}
                        onChange={e => handleTextChange(a, e.target.value)}
                        className="h-full w-full resize-none !border-cyan-400 !bg-white !text-slate-900 border p-1 text-sm focus:outline-none"
                      />
                      <div
                        onPointerDown={e => beginDrag(e, a, 'move')}
                        className="absolute -top-3 left-1/2 flex h-5 w-8 -translate-x-1/2 cursor-move items-center justify-center rounded-full bg-cyan-600 text-white"
                        title="Drag to move"
                      >
                        <Move size={12} />
                      </div>
                      <div
                        onPointerDown={e => beginDrag(e, a, 'resize')}
                        className="absolute -bottom-1 -right-1 h-4 w-4 cursor-nwse-resize rounded-full bg-cyan-600"
                        title="Drag to resize"
                      />
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); handleDeleteAnnotation(a.id) }}
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

          {pageAnnotations
            .filter(a => a.object_type === 'sticker')
            .map(a => {
              const c = a.content as { kind: 'sticker_builtin'; id: string } | { kind: 'sticker_custom'; storagePath: string }
              const style = { left: `${a.x * PAGE_WIDTH}px`, top: `${a.y * pageHeight}px`, width: `${a.width * PAGE_WIDTH}px`, height: `${a.height * pageHeight}px` }
              const deleteButton = (
                <button
                  type="button"
                  onClick={() => handleDeleteAnnotation(a.id)}
                  className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs text-white group-hover:flex"
                  title="Delete"
                >
                  ×
                </button>
              )
              if (c.kind === 'sticker_custom') {
                const url = customStickerUrls[c.storagePath]
                return (
                  <div key={a.id} className="group absolute" style={style}>
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
                <div key={a.id} className="group absolute flex items-center justify-center" style={{ ...style, color: sticker.color }}>
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
