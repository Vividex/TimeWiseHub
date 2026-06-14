'use client'

export default function UserAvatar({
  avatarUrl,
  name,
  size = 36,
}: {
  avatarUrl?: string | null
  name: string
  size?: number
}) {
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

  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-cyan-500 font-black text-white"
      style={{ ...style, fontSize: Math.round(size * 0.38) }}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
