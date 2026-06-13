'use client'

import { useState } from 'react'
import UserAvatar from '@/components/UserAvatar'
import type { AvatarConfig } from '@/lib/chat/types'

// Values from @dicebear/avataaars schema (verified via schema.properties)
const SHORT_HAIR: { value: string; label: string }[] = [
  { value: 'shortCurly',           label: 'Short Curly' },
  { value: 'shortFlat',            label: 'Short Flat' },
  { value: 'shortRound',           label: 'Short Round' },
  { value: 'shortWaved',           label: 'Short Waved' },
  { value: 'sides',                label: 'Sides' },
  { value: 'shavedSides',          label: 'Shaved Sides' },
  { value: 'theCaesar',            label: 'Caesar' },
  { value: 'theCaesarAndSidePart', label: 'Caesar + Part' },
  { value: 'dreads01',             label: 'Dreads Short' },
  { value: 'dreads02',             label: 'Dreads Alt' },
  { value: 'frizzle',              label: 'Frizzle' },
  { value: 'shaggy',               label: 'Shaggy' },
  { value: 'shaggyMullet',         label: 'Mullet' },
]

const LONG_HAIR: { value: string; label: string }[] = [
  { value: 'bigHair',           label: 'Big Hair' },
  { value: 'bob',               label: 'Bob' },
  { value: 'bun',               label: 'Bun' },
  { value: 'curly',             label: 'Curly' },
  { value: 'curvy',             label: 'Curvy' },
  { value: 'dreads',            label: 'Dreads' },
  { value: 'frida',             label: 'Frida' },
  { value: 'fro',               label: 'Afro' },
  { value: 'froBand',           label: 'Afro + Band' },
  { value: 'longButNotTooLong', label: 'Long' },
  { value: 'miaWallace',        label: 'Mia Wallace' },
  { value: 'straight01',        label: 'Straight' },
  { value: 'straight02',        label: 'Straight Alt' },
  { value: 'straightAndStrand', label: 'Straight + Strand' },
]

const HEADWEAR: { value: string; label: string }[] = [
  { value: 'hat',        label: 'Hat' },
  { value: 'hijab',      label: 'Hijab' },
  { value: 'turban',     label: 'Turban' },
  { value: 'winterHat1',  label: 'Beanie' },
  { value: 'winterHat02', label: 'Pompom' },
  { value: 'winterHat03', label: 'Striped Hat' },
  { value: 'winterHat04', label: 'Knit Hat' },
]

const HEADWEAR_VALUES = new Set(HEADWEAR.map(h => h.value))

// Hex values from @dicebear/avataaars schema defaults
const HAIR_COLOURS: { value: string; hex: string; label: string }[] = [
  { value: '2c1b18', hex: '#2c1b18', label: 'Black' },
  { value: '724133', hex: '#724133', label: 'Brown' },
  { value: '4a312c', hex: '#4a312c', label: 'Dark Brown' },
  { value: 'a55728', hex: '#a55728', label: 'Auburn' },
  { value: 'b58143', hex: '#b58143', label: 'Blonde' },
  { value: 'd6b370', hex: '#d6b370', label: 'Golden Blonde' },
  { value: 'c93305', hex: '#c93305', label: 'Red' },
  { value: 'f59797', hex: '#f59797', label: 'Pink' },
  { value: 'ecdcbf', hex: '#ecdcbf', label: 'Platinum' },
  { value: 'e8e1e1', hex: '#e8e1e1', label: 'Silver' },
]

// Hex values from @dicebear/avataaars hatColor schema defaults
const HAT_COLOURS: { value: string; hex: string; label: string }[] = [
  { value: '262e33', hex: '#262e33', label: 'Black' },
  { value: '3c4f5c', hex: '#3c4f5c', label: 'Dark Blue' },
  { value: '25557c', hex: '#25557c', label: 'Navy' },
  { value: '5199e4', hex: '#5199e4', label: 'Blue' },
  { value: '65c9ff', hex: '#65c9ff', label: 'Sky' },
  { value: 'b1e2ff', hex: '#b1e2ff', label: 'Light Blue' },
  { value: 'a7ffc4', hex: '#a7ffc4', label: 'Mint' },
  { value: 'ffdeb5', hex: '#ffdeb5', label: 'Peach' },
  { value: 'ffafb9', hex: '#ffafb9', label: 'Pink' },
  { value: 'ff488e', hex: '#ff488e', label: 'Hot Pink' },
  { value: 'ff5c5c', hex: '#ff5c5c', label: 'Red' },
  { value: 'ffffb1', hex: '#ffffb1', label: 'Yellow' },
  { value: 'e6e6e6', hex: '#e6e6e6', label: 'Light Grey' },
  { value: '929598', hex: '#929598', label: 'Grey' },
  { value: 'ffffff', hex: '#ffffff', label: 'White' },
]

// Hex values from @dicebear/avataaars schema defaults
const SKIN_TONES: { value: string; hex: string; label: string }[] = [
  { value: 'ffdbb4', hex: '#ffdbb4', label: 'Pale' },
  { value: 'edb98a', hex: '#edb98a', label: 'Light' },
  { value: 'fd9841', hex: '#fd9841', label: 'Peach' },
  { value: 'd08b5b', hex: '#d08b5b', label: 'Tanned' },
  { value: 'f8d25c', hex: '#f8d25c', label: 'Yellow' },
  { value: 'ae5d29', hex: '#ae5d29', label: 'Brown' },
  { value: '614335', hex: '#614335', label: 'Deep' },
]

// null = no accessories (accessoriesProbability: 0)
const ACCESSORIES: { value: string | null; label: string }[] = [
  { value: null,             label: 'None' },
  { value: 'round',          label: 'Round' },
  { value: 'prescription01', label: 'Classic' },
  { value: 'prescription02', label: 'Rimless' },
  { value: 'kurt',           label: 'Square' },
  { value: 'sunglasses',     label: 'Sunglasses' },
  { value: 'wayfarers',      label: 'Wayfarers' },
  { value: 'eyepatch',       label: 'Eyepatch' },
]

// null = no facial hair (facialHairProbability: 0)
const FACIAL_HAIR: { value: string | null; label: string }[] = [
  { value: null,               label: 'None' },
  { value: 'beardLight',       label: 'Stubble' },
  { value: 'beardMedium',      label: 'Short Beard' },
  { value: 'beardMajestic',    label: 'Full Beard' },
  { value: 'moustacheFancy',   label: 'Moustache' },
  { value: 'moustacheMagnum',  label: 'Thick Moustache' },
]

// Clothing — feminine styles listed first, then casual, then smart
const CLOTHING: { value: string; label: string }[] = [
  { value: 'shirtScoopNeck',    label: 'Scoop Neck' },
  { value: 'shirtVNeck',        label: 'V-Neck' },
  { value: 'overall',           label: 'Overall' },
  { value: 'shirtCrewNeck',     label: 'Crew Neck' },
  { value: 'hoodie',            label: 'Hoodie' },
  { value: 'graphicShirt',      label: 'Graphic' },
  { value: 'collarAndSweater',  label: 'Collar & Sweater' },
  { value: 'blazerAndShirt',    label: 'Blazer & Shirt' },
  { value: 'blazerAndSweater',  label: 'Blazer & Sweater' },
]

const BACKGROUNDS: { value: string; hex: string; label: string }[] = [
  { value: 'b6e3f4', hex: '#b6e3f4', label: 'Sky Blue' },
  { value: 'c0aede', hex: '#c0aede', label: 'Lavender' },
  { value: 'd1f4d4', hex: '#d1f4d4', label: 'Mint' },
  { value: 'ffd5dc', hex: '#ffd5dc', label: 'Blush' },
  { value: 'ffdfbf', hex: '#ffdfbf', label: 'Peach' },
  { value: 'f0f0f0', hex: '#f0f0f0', label: 'Light Grey' },
]

const DEFAULT_CONFIG: AvatarConfig = {
  top: 'shortCurly',
  hairColor: '724133',
  skinColor: 'edb98a',
  accessories: null,
  facialHair: null,
  clothing: 'shirtCrewNeck',
  background: 'b6e3f4',
  hatColor: '262e33',
}

function SwatchRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string | null; hex?: string; label: string }[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value ?? '__none__'}
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

function HairStylePicker({
  topValue,
  hairValue,
  onHairChange,
  onHeadwearChange,
}: {
  topValue: string    // actual config.top — may be a headwear value
  hairValue: string   // last selected hair style — always a hair value
  onHairChange: (v: string) => void
  onHeadwearChange: (v: string) => void
}) {
  const hairSections = [
    { label: 'Short hair', options: SHORT_HAIR },
    { label: 'Long hair', options: LONG_HAIR },
  ]
  return (
    <div className="space-y-3">
      {hairSections.map(({ label, options }) => (
        <div key={label}>
          <p className="mb-1 text-xs font-semibold text-gray-400 dark:text-slate-500">{label}</p>
          <div className="flex flex-wrap gap-2">
            {options.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onHairChange(opt.value)}
                className={`rounded-lg border-2 px-2 py-1 text-xs font-semibold transition-all ${
                  hairValue === opt.value && !HEADWEAR_VALUES.has(topValue)
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
                    : 'border-transparent bg-gray-100 text-slate-700 hover:border-gray-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-slate-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div>
        <p className="mb-1 text-xs font-semibold text-gray-400 dark:text-slate-500">Headwear</p>
        <div className="flex flex-wrap gap-2">
          {HEADWEAR.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onHeadwearChange(opt.value)}
              className={`rounded-lg border-2 px-2 py-1 text-xs font-semibold transition-all ${
                topValue === opt.value
                  ? 'border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300'
                  : 'border-transparent bg-gray-100 text-slate-700 hover:border-gray-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:border-slate-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
  const [config, setConfig] = useState<AvatarConfig>({ ...DEFAULT_CONFIG, ...(initial ?? {}) })

  // Remember last hair style separately so switching to headwear doesn't lose it
  const [lastHairStyle, setLastHairStyle] = useState<string>(() => {
    const t = initial?.top ?? DEFAULT_CONFIG.top
    return HEADWEAR_VALUES.has(t) ? DEFAULT_CONFIG.top : t
  })

  function set<K extends keyof AvatarConfig>(key: K) {
    return (value: AvatarConfig[K]) => setConfig(prev => ({ ...prev, [key]: value }))
  }

  function handleHairChange(hairValue: string) {
    setLastHairStyle(hairValue)
    setConfig(prev => ({ ...prev, top: hairValue }))
  }

  function handleHeadwearChange(hatValue: string) {
    setConfig(prev => ({ ...prev, top: hatValue }))
  }

  const isHeadwear = HEADWEAR_VALUES.has(config.top)

  return (
    <div className="space-y-5">
      {/* Live preview */}
      <div className="flex justify-center py-2">
        <UserAvatar avatarConfig={config} name={displayName} size={96} />
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Hair Style</p>
        <HairStylePicker
          topValue={config.top}
          hairValue={lastHairStyle}
          onHairChange={handleHairChange}
          onHeadwearChange={handleHeadwearChange}
        />
      </div>

      <SwatchRow
        label="Hair Colour"
        options={HAIR_COLOURS}
        value={config.hairColor}
        onChange={set('hairColor') as (v: string | null) => void}
      />

      {isHeadwear && (
        <SwatchRow
          label="Hat Colour"
          options={HAT_COLOURS}
          value={config.hatColor ?? '262e33'}
          onChange={set('hatColor') as (v: string | null) => void}
        />
      )}

      <SwatchRow
        label="Skin Tone"
        options={SKIN_TONES}
        value={config.skinColor}
        onChange={set('skinColor') as (v: string | null) => void}
      />
      <SwatchRow
        label="Clothing Style"
        options={CLOTHING}
        value={config.clothing ?? 'shirtCrewNeck'}
        onChange={set('clothing') as (v: string | null) => void}
      />
      <SwatchRow label="Accessories" options={ACCESSORIES} value={config.accessories} onChange={set('accessories')} />
      <SwatchRow label="Facial Hair" options={FACIAL_HAIR} value={config.facialHair} onChange={set('facialHair')} />
      <SwatchRow
        label="Background"
        options={BACKGROUNDS}
        value={config.background ?? 'b6e3f4'}
        onChange={set('background') as (v: string | null) => void}
      />

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
