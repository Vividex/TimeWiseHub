import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AccountSettingsForm from '@/components/AccountSettingsForm'
import OrgBillingSettingsForm from '@/components/OrgBillingSettingsForm'
import ThemeSelector from '@/components/ThemeSelector'
import { effectivePlan, getSubscription } from '@/lib/subscription'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: membership }, subscription] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, timezone, au_state, notification_preferences, invoice_letterhead')
      .eq('id', user.id)
      .single(),
    supabase
      .from('organisation_members')
      .select('role, org_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    getSubscription(user.id),
  ])

  const isOrgAdmin = ['owner', 'admin'].includes(membership?.role ?? '')
  const plan = effectivePlan(subscription)
  const [{ data: organisation }, { data: members }] = isOrgAdmin && membership?.org_id
    ? await Promise.all([
      supabase
        .from('organisations')
        .select('name, time_rounding_minutes, pay_cadence, super_rate, invoice_letterhead')
        .eq('id', membership.org_id)
        .single(),
      supabase
        .from('organisation_members')
        .select('id, role, hourly_rate, profiles!organisation_members_user_id_fkey(email, full_name)')
        .eq('org_id', membership.org_id)
        .order('role', { ascending: true }),
    ])
    : [{ data: null }, { data: null }]

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:px-8 dark:bg-slate-950">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm font-bold uppercase tracking-wide text-cyan-600">TimeWiseHub</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-gray-900 dark:text-slate-100">Account settings</h1>
          <p className="mt-2 text-sm font-semibold text-gray-500 dark:text-slate-400">{user.email}</p>
        </div>

        {/* Theme */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Appearance</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">Choose your preferred colour scheme.</p>
          <div className="mt-4">
            <ThemeSelector />
          </div>
        </div>

        {/* Reports & data export */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Reports &amp; data export</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">Download time logs, expense reports, and leave summaries as formatted CSV files — ready for payroll or your accountant.</p>
          <a href="/dashboard/reports"
            className="mt-4 inline-flex rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-700">
            Go to Reports
          </a>
        </div>

        {/* GDPR raw data export */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Download all my data</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">Export a complete copy of your account data in JSON format (GDPR right of access).</p>
          <a href="/api/export" download
            className="mt-4 inline-flex rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50">
            Download raw data (JSON)
          </a>
        </div>

        <AccountSettingsForm
          email={user.email ?? ''}
          initialFullName={profile?.full_name ?? ''}
          initialTimezone={profile?.timezone ?? 'UTC'}
          initialAuState={profile?.au_state ?? ''}
          initialInvoiceLetterhead={profile?.invoice_letterhead ?? ''}
          canEditInvoiceLetterhead={plan === 'pro'}
          initialNotifications={profile?.notification_preferences ?? {
            deadline_alerts: true,
            priority_nudges: true,
            daily_digest: true,
            scheduled_reports: true,
            idle_alerts: true,
          }}
        />

        {isOrgAdmin && membership?.org_id && (
          <OrgBillingSettingsForm
            orgId={membership.org_id}
            initialRoundingMinutes={organisation?.time_rounding_minutes ?? 0}
            initialPayCadence={organisation?.pay_cadence ?? 'fortnightly'}
            initialSuperRate={organisation?.super_rate ?? 12}
            initialOrgName={organisation?.name ?? ''}
            initialInvoiceLetterhead={organisation?.invoice_letterhead ?? ''}
            canEditInvoiceLetterhead={plan === 'team'}
            initialMembers={(members ?? []) as unknown as Parameters<typeof OrgBillingSettingsForm>[0]['initialMembers']}
          />
        )}
      </div>
    </div>
  )
}
