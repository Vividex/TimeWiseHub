'use client'
import { useState } from 'react'
import EmployeeDrawer from './EmployeeDrawer'
import CertExpiryPanel, { type ExpiringCert } from './CertExpiryPanel'

export type TeamMember = {
  user_id: string; display_name: string; job_title: string | null
  has_incomplete_onboarding: boolean; has_expiring_cert: boolean; has_expired_cert: boolean
}

export default function TeamGrid({ orgId, isManager, members, expiring }: {
  orgId: string; isManager: boolean; members: TeamMember[]; expiring: ExpiringCert[]
}) {
  const [selected, setSelected] = useState<TeamMember | null>(null)
  return (
    <div>
      {isManager && <CertExpiryPanel expiring={expiring} />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {members.map(m => (
          <button key={m.user_id} onClick={() => setSelected(m)}
            className="relative rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-left shadow-sm hover:shadow-md transition-shadow">
            {isManager && (m.has_expired_cert || m.has_expiring_cert || m.has_incomplete_onboarding) && (
              <span className={`absolute top-3 right-3 h-2.5 w-2.5 rounded-full ${m.has_expired_cert ? 'bg-red-500' : 'bg-amber-400'}`} />
            )}
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-sm mb-3">
              {m.display_name.charAt(0).toUpperCase()}
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{m.display_name}</p>
            {m.job_title && <p className="text-xs text-gray-500 mt-0.5">{m.job_title}</p>}
          </button>
        ))}
      </div>
      {selected && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setSelected(null)} />
          <EmployeeDrawer member={selected} orgId={orgId} isManager={isManager} onClose={() => setSelected(null)} />
        </>
      )}
    </div>
  )
}
