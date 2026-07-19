import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { getWorkspaceProfileForUser } from '@/lib/workspace-profiles/resolve'
import { getTodaySydneyDateString } from '@/lib/today'
import { normalizeSwmsContent } from '@/lib/normalize-swms-content'
import SwmsDocumentContent, { type SwmsContentSignature } from '@/components/projects/SwmsDocumentContent'
import SwmsDocumentSignSection from '@/components/projects/SwmsDocumentSignSection'
import DeleteSwmsDocumentButton from '@/components/projects/DeleteSwmsDocumentButton'
import type { SwmsAuthoredContent } from '@/types/swms'

export default async function SwmsDocumentPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string; documentId: string }>
}) {
  const { id: clientId, projectId, documentId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // RLS-scoped read with the requester's own session -- if this returns a row,
  // they're entitled to view it.
  const { data: doc, error: docError } = await supabase
    .from('project_swms_documents')
    .select('id, name, storage_path, category, doc_type, source, content')
    .eq('id', documentId)
    .eq('project_id', projectId)
    .single()
  if (docError || !doc) notFound()
  if (doc.source === 'authored' && !doc.content) notFound()

  const { terminology } = await getWorkspaceProfileForUser(supabase, user.id)

  const [{ data: project }, { data: membership }, { data: currentProfile }, { data: crewRows }, { data: myAck }] = await Promise.all([
    supabase.from('projects').select('name, site_id').eq('id', projectId).single(),
    supabase.from('organisation_members').select('role').eq('user_id', user.id).maybeSingle(),
    supabase.from('profiles').select('signature_path').eq('id', user.id).maybeSingle(),
    supabase.from('project_members').select('user_id').eq('project_id', projectId),
    supabase.from('project_swms_acknowledgments').select('id').eq('swms_document_id', documentId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!project) notFound()

  const canManage = ['owner', 'admin', 'manager'].includes(membership?.role ?? '')
  const crewUserIds = new Set((crewRows ?? []).map(r => r.user_id as string))
  const isCrewMember = crewUserIds.has(user.id)
  const crewSize = crewUserIds.size
  const hasSignature = !!currentProfile?.signature_path
  const hasAcknowledged = !!myAck

  let hasSignedInToday = false
  if (project.site_id) {
    const { data: signIn } = await supabase
      .from('site_sign_ins')
      .select('id')
      .eq('site_id', project.site_id)
      .eq('user_id', user.id)
      .eq('sign_in_date', getTodaySydneyDateString())
      .maybeSingle()
    hasSignedInToday = !!signIn
  }
  const canAcknowledge = isCrewMember || hasSignedInToday

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <Link href={`/dashboard/clients/${clientId}/projects/${projectId}`} className="text-sm font-bold text-cyan-600 hover:underline">
        ← Back to project
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        {canManage && doc.source === 'authored' && (
          <Link
            href={`/dashboard/clients/${clientId}/projects/${projectId}/swms/new?documentId=${doc.id}`}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 hover:border-gray-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Edit
          </Link>
        )}
        {doc.source === 'authored' && (
          <a
            href={`/api/projects/${projectId}/swms/${doc.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Download PDF
          </a>
        )}
        {canManage && (
          <DeleteSwmsDocumentButton
            documentId={doc.id}
            storagePath={doc.storage_path}
            documentName={doc.name}
            clientId={clientId}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  )

  if (doc.source === 'uploaded') {
    const service = createServiceClient()
    const { data: signed } = await service.storage.from('project-swms').createSignedUrl(doc.storage_path, 3600)

    return (
      <div className="px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {header}
          <SwmsDocumentContent source="uploaded" name={doc.name} openUrl={signed?.signedUrl ?? null} />
          <SwmsDocumentSignSection
            documentId={doc.id}
            currentUserId={user.id}
            canAcknowledge={canAcknowledge}
            hasAcknowledged={hasAcknowledged}
            hasSignature={hasSignature}
          />
        </div>
      </div>
    )
  }

  const content = normalizeSwmsContent(doc.content as SwmsAuthoredContent)
  const consultedUserIds = content.consultedUserIds ?? []

  const { data: acks } = await supabase
    .from('project_swms_acknowledgments')
    .select('user_id, acknowledged_at')
    .eq('swms_document_id', documentId)
    .order('acknowledged_at', { ascending: true })

  const ackUserIds = (acks ?? []).map(a => a.user_id as string)
  const allUserIds = Array.from(new Set([...ackUserIds, ...consultedUserIds]))

  const service = createServiceClient()
  const { data: profiles } = allUserIds.length > 0
    ? await service.from('profiles').select('id, full_name, username, signature_path').in('id', allUserIds)
    : { data: [] as { id: string; full_name: string | null; username: string | null; signature_path: string | null }[] }

  function nameFor(userId: string): string {
    const p = (profiles ?? []).find(row => row.id === userId)
    return p?.full_name || p?.username || 'Unknown'
  }

  const consultedNames = consultedUserIds.map(nameFor)

  const authoredSignatures: SwmsContentSignature[] = await Promise.all((acks ?? []).map(async ack => {
    const profile = (profiles ?? []).find(p => p.id === ack.user_id)
    let signatureUrl: string | null = null
    if (profile?.signature_path) {
      const { data: signed } = await service.storage.from('signatures').createSignedUrl(profile.signature_path, 3600)
      signatureUrl = signed?.signedUrl ?? null
    }
    return {
      name: nameFor(ack.user_id as string),
      acknowledgedAt: ack.acknowledged_at as string,
      signatureUrl,
    }
  }))

  const ackCountLabel = canManage ? `${(acks ?? []).length} of ${crewSize} crew acknowledged` : null

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {header}
        {ackCountLabel && (
          <p className="text-xs font-semibold text-gray-500 dark:text-slate-400">{ackCountLabel}</p>
        )}
        <SwmsDocumentContent
          source="authored"
          projectName={project.name}
          projectLabel={terminology.project.singular}
          docType={content.docType}
          category={content.docType === 'swms' ? content.category : null}
          categories={content.docType === 'jsa' ? content.categories : []}
          supervisor={content.supervisor}
          preparedBy={content.preparedBy}
          date={content.date}
          rows={content.rows}
          ppe={content.ppe}
          consultedNames={consultedNames}
          whoAtRisk={content.docType === 'jsa' ? content.whoAtRisk : undefined}
          equipment={content.docType === 'jsa' ? content.equipment : undefined}
          emergencyProcedures={content.docType === 'jsa' ? content.emergencyProcedures : undefined}
          signatures={authoredSignatures}
        />
        <SwmsDocumentSignSection
          documentId={doc.id}
          currentUserId={user.id}
          canAcknowledge={canAcknowledge}
          hasAcknowledged={hasAcknowledged}
          hasSignature={hasSignature}
        />
      </div>
    </div>
  )
}
