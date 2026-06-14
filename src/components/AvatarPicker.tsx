'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import UserAvatar from '@/components/UserAvatar'

export default function AvatarPicker({
  userId,
  initialAvatarUrl,
  displayName,
}: {
  userId: string
  initialAvatarUrl: string | null
  displayName: string
}) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true)
    setSaved(false)
    setError(null)

    const supabase = createClient()
    const ext = file.name.split('.').pop() ?? 'jpg'
    const path = `${userId}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })

    if (uploadErr) { setError(uploadErr.message); setSaving(false); return }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const bustedUrl = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl })
      .eq('id', userId)

    if (updateErr) { setError(updateErr.message) } else {
      setAvatarUrl(bustedUrl)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const currentName = displayName || 'Me'

  return (
    <div className="mt-4 space-y-4">
      <div className="flex items-center gap-4">
        <UserAvatar avatarUrl={avatarUrl} name={currentName} size={64} />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {avatarUrl ? 'Photo' : 'Default (initials)'}
          </p>
          {saved && <p className="text-xs font-semibold text-cyan-500">Saved!</p>}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-500 dark:text-slate-400">
          Upload a JPG, PNG, or WebP image. Max 2 MB.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleUpload}
        />
        <button
          type="button"
          disabled={saving}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border border-gray-200 dark:border-slate-700 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? 'Uploading…' : 'Choose photo'}
        </button>
      </div>
    </div>
  )
}
