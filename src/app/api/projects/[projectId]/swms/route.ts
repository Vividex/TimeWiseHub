export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import SwmsDocumentPdf from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'

export async function POST(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as SwmsAuthoredContent & { consultedNames: string[]; projectName: string }
  const { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds, consultedNames, projectName } = body

  if (!category || !rows || rows.length === 0) {
    return NextResponse.json({ error: 'A category and at least one job step are required' }, { status: 400 })
  }

  const element = React.createElement(SwmsDocumentPdf, {
    projectName, category, supervisor, preparedBy, date, rows, ppe, consultedNames,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  const path = `${projectId}/${Date.now()}-swms-${category}.pdf`

  const { error: uploadError } = await supabase.storage.from('project-swms').upload(path, buffer, { contentType: 'application/pdf' })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 400 })

  const content: SwmsAuthoredContent = { category, supervisor, preparedBy, date, rows, ppe, consultedUserIds }

  const { data, error } = await supabase
    .from('project_swms_documents')
    .insert({
      project_id: projectId,
      name: `SWMS — ${category}`,
      storage_path: path,
      uploaded_by: user.id,
      category,
      content,
      source: 'authored',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
