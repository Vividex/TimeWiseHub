import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SwmsBuilderForm from '@/components/projects/SwmsBuilderForm'
import type { CrewMemberOption } from '@/types/project-crew'

export default async function NewSwmsPage({
  params,
}: {
  params: Promise<{ id: string; projectId: string }>
}) {
  const { id, projectId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase.from('projects').select('id, name, org_id').eq('id', projectId).single()
  if (!project) notFound()

  const [{ data: crewRows }, { data: membership }] = await Promise.all([
    supabase.from('project_members').select('user_id').eq('project_id', projectId),
    supabase.from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle(),
  ])

  const orgId = membership?.org_id ?? project.org_id
  const crewUserIds = (crewRows ?? []).map(r => r.user_id as string)

  let crew: CrewMemberOption[] = []
  let crewCertLicenceClasses: { userId: string; licenceClass: string }[] = []

  if (orgId && crewUserIds.length > 0) {
    const [{ data: orgMembers }, { data: certs }] = await Promise.all([
      supabase.from('organisation_members').select('user_id, profiles!organisation_members_user_id_fkey(full_name, email)').eq('org_id', orgId).in('user_id', crewUserIds),
      supabase.from('certifications').select('user_id, licence_class').eq('org_id', orgId).not('licence_class', 'is', null),
    ])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    crew = ((orgMembers ?? []) as any[]).map((m: any) => ({
      userId: m.user_id as string,
      displayName: (m.profiles?.full_name || m.profiles?.email || m.user_id) as string,
    }))
    crewCertLicenceClasses = (certs ?? []).map(c => ({ userId: c.user_id as string, licenceClass: c.licence_class as string }))
  }

  return (
    <SwmsBuilderForm
      clientId={id}
      projectId={projectId}
      projectName={project.name}
      crew={crew}
      crewCertLicenceClasses={crewCertLicenceClasses}
      currentUserDisplayName={user.email ?? 'You'}
    />
  )
}
