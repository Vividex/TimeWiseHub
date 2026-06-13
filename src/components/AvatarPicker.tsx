'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import AvatarBuilder from '@/components/AvatarBuilder'
import UserAvatar from '@/components/UserAvatar'
import type { AvatarConfig } from '@/lib/chat/types'

type Tab = 'build' | 'upload'

export default function AvatarPicker({
  userId,
  initialAvatarUrl,
  initialAvatarConfig,
  displayName,
}: {
  userId: string
  initialAvatarUrl: string | null
  initialAvatarConfig: AvatarConfig | null
  displayName: string
}) {
  const [tab, setTab] = useState<Tab>(initialAvatarConfig && !initialAvatarUrl ? 'build' : 'upload')
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl)
  const [avatarConfig, setAvatarConfig] = useState(initialAvatarConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function saveConfig(config: AvatarConfig) {
    setSaving(true)
    setSaved(false)
    setError(null)
    const supabase = createClient()
    const { error: err } = await supabase
      .from('profiles')
      .update({ avatar_config: config, avatar_url: null })
      .eq('id', userId)
    if (err) { setError(err.message) } else {
      setAvatarConfig(config)
      setAvatarUrl(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

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
    // Append timestamp to bust CDN cache
    const bustedUrl = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ avatar_url: bustedUrl, avatar_config: null })
      .eq('id', userId)

    if (updateErr) { setError(updateErr.message) } else {
      setAvatarUrl(bustedUrl)
      setAvatarConfig(null)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    setSaving(false)
  }

  const currentName = displayName || 'Me'

  return (
    <div className="mt-4 space-y-4">
      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <UserAvatar avatarUrl={avatarUrl} avatarConfig={avatarConfig} name={currentName} size={64} />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {avatarUrl ? 'Photo' : avatarConfig ? 'Custom avatar' : 'Default (initials)'}
          </p>
          {saved && <p className="text-xs font-semibold text-cyan-500">Saved!</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-gray-200 dark:border-slate-700 p-1">
        {(['build', 'upload'] as Tab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors ${
              tab === t
                ? 'bg-cyan-500 text-white'
                : 'text-gray-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
            }`}
          >
            {t === 'build' ? 'Build avatar' : 'Upload photo'}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

      {tab === 'build' && (
        <AvatarBuilder
          initial={avatarConfig}
          displayName={currentName}
          onSave={saveConfig}
          saving={saving}
        />
      )}

      {tab === 'upload' && (
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
            {saving ? 'Uploading…' : 'Choose file'}
          </button>
        </div>
      )}
    </div>
  )
}
