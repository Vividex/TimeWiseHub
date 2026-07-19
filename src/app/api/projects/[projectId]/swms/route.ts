export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import SwmsDocumentPdf from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent, HrcwCategory, JsaHazard, SwmsRow } from '@/types/swms'
import { notifySwmsAwaitingSignature } from '@/lib/swms-notifications'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'

// Flat shape for the raw, untrusted request body -- deliberately not
// SwmsAuthoredContent's discriminated union. Destructuring docType into a
// local variable would decouple it from `body`, so checking the local
// variable can't narrow body's type back down to one union member; a flat
// shape with the JSA-only fields optional avoids that entirely.
type SwmsRoutePayload = {
  docType: 'swms' | 'jsa'
  category?: HrcwCategory
  categories?: JsaHazard[]
  supervisor: string
  preparedBy: string
  date: string
  rows: SwmsRow[]
  ppe: string[]
  consultedUserIds: string[]
  consultedNames: string[]
  projectName: string
  documentId?: string
  whoAtRisk?: string
  equipment?: string
  emergencyProcedures?: string
}

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as SwmsRoutePayload
  const { docType, category, categories, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName, documentId, whoAtRisk, equipment, emergencyProcedures } = body

  const hasCategory = docType === 'jsa' ? !!categories && categories.length > 0 : !!category
  if (!hasCategory || !rows || rows.length === 0) {
    return NextResponse.json({ error: 'A category and at least one job step are required' }, { status: 400 })
  }

  const content: SwmsAuthoredContent = docType === 'jsa'
    ? { docType: 'jsa', categories: categories ?? [], supervisor, preparedBy, date, rows, ppe, consultedUserIds, whoAtRisk: whoAtRisk ?? '', equipment: equipment ?? '', emergencyProcedures: emergencyProcedures ?? '' }
    : { docType: 'swms', category: category as HrcwCategory, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

  const categoryColumnValue = docType === 'jsa' ? (categories ?? []).join(',') : (category as string)

  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  let editableExistingPath: string | null = null
  if (documentId) {
    const [{ data: existing }, { count: ackCount }] = await Promise.all([
      supabase.from('project_swms_documents').select('id, storage_path, source').eq('id', documentId).eq('project_id', projectId).single(),
      supabase.from('project_swms_acknowledgments').select('id', { count: 'exact', head: true }).eq('swms_document_id', documentId),
    ])
    if (existing && existing.source === 'authored' && (ackCount ?? 0) === 0) {
      editableExistingPath = existing.storage_path
    }
  }

  const element = React.createElement(SwmsDocumentPdf, {
    projectName, projectLabel: terminology.project.singular, docType,
    category: docType === 'swms' ? (category as HrcwCategory) : null,
    categories: docType === 'jsa' ? (categories ?? []) : [],
    supervisor, preparedBy, date, rows, ppe, consultedNames,
    whoAtRisk: docType === 'jsa' ? whoAtRisk : undefined,
    equipment: docType === 'jsa' ? equipment : undefined,
    emergencyProcedures: docType === 'jsa' ? emergencyProcedures : undefined,
    signatures: [],
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = editableExistingPath ?? `${projectId}/${Date.now()}-${docType}-${categoryColumnValue}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf', upsert: !!editableExistingPath })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const label = docType === 'jsa' ? 'JSA' : 'SWMS'

  if (editableExistingPath) {
    const { data, error } = await supabase
      .from('project_swms_documents')
      .update({ name: `${label} — ${categoryColumnValue}`, category: categoryColumnValue, doc_type: docType, content })
      .eq('id', documentId)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data)
  }

  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `${label} — ${categoryColumnValue}`,
      storage_path: path,
      uploaded_by: user.id,
      category: categoryColumnValue,
      doc_type: docType,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await notifySwmsAwaitingSignature(data.id, projectId, docType, user.id)

  return NextResponse.json(data)
}
