'use client'

import { useMemo } from 'react'
import { createAvatar } from '@dicebear/core'
import { avataaars } from '@dicebear/collection'
import type { AvatarConfig } from '@/lib/chat/types'

function buildSvgUrl(config: AvatarConfig): string {
  // DiceBear v9 expects every option as an array for randomisation support.
  // Probability props are the correct way to hide optional parts (not a 'blank' value).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const opts: Record<string, any> = {
    seed: 'fixed',
    backgroundColor: ['transparent'],
    top: [config.top],
    hairColor: [config.hairColor],
    skinColor: [config.skinColor],
    accessoriesProbability: config.accessories ? 100 : 0,
    facialHairProbability: config.facialHair ? 100 : 0,
  }
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
