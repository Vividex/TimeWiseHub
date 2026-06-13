'use client'

export type ExpiringCert = {
  user_name: string; cert_name: string; expiry_date: string; days_until: number
}

export default function CertExpiryPanel({ expiring }: { expiring: ExpiringCert[] }) {
  if (expiring.length === 0) return null
  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        {expiring.length} certification{expiring.length > 1 ? 's' : ''} expiring in the next 30 days
      </p>
      <ul className="mt-2 space-y-1">
        {expiring.map((c, i) => (
          <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
            {c.user_name} — {c.cert_name} ({c.days_until === 0 ? 'today' : `${c.days_until}d`})
          </li>
        ))}
      </ul>
    </div>
  )
}
