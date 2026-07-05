import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import StudentForm from '@/components/students/StudentForm'
import EditStudentButton from '@/components/students/EditStudentButton'
import DeleteStudentButton from '@/components/students/DeleteStudentButton'

export default async function ClientStudentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('role').eq('user_id', user.id).maybeSingle()
  const isAdmin = ['owner', 'admin'].includes(membership?.role ?? '')

  const { data: client } = await supabase.from('clients').select('id, name, owner_id').eq('id', id).maybeSingle()
  if (!client) notFound()
  const canEdit = isAdmin || client.owner_id === user.id

  const { data: students } = await supabase
    .from('students')
    .select('id, name, subjects, notes')
    .eq('client_id', id)
    .eq('archived', false)
    .order('name')

  return (
    <div className="px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Link href={`/dashboard/clients/${id}`} className="text-sm font-semibold text-cyan-600 hover:underline">← {client.name}</Link>
        <h1 className="text-2xl font-black text-gray-900 dark:text-slate-100">Students</h1>

        {canEdit && <StudentForm clientId={id} />}

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {(students ?? []).length === 0 ? (
            <p className="p-6 text-sm text-gray-400 dark:text-slate-500">No students yet. Add your first.</p>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-slate-800">
              {(students ?? []).map(s => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">{s.name}</p>
                    {s.subjects.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {s.subjects.map((subj: string) => (
                          <span key={subj} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                            {subj}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-2">
                      <EditStudentButton student={s} />
                      <DeleteStudentButton studentId={s.id} studentName={s.name} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
