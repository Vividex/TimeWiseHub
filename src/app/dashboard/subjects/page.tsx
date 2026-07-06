import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { YEAR_GROUPS } from '@/lib/tutoring/constants'
import FolderTile from '@/components/topics/FolderTile'

export default async function SubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {YEAR_GROUPS.map(yg => (
        <FolderTile key={yg} href={`/dashboard/subjects/${encodeURIComponent(yg)}`} label={yg} />
      ))}
    </div>
  )
}
