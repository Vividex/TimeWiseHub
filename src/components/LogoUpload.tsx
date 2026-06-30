'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  currentLogoUrl: string | null
  storagePath: string
  targetTable: 'profiles' | 'organisations'
  targetId: string
}

export default function LogoUpload({ currentLogoUrl, storagePath, targetTable, targetId }: Props) {
  const [logoUrl, setLogoUrl] = useState<string | null>(currentLogoUrl)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function flattenToJpeg(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const objectUrl = URL.createObjectURL(file)
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')!
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0)
        URL.revokeObjectURL(objectUrl)
        canvas.toBlob(blob => {
          if (blob) resolve(blob)
          else reject(new Error('Canvas export failed'))
        }, 'image/jpeg', 0.92)
      }
      img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image load failed')) }
      img.src = objectUrl
    })
  }

  async function handleFile(file: File) {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setError('Only PNG or JPEG files are supported.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('File must be under 2 MB.')
      return
    }
    setError(null)
    setUploading(true)

    let blob: Blob
    try {
      blob = await flattenToJpeg(file)
    } catch {
      setError('Could not process image.')
      setUploading(false)
      return
    }

    const supabase = createClient()
    const { error: uploadError } = await supabase.storage
      .from('logos')
      .upload(storagePath, blob, { upsert: true, contentType: 'image/jpeg' })
    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = supabase.storage.from('logos').getPublicUrl(storagePath)
    const urlWithBuster = `${publicUrl}?t=${Date.now()}`
    const { error: dbError } = await supabase
      .from(targetTable)
      .update({ logo_url: urlWithBuster })
      .eq('id', targetId)
    if (dbError) {
      setError(dbError.message)
      setUploading(false)
      return
    }
    setLogoUrl(urlWithBuster)
    setUploading(false)
  }

  async function handleRemove() {
    setError(null)
    setUploading(true)
    const supabase = createClient()
    await supabase.storage.from('logos').remove([storagePath])
    const { error: dbError } = await supabase
      .from(targetTable)
      .update({ logo_url: null })
      .eq('id', targetId)
    if (dbError) {
      setError(dbError.message)
      setUploading(false)
      return
    }
    setLogoUrl(null)
    setUploading(false)
  }

  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-gray-900">Company logo</p>
      <p className="mb-3 text-xs font-medium text-gray-500">
        Shown on invoices, PDF, and email. PNG or JPEG, max 2 MB. Transparent backgrounds are flattened to white.
      </p>
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white">
          {logoUrl
            ? <img src={logoUrl} alt="Company logo" className="h-full w-full object-contain" />
            : <span className="text-xs text-gray-400">No logo</span>
          }
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Upload logo'}
          </button>
          {logoUrl && (
            <button
              type="button"
              disabled={uploading}
              onClick={handleRemove}
              className="rounded-xl border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}
