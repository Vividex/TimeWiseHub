import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { createProgramAssetSignedUrl } from '@/lib/program-storage'
import SessionDetailClient from '@/components/clients/SessionDetailClient'
import type { SessionSeriesInfo } from '@/lib/sessions/series'
import type { LinkedProgramBundle, Program, ProgramAsset } from '@/types/programs'

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>
}) {
  const { id, sessionId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: session }, { data: client }] = await Promise.all([
    supabase
      .from('sessions')
      .select('id, title, scheduled_at, duration_minutes, notes, status, org_id, program_id, series_id, session_todos(id, title, completed, position)')
      .eq('id', sessionId)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('id, name')
      .eq('id', id)
      .maybeSingle(),
  ])

  if (!session || !client) notFound()

  const todos = (session.session_todos as { id: string; title: string; completed: boolean; position: number }[])
    .slice()
    .sort((a, b) => a.position - b.position)

  let linkedProgram: LinkedProgramBundle | null = null

  if (session.program_id) {
    const service = createServiceClient()
    const { data: program } = await service
      .from('programs').select('*').eq('id', session.program_id).maybeSingle()

    if (program) {
      const { data: membership } = await service
        .from('organisation_members').select('role')
        .eq('user_id', user.id).eq('org_id', program.org_id ?? '').maybeSingle()
      const isOwner = program.owner_id === user.id
      const isMember = !!membership

      if (isOwner || isMember) {
        const [{ data: categories }, { data: assets }] = await Promise.all([
          service.from('program_categories').select('*')
            .eq('program_id', program.id).order('sort_order').order('created_at'),
          service.from('program_assets').select('*')
            .eq('program_id', program.id).order('sort_order').order('created_at'),
        ])

        const assetsWithUrls: ProgramAsset[] = await Promise.all(
          (assets ?? []).map(async asset => {
            if (asset.storage_path) {
              const signed_url = await createProgramAssetSignedUrl(asset.storage_path)
              return { ...asset, signed_url }
            }
            return { ...asset, signed_url: null }
          }),
        )

        linkedProgram = {
          program: program as Program,
          categories: categories ?? [],
          assets: assetsWithUrls,
        }
      }
    }
  }

  let series: SessionSeriesInfo | null = null
  if (session.series_id) {
    const { data: seriesRow } = await supabase
      .from('session_series')
      .select('id, recurrence_interval, is_active')
      .eq('id', session.series_id)
      .maybeSingle()
    series = seriesRow as SessionSeriesInfo | null
  }

  return (
    <SessionDetailClient
      session={{
        id: session.id,
        title: session.title,
        scheduledAt: session.scheduled_at,
        durationMinutes: session.duration_minutes,
        notes: session.notes ?? '',
        status: session.status as 'scheduled' | 'in_progress' | 'completed',
      }}
      todos={todos}
      clientId={id}
      clientName={client.name}
      orgId={session.org_id}
      linkedProgram={linkedProgram}
      series={series}
    />
  )
}
