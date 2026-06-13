'use client'

import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { avataaars } from '@dicebear/collection'
import type { AvatarConfig } from '@/lib/chat/types'

const HEADWEAR_TOPS = new Set(['hat', 'hijab', 'turban', 'winterHat1', 'winterHat02', 'winterHat03', 'winterHat04'])

function buildSvgUrl(config: AvatarConfig): string {
  // DiceBear v9 expects every option as a single-element array to pin the value.
  // Probability props suppress optional parts; mouth/eyes pinned to friendly defaults.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: Record<string, any> = {
    seed: 'fixed',
    backgroundColor: [config.background ?? 'b6e3f4'],
    top: [config.top],
    hairColor: [config.hairColor],
    skinColor: [config.skinColor],
    clothing: [config.clothing ?? 'shirtCrewNeck'],
    mouth: ['smile'],
    eyes: ['default'],
    eyebrows: ['defaultNatural'],
    accessoriesProbability: config.accessories ? 100 : 0,
    facialHairProbability: config.facialHair ? 100 : 0,
  }
  if (HEADWEAR_TOPS.has(config.top)) opts.hatColor = [config.hatColor ?? '262e33']
  if (config.accessories) opts.accessories = [config.accessories]
  if (config.facialHair) opts.facialHair = [config.facialHair]
  const svg = createAvatar(avataaars, opts).toString()
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}

export default function UserAvatar({
  avatarUrl,
  avatarConfig,
  name,
  size = 36,
}: {
  avatarUrl?: string | null
  avatarConfig?: AvatarConfig | null
  name: string
  size?: number
}) {
  const svgUrl = useMemo(
    () => (!avatarUrl && avatarConfig ? buildSvgUrl(avatarConfig) : null),
    [avatarUrl, avatarConfig],
  )

  const style = { width: size, height: size }

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={style}
        className="rounded-full object-cover"
      />
    )
  }

  if (svgUrl) {
    return (
      <img
        src={svgUrl}
        alt={name}
        style={style}
        className="rounded-full"
      />
    )
  }

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-cyan-500 font-black text-white"
      style={{ ...style, fontSize: Math.round(size * 0.38) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
