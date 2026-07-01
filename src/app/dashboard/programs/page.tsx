import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import ProgramsDashboardClient from '@/components/programs/ProgramsDashboardClient'
import type { Program } from '@/types/programs'

export default async function ProgramsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: membership } = await service
    .from('organisation_members').select('org_id')
    .eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const baseQuery = (isTemplate: boolean) =>
    orgId
      ? service.from('programs').select('*')
          .or(`owner_id.eq.${user.id},org_id.eq.${orgId}`)
          .eq('is_archived', false).eq('is_template', isTemplate)
          .order('created_at', { ascending: false })
      : service.from('programs').select('*')
          .eq('owner_id', user.id).eq('is_archived', false).eq('is_template', isTemplate)
          .order('created_at', { ascending: false })

  const [{ data: programs }, { data: templates }] = await Promise.all([
    baseQuery(false),
    baseQuery(true),
  ])

  return (
    <ProgramsDashboardClient
      programs={(programs ?? []) as Program[]}
      templates={(templates ?? []) as Program[]}
      orgId={orgId}
    />
  )
}
