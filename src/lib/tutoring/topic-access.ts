import { createServiceClient } from '@/lib/supabase-service'

export async function getTopicAccess(
  topicId: string,
  userId: string
): Promise<{ isMember: boolean; isAdmin: boolean } | null> {
  const service = createServiceClient()
  const { data: topic } = await service
    .from('topics')
    .select('id, subject_id, subjects(org_id, created_by)')
    .eq('id', topicId)
    .maybeSingle()
  if (!topic) return null
  const subject = (topic.subjects as unknown as { org_id: string | null; created_by: string } | null)
  if (!subject) return null

  if (subject.org_id === null) {
    return subject.created_by === userId ? { isMember: true, isAdmin: true } : null
  }

  const { data: membership } = await service
    .from('organisation_members').select('role').eq('user_id', userId).eq('org_id', subject.org_id).maybeSingle()
  if (!membership) return null
  return { isMember: true, isAdmin: ['owner', 'admin'].includes(membership.role as string) }
}
