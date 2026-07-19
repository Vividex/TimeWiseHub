export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentProps } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import SwmsDocumentPdf, { type SwmsPdfSignature } from '@/components/projects/SwmsDocumentPdf'
import type { SwmsAuthoredContent } from '@/types/swms'

export async function GET(req: Request, { params }: { params: Promise<{ projectId: string; documentId: string }> }) {
  const { projectId, documentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS-scoped read with the requester's own session -- if this returns a
  // row, they're entitled to view it. Only after this check do we switch to
  // the service client, and only to fetch signature image files.
  const { data: doc, error: docError } = await supabase
    .from('project_swms_documents')
    .select('id, name, content, source')
    .eq('id', documentId)
    .eq('project_id', projectId)
    .single()

  if (docError || !doc || doc.source !== 'authored' || !doc.content) {
    return NextResponse.json({ error: 'Document not found or not available for live rendering' }, { status: 404 })
  }

  const { data: projectRow } = await supabase.from('projects').select('name').eq('id', projectId).single()
  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const { data: acks } = await supabase
    .from('project_swms_acknowledgments')
    .select('user_id, acknowledged_at')
    .eq('swms_document_id', documentId)
    .order('acknowledged_at', { ascending: true })

  const content = doc.content as SwmsAuthoredContent
  const consultedUserIds = content.consultedUserIds ?? []
  const ackUserIds = (acks ?? []).map(a => a.user_id)
  const allUserIds = Array.from(new Set([...ackUserIds, ...consultedUserIds]))

  const service = createServiceClient()
  const { data: profiles } = allUserIds.length > 0
    ? await service.from('profiles').select('id, full_name, username, signature_path').in('id', allUserIds)
    : { data: [] as { id: string; full_name: string | null; username: string | null; signature_path: string | null }[] }

  function nameFor(id: string): string {
    const p = (profiles ?? []).find(row => row.id === id)
    return p?.full_name || p?.username || 'Unknown'
  }

  const consultedNames = consultedUserIds.map(nameFor)

  const signatures: SwmsPdfSignature[] = await Promise.all((acks ?? []).map(async ack => {
    const profile = (profiles ?? []).find(p => p.id === ack.user_id)
    let signatureDataUri: string | null = null
    if (profile?.signature_path) {
      const { data: fileData } = await service.storage.from('signatures').download(profile.signature_path)
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer())
        signatureDataUri = `data:image/png;base64,${buffer.toString('base64')}`
      }
    }
    return {
      name: nameFor(ack.user_id),
      acknowledgedAt: ack.acknowledged_at as string,
      signatureDataUri,
    }
  }))

  const element = React.createElement(SwmsDocumentPdf, {
    projectName: projectRow?.name ?? '',
    projectLabel: terminology.project.singular,
    docType: content.docType,
    category: content.category,
    supervisor: content.supervisor,
    preparedBy: content.preparedBy,
    date: content.date,
    rows: content.rows,
    ppe: content.ppe,
    consultedNames,
    whoAtRisk: content.docType === 'jsa' ? content.whoAtRisk : undefined,
    equipment: content.docType === 'jsa' ? content.equipment : undefined,
    emergencyProcedures: content.docType === 'jsa' ? content.emergencyProcedures : undefined,
    signatures,
  }) as unknown as React.ReactElement<DocumentProps>

  const buffer = await renderToBuffer(element)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${doc.name}.pdf"`,
    },
  })
}
