import { createClient } from '@/lib/supabase-server'
import { resolveSwmsCategoryLabel } from '@/lib/swms-category-label'
import { getTodaySydneyDateString } from '@/lib/today'
import type { UpcomingSwmsAck } from '@/components/dashboard/DashboardUpcoming'

/** Active projects' authored SWMS/JSA documents this user has access to (Project Crew or
 *  signed into the project's site today) and hasn't yet acknowledged. RLS on
 *  project_swms_documents already enforces the access check -- this just resolves which
 *  project IDs to look at and filters out already-acknowledged documents. */
export async function getSwmsAwaitingSignature(userId: string): Promise<UpcomingSwmsAck[]> {
  const supabase = await createClient()

  const [{ data: crewRows }, { data: signInRows }] = await Promise.all([
    supabase.from('project_members').select('project_id').eq('user_id', userId),
    supabase.from('site_sign_ins').select('site_id').eq('user_id', userId).eq('sign_in_date', getTodaySydneyDateString()),
  ])

  const crewProjectIds = (crewRows ?? []).map(r => r.project_id as string)
  const signedInSiteIds = (signInRows ?? []).map(r => r.site_id as string)

  let siteProjectIds: string[] = []
  if (signedInSiteIds.length > 0) {
    const { data: siteProjects } = await supabase
      .from('projects').select('id').in('site_id', signedInSiteIds).eq('status', 'active')
    siteProjectIds = (siteProjects ?? []).map(p => p.id as string)
  }

  const accessibleProjectIds = Array.from(new Set([...crewProjectIds, ...siteProjectIds]))
  if (accessibleProjectIds.length === 0) return []

  const { data: docs } = await supabase
    .from('project_swms_documents')
    .select('id, category, doc_type, project_id, projects(name, client_id, status)')
    .in('project_id', accessibleProjectIds)
    .eq('source', 'authored')

  type DocRow = {
    id: string
    category: string | null
    doc_type: 'swms' | 'jsa'
    project_id: string
    projects: { name: string; client_id: string; status: string } | null
  }
  const activeDocs = ((docs ?? []) as unknown as DocRow[]).filter(d => d.projects?.status === 'active' && d.category)
  if (activeDocs.length === 0) return []

  const docIds = activeDocs.map(d => d.id)
  const { data: myAcks } = await supabase
    .from('project_swms_acknowledgments')
    .select('swms_document_id')
    .eq('user_id', userId)
    .in('swms_document_id', docIds)
  const ackedIds = new Set((myAcks ?? []).map(a => a.swms_document_id as string))

  return activeDocs
    .filter(d => !ackedIds.has(d.id))
    .map(d => {
      const categoryLabel = resolveSwmsCategoryLabel(d.category, d.doc_type) ?? ''
      return {
        id: d.id,
        projectId: d.project_id,
        clientId: d.projects?.client_id ?? '',
        projectName: d.projects?.name ?? 'Project',
        docType: d.doc_type,
        categoryLabel,
      }
    })
}
