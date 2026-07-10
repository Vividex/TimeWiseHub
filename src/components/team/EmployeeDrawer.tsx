'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import ScrollFade from '@/components/ui/ScrollFade'

type Profile = { job_title: string | null; start_date: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null }
type Cert = { id: string; name: string; issued_date: string | null; expiry_date: string | null }
type OnboardingItem = { label: string; required: boolean }
type OnboardingProgress = { item_label: string; completed_at: string | null }
type Tab = 'profile' | 'certifications' | 'onboarding'

export default function EmployeeDrawer({ member, orgId, canManageTeam, canChangeRole, onClose }: {
  member: { user_id: string; display_name: string; role: string }; orgId: string
  canManageTeam: boolean; canChangeRole: boolean; onClose: () => void
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('profile')
  const [loading, setLoading] = useState(true)
  const [jobTitle, setJobTitle] = useState('')
  const [startDate, setStartDate] = useState('')
  const [emergencyName, setEmergencyName] = useState('')
  const [emergencyPhone, setEmergencyPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [memberRole, setMemberRole] = useState(member.role)
  const [savingRole, setSavingRole] = useState(false)
  const [roleSaved, setRoleSaved] = useState(false)
  const [certs, setCerts] = useState<Cert[]>([])
  const [newCertName, setNewCertName] = useState('')
  const [newCertExpiry, setNewCertExpiry] = useState('')
  const [addingCert, setAddingCert] = useState(false)
  const [onboardingItems, setOnboardingItems] = useState<OnboardingItem[]>([])
  const [onboardingProgress, setOnboardingProgress] = useState<OnboardingProgress[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [pRes, cRes, oRes] = await Promise.all([
        fetch(`/api/team/profile?user_id=${member.user_id}`),
        fetch(`/api/team/certifications?user_id=${member.user_id}`),
        fetch(`/api/team/onboarding?org_id=${orgId}&user_id=${member.user_id}`),
      ])
      const [p, c, o] = await Promise.all([pRes.json(), cRes.json(), oRes.json()])
      setJobTitle(p?.job_title ?? ''); setStartDate(p?.start_date ?? '')
      setEmergencyName(p?.emergency_contact_name ?? ''); setEmergencyPhone(p?.emergency_contact_phone ?? '')
      setCerts(c); setOnboardingItems(o.items ?? []); setOnboardingProgress(o.progress ?? [])
      setLoading(false)
    }
    load()
  }, [member.user_id, orgId])

  async function saveProfile() {
    setSavingProfile(true)
    await fetch('/api/team/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, job_title: jobTitle || null,
        start_date: startDate || null, emergency_contact_name: emergencyName || null, emergency_contact_phone: emergencyPhone || null }) })
    setSavingProfile(false); router.refresh()
  }

  async function saveRole(newRole: string) {
    setSavingRole(true)
    const res = await fetch('/api/team/role', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_user_id: member.user_id, org_id: orgId, new_role: newRole }),
    })
    setSavingRole(false)
    if (res.ok) {
      setMemberRole(newRole)
      setRoleSaved(true)
      setTimeout(() => setRoleSaved(false), 2500)
      router.refresh()
    }
  }

  async function addCert() {
    if (!newCertName) return
    setAddingCert(true)
    const res = await fetch('/api/team/certifications', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, name: newCertName, expiry_date: newCertExpiry || null }) })
    const newCert = await res.json()
    setCerts(prev => [...prev, newCert])
    setNewCertName(''); setNewCertExpiry(''); setAddingCert(false)
  }

  async function deleteCert(id: string) {
    await fetch('/api/team/certifications', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setCerts(prev => prev.filter(c => c.id !== id))
  }

  async function toggleOnboarding(label: string, done: boolean) {
    const res = await fetch('/api/team/onboarding', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: member.user_id, org_id: orgId, item_label: label, completed: !done }) })
    const updated = await res.json()
    setOnboardingProgress(prev => { const idx = prev.findIndex(p => p.item_label === label); if (idx >= 0) { const n = [...prev]; n[idx] = updated; return n } return [...prev, updated] })
  }

  const today = new Date().toISOString().split('T')[0]
  const TABS: { key: Tab; label: string }[] = [{ key: 'profile', label: 'Profile' }, { key: 'certifications', label: 'Certifications' }, { key: 'onboarding', label: 'Onboarding' }]

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col bg-white dark:bg-slate-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-6 py-4">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{member.display_name}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="flex border-b border-gray-100 dark:border-slate-800 px-6">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`mr-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-cyan-400 text-cyan-500' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>
      <ScrollFade wrapperClassName="flex-1" className="px-6 py-5" fadeFrom="from-white dark:from-slate-900">
        {loading && <p className="text-sm text-gray-400">Loading…</p>}
        {!loading && tab === 'profile' && (
          <div className="space-y-4">
            {(['Job title', 'job_title', jobTitle, setJobTitle, 'text', canManageTeam] as const).length > 0 && (
              <>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Job title</label>
                  <input value={jobTitle} onChange={e => setJobTitle(e.target.value)} disabled={!canManageTeam}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60" /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Start date</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} disabled={!canManageTeam}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60" /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Emergency contact name</label>
                  <input value={emergencyName} onChange={e => setEmergencyName(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
                <div><label className="mb-1 block text-xs font-medium text-gray-500">Emergency contact phone</label>
                  <input value={emergencyPhone} onChange={e => setEmergencyPhone(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" /></div>
                {canManageTeam && (
                  <button onClick={saveProfile} disabled={savingProfile}
                    className="w-full rounded-xl bg-cyan-500 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                    {savingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                )}
                {canChangeRole && (
                  <div className="border-t border-gray-100 dark:border-slate-800 pt-4">
                    <label className="mb-1 block text-xs font-medium text-gray-500">Role</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={memberRole}
                        onChange={e => saveRole(e.target.value)}
                        disabled={savingRole}
                        className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm disabled:opacity-60"
                      >
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="employee">Employee</option>
                      </select>
                      {roleSaved && <span className="text-xs font-semibold text-green-600 dark:text-green-400">Saved ✓</span>}
                      {savingRole && <span className="text-xs text-gray-400">Saving…</span>}
                    </div>
                    <p className="mt-1 text-xs text-gray-400">Admins can manage the team and roster. Managers can manage the roster. Employees have read-only access.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        {!loading && tab === 'certifications' && (
          <div className="space-y-3">
            {certs.length === 0 && <p className="text-sm text-gray-400">No certifications added yet.</p>}
            {certs.map(c => {
              const expired = c.expiry_date && c.expiry_date < today
              const expiringSoon = c.expiry_date && !expired && new Date(c.expiry_date).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000
              return (
                <div key={c.id} className="flex items-start justify-between rounded-xl border border-gray-100 dark:border-slate-800 p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">{c.name}</p>
                    {c.expiry_date && (
                      <p className={`text-xs mt-0.5 ${expired ? 'text-red-500' : expiringSoon ? 'text-amber-500' : 'text-gray-400'}`}>
                        Expires {c.expiry_date}{expired ? ' — EXPIRED' : expiringSoon ? ' — expiring soon' : ''}
                      </p>
                    )}
                  </div>
                  {canManageTeam && <button onClick={() => deleteCert(c.id)} className="text-gray-300 hover:text-red-400 ml-2 text-lg leading-none">×</button>}
                </div>
              )
            })}
            {canManageTeam && (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 p-3 space-y-2">
                <input value={newCertName} onChange={e => setNewCertName(e.target.value)} placeholder="Certification name"
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <input type="date" value={newCertExpiry} onChange={e => setNewCertExpiry(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
                <button onClick={addCert} disabled={addingCert || !newCertName}
                  className="w-full rounded-xl bg-cyan-500 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50">
                  {addingCert ? 'Adding…' : 'Add certification'}
                </button>
              </div>
            )}
          </div>
        )}
        {!loading && tab === 'onboarding' && (
          <div className="space-y-2">
            {onboardingItems.length === 0 && (
              <p className="text-sm text-gray-400">{canManageTeam ? 'No onboarding template set up yet.' : "Your manager hasn't set up an onboarding checklist yet."}</p>
            )}
            {onboardingItems.map((item, i) => {
              const done = !!onboardingProgress.find(p => p.item_label === item.label)?.completed_at
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 dark:border-slate-800 p-3">
                  <input type="checkbox" checked={done} onChange={() => canManageTeam && toggleOnboarding(item.label, done)}
                    disabled={!canManageTeam}
                    className="h-4 w-4 rounded accent-cyan-500 disabled:opacity-50" />
                  <span className={`text-sm ${done ? 'line-through text-gray-400' : 'text-gray-800 dark:text-white'}`}>
                    {item.label}{item.required && <span className="ml-1 text-xs text-red-400">*</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </ScrollFade>
    </div>
  )
}
