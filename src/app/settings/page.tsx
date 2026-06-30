import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import AccountSettingsForm from '@/components/AccountSettingsForm'
import OrgBillingSettingsForm from '@/components/OrgBillingSettingsForm'
import ThemeSelector from '@/components/ThemeSelector'
import InviteMember from '@/components/InviteMember'
import { effectivePlan, getSubscription, isTeamPlan } from '@/lib/subscription'
import NicknameForm from '@/components/NicknameForm'
import AvatarPicker from '@/components/AvatarPicker'
import PushPermission from '@/components/PushPermission'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: membership }, subscription] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, timezone, au_state, notification_preferences, invoice_letterhead, logo_url, invoice_payment_details, username, nickname, avatar_url')
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
        .select('name, time_rounding_minutes, pay_cadence, super_rate, pay_week_start_day, invoice_letterhead, logo_url, invoice_payment_details')
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
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-600 hover:text-cyan-700 mb-4"
          >
            ← Back to Dashboard
          </Link>
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

        {/* Profile Photo */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Profile photo</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Upload a photo — shown in chat and across the app.
          </p>
          <AvatarPicker
            userId={profile?.id ?? user.id}
            initialAvatarUrl={profile?.avatar_url ?? null}
            displayName={profile?.nickname ?? profile?.username ?? ''}
          />
        </div>

        {/* Profile */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Profile</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Your username is your unique handle. Your nickname is what others see in chat and tasks.
          </p>
          <NicknameForm
            username={profile?.username ?? ''}
            initialNickname={profile?.nickname ?? ''}
          />
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

        {/* Push notifications */}
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100">Push notifications</h2>
          <p className="mt-1 text-sm font-semibold text-gray-500 dark:text-slate-400">
            Receive browser notifications even when TimeWiseHub is in the background.
          </p>
          <div className="mt-4">
            <PushPermission />
          </div>
        </div>

        <AccountSettingsForm
          email={user.email ?? ''}
          userId={user.id}
          initialFullName={profile?.full_name ?? ''}
          initialTimezone={profile?.timezone ?? 'UTC'}
          initialAuState={profile?.au_state ?? ''}
          initialInvoiceLetterhead={profile?.invoice_letterhead ?? ''}
          initialLogoUrl={profile?.logo_url ?? null}
          initialInvoicePaymentDetails={profile?.invoice_payment_details ?? {}}
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
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {isTeamPlan(subscription) ? (
              <InviteMember orgId={membership.org_id} canInvite={true} />
            ) : (
              <div>
                <h3 className="mb-1 text-xl font-bold text-gray-900 dark:text-slate-100">Invite a team member</h3>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Inviting team members is a Business plan feature. Pro is a single-user plan.
                </p>
                <Link
                  href="/dashboard/billing"
                  className="inline-flex rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-600 transition-colors"
                >
                  Upgrade to Business
                </Link>
              </div>
            )}
          </div>
        )}

        {isOrgAdmin && membership?.org_id && (
          <OrgBillingSettingsForm
            orgId={membership.org_id}
            initialRoundingMinutes={organisation?.time_rounding_minutes ?? 0}
            initialPayCadence={organisation?.pay_cadence ?? 'fortnightly'}
            initialSuperRate={organisation?.super_rate ?? 12}
            initialPayWeekStartDay={organisation?.pay_week_start_day ?? 1}
            initialOrgName={organisation?.name ?? ''}
            initialInvoiceLetterhead={organisation?.invoice_letterhead ?? ''}
            initialLogoUrl={organisation?.logo_url ?? null}
            initialInvoicePaymentDetails={organisation?.invoice_payment_details ?? {}}
            canEditInvoiceLetterhead={plan === 'team'}
            initialMembers={(members ?? []) as unknown as Parameters<typeof OrgBillingSettingsForm>[0]['initialMembers']}
          />
        )}
      </div>
    </div>
  )
}
