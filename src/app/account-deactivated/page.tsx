import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import ReactivateAccountButton from '@/components/account/ReactivateAccountButton'
import SignOutButton from '@/components/SignOutButton'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function AccountDeactivatedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organisation_members').select('org_id, role').eq('user_id', user.id).maybeSingle()

  let deactivatedAt: string | null = null
  let isOwner = false

  if (membership?.org_id) {
    const { data: org } = await supabase
      .from('organisations').select('deactivated_at').eq('id', membership.org_id).maybeSingle()
    deactivatedAt = org?.deactivated_at ?? null
    isOwner = membership.role === 'owner'
  } else {
    const { data: profile } = await supabase
      .from('profiles').select('deactivated_at').eq('id', user.id).maybeSingle()
    deactivatedAt = profile?.deactivated_at ?? null
    isOwner = true
  }

  if (!deactivatedAt) redirect('/dashboard')

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-900 dark:text-slate-100">Account deactivated</h1>
        <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">
          Deactivated on {fmtDate(deactivatedAt)}. No data was deleted.
        </p>

        <div className="mt-6">
          {isOwner ? (
            <ReactivateAccountButton />
          ) : (
            <p className="text-sm font-semibold text-gray-600 dark:text-slate-300">
              Contact the account owner to reactivate this account.
            </p>
          )}
        </div>

        <div className="mt-6">
          <SignOutButton />
        </div>
      </div>
    </div>
  )
}
