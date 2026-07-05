import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import SubjectsBrowser from '@/components/topics/SubjectsBrowser'

export default async function SubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id').eq('user_id', user.id).maybeSingle()
  const orgId = membership?.org_id ?? null

  const subjectsQuery = orgId
    ? supabase.from('subjects').select('id, name').eq('org_id', orgId).eq('archived', false).order('name')
    : supabase.from('subjects').select('id, name').is('org_id', null).eq('created_by', user.id).eq('archived', false).order('name')
  const { data: subjects } = await subjectsQuery

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Subjects</h1>
        <SubjectsBrowser subjects={subjects ?? []} />
      </div>
    </div>
  )
}
