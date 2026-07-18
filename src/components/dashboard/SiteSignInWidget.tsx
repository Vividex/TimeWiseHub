'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { getTodaySydneyDateString } from '@/lib/today'

export type SignInSite = {
  id: string
  address: string
  clientName: string
  signedInToday: boolean
}

export default function SiteSignInWidget({ sites, userId }: { sites: SignInSite[]; userId: string }) {
  const router = useRouter()
  const [signingInId, setSigningInId] = useState<string | null>(null)
  const [signedIn, setSignedIn] = useState<Set<string>>(new Set(sites.filter(s => s.signedInToday).map(s => s.id)))
  const [showAll, setShowAll] = useState(false)

  if (sites.length === 0) return null

  async function handleSignIn(siteId: string) {
    setSigningInId(siteId)
    const supabase = createClient()
    const { error } = await supabase.from('site_sign_ins').insert({
      site_id: siteId,
      user_id: userId,
      sign_in_date: getTodaySydneyDateString(),
    })
    setSigningInId(null)
    // 23505 = unique_violation -- already signed in today, treat as success
    if (!error || error.code === '23505') {
      setSignedIn(prev => new Set(prev).add(siteId))
      router.refresh()
    }
  }

  const visible = showAll ? sites : sites.slice(0, 3)
  const remaining = sites.length - visible.length

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-500">Site sign-in</h2>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {visible.map((site, i) => {
          const isSignedIn = signedIn.has(site.id)
          return (
            <div
              key={site.id}
              className={`flex items-center gap-4 px-5 py-4 ${i < visible.length - 1 ? 'border-b border-gray-100 dark:border-slate-800' : ''}`}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-400">
                <MapPin size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{site.address}</p>
                <p className="truncate text-xs text-gray-500 dark:text-slate-500">{site.clientName}</p>
              </div>
              {isSignedIn ? (
                <span className="shrink-0 text-xs font-bold text-green-600 dark:text-green-400">✓ Signed in</span>
              ) : (
                <button
                  onClick={() => handleSignIn(site.id)}
                  disabled={signingInId === site.id}
                  className="shrink-0 rounded-lg bg-gradient-to-b from-cyan-500 to-cyan-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm shadow-cyan-500/25 transition-all hover:from-cyan-600 hover:to-cyan-700 active:scale-[0.95] disabled:opacity-50"
                >
                  {signingInId === site.id ? 'Signing in…' : 'Sign In'}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {!showAll && remaining > 0 && (
        <button onClick={() => setShowAll(true)} className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400">
          Show {remaining} more site{remaining === 1 ? '' : 's'}
        </button>
      )}
    </div>
  )
}
