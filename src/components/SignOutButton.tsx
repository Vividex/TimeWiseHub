'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleSignOut}
      className="text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
    >
      Sign out
    </button>
  )
}
