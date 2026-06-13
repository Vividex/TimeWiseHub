'use client'

import { useState } from 'react'
import UserAvatar from '@/components/UserAvatar'
import type { AvatarConfig } from '@/lib/chat/types'

const HAIR_STYLES: { value: string; label: string }[] = [
  { value: 'shortCurly',         label: 'Short Curly' },
  { value: 'shortFlat',          label: 'Short Flat' },
  { value: 'shortRound',         label: 'Short Round' },
  { value: 'shortWaved',         label: 'Short Waved' },
  { value: 'shavedSides',        label: 'Shaved Sides' },
  { value: 'sides',              label: 'Sides' },
  { value: 'straight01',         label: 'Straight' },
  { value: 'straight02',         label: 'Straight Alt' },
  { value: 'longButNotTooLong',  label: 'Long' },
  { value: 'miaWallace',        label: 'Mia Wallace' },
  { value: 'curly',              label: 'Curly' },
  { value: 'curvy',              label: 'Curvy' },
  { value: 'fro',                label: 'Afro' },
  { value: 'froBand',            label: 'Afro Band' },
  { value: 'dreads',             label: 'Dreads' },
  { value: 'frida',              label: 'Frida' },
  { value: 'bun',                label: 'Bun' },
  { value: 'bob',                label: 'Bob' },
  { value: 'winterHat1',         label: 'Beanie' },
  { value: 'winterHat02',        label: 'Pompom Hat' },
  { value: 'winterHat03',        label: 'Striped Hat' },
  { value: 'winterHat04',        label: 'Knit Hat' },
]

const HAIR_COLOURS: { value: string; hex: string; label: string }[] = [
  { value: 'black',        hex: '#2c1b18', label: 'Black' },
  { value: 'brown',        hex: '#724133', label: 'Brown' },
  { value: 'brownDark',    hex: '#4a312c', label: 'Dark Brown' },
  { value: 'auburn',       hex: '#a55728', label: 'Auburn' },
  { value: 'blonde',       hex: '#b58143', label: 'Blonde' },
  { value: 'blondeGolden', hex: '#d6b370', label: 'Golden Blonde' },
  { value: 'red',          hex: '#c93305', label: 'Red' },
  { value: 'pastelPink',   hex: '#f59797', label: 'Pink' },
  { value: 'platinum',     hex: '#ecdcbf', label: 'Platinum' },
  { value: 'silverGray',   hex: '#e8e1e1', label: 'Silver' },
]

const SKIN_TONES: { value: string; hex: string; label: string }[] = [
  { value: 'pale',      hex: '#ffdbb4', label: 'Pale' },
  { value: 'light',     hex: '#edb98a', label: 'Light' },
  { value: 'tanned',    hex: '#d08b5b', label: 'Tanned' },
  { value: 'yellow',    hex: '#f8d25c', label: 'Yellow' },
  { value: 'brown',     hex: '#ae5d29', label: 'Brown' },
  { value: 'darkBrown', hex: '#614335', label: 'Dark Brown' },
  { value: 'black',     hex: '#3c1a07', label: 'Deep' },
]

const ACCESSORIES: { value: string; label: string }[] = [
  { value: 'blank',          label: 'None' },
  { value: 'round',          label: 'Round' },
  { value: 'prescription01', label: 'Classic' },
  { value: 'prescription02', label: 'Rimless' },
  { value: 'kurt',           label: 'Square' },
  { value: 'sunglasses',     label: 'Sunglasses' },
  { value: 'wayfarers',      label: 'Wayfarers' },
]

const FACIAL_HAIR: { value: string; label: string }[] = [
  { value: 'blank',           label: 'None' },
  { value: 'beardLight',      label: 'Stubble' },
  { value: 'beardMedium',     label: 'Short Beard' },
  { value: 'beardMagestic',   label: 'Full Beard' },
  { value: 'moustacheFancy',  label: 'Moustache' },
  { value: 'moustacheMagnum', label: 'Thick Moustache' },
]

const DEFAULT_CONFIG: AvatarConfig = {
  top: 'shortCurly',
  hairColor: 'brown',
  skin: 'light',
  accessories: 'blank',
  facialHair: 'blank',
}

function SwatchRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; hex?: string; label: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.value)}
            className={`rounded-lg border-2 transition-all ${
              value === opt.value
                ? 'border-cyan-500 scale-110'
                : 'border-transparent hover:border-gray-300 dark:hover:border-slate-600'
            }`}
          >
            {opt.hex ? (
              <span
                className="block h-7 w-7 rounded-md"
                style={{ background: opt.hex }}
              />
            ) : (
              <span className="block rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                {opt.label}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AvatarBuilder({
  initial,
  displayName,
  onSave,
  saving,
}: {
  initial: AvatarConfig | null
  displayName: string
  onSave: (config: AvatarConfig) => void
  saving: boolean
}) {
  const [config, setConfig] = useState<AvatarConfig>(initial ?? DEFAULT_CONFIG)

  function set(key: keyof AvatarConfig) {
    return (value: string) => setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div className="flex justify-center py-2">
        <UserAvatar avatarConfig={config} name={displayName} size={96} />
      </div>

      <SwatchRow label="Hair Style" options={HAIR_STYLES} value={config.top} onChange={set('top')} />
      <SwatchRow label="Hair Colour" options={HAIR_COLOURS} value={config.hairColor} onChange={set('hairColor')} />
      <SwatchRow label="Skin Tone" options={SKIN_TONES} value={config.skin} onChange={set('skin')} />
      <SwatchRow label="Accessories" options={ACCESSORIES} value={config.accessories} onChange={set('accessories')} />
      <SwatchRow label="Facial Hair" options={FACIAL_HAIR} value={config.facialHair} onChange={set('facialHair')} />

      <button
        type="button"
        disabled={saving}
        onClick={() => onSave(config)}
        className="w-full rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save avatar'}
      </button>
    </div>
  )
}
