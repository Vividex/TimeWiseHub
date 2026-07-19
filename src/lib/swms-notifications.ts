import { createServiceClient } from '@/lib/supabase-service'
import { sendPushToUser } from '@/lib/push'
import { getTodaySydneyDateString } from '@/lib/today'

export async function notifySwmsAwaitingSignature(
  documentId: string,
  projectId: string,
  docType: 'swms' | 'jsa',
  preparedById: string,
) {
  const service = createServiceClient()

  const { data: project } = await service
    .from('projects')
    .select('name, site_id, client_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) return

  const [{ data: crewRows }, { data: siteSignIns }] = await Promise.all([
    service.from('project_members').select('user_id').eq('project_id', projectId),
    project.site_id
      ? service.from('site_sign_ins').select('user_id').eq('site_id', project.site_id).eq('sign_in_date', getTodaySydneyDateString())
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ])

  const recipientIds = new Set<string>()
  ;(crewRows ?? []).forEach(r => recipientIds.add(r.user_id as string))
  ;(siteSignIns ?? []).forEach(r => recipientIds.add(r.user_id as string))
  recipientIds.delete(preparedById)

  if (recipientIds.size === 0) return

  const label = docType === 'jsa' ? 'JSA' : 'SWMS'
  const url = `/dashboard/clients/${project.client_id}/projects/${projectId}/swms/${documentId}`

  await Promise.allSettled(
    Array.from(recipientIds).map(userId =>
      sendPushToUser(userId, {
        title: `New ${label} to sign — ${project.name}`,
        body: 'A new safety document needs your acknowledgment.',
        url,
        tag: `swms-awaiting:${documentId}`,
      })
    )
  )
}
