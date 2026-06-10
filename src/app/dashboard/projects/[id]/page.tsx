import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'

export default async function LegacyProjectRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase.from('projects').select('client_id').eq('id', id).maybeSingle()
  if (!project?.client_id) notFound()
  redirect(`/dashboard/clients/${project.client_id}/projects/${id}`)
}
