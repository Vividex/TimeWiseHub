import { Star, Check, X, Smile, Heart, ThumbsUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type BuiltinSticker = { id: string; label: string; icon: LucideIcon; color: string }

export const BUILTIN_STICKERS: BuiltinSticker[] = [
  { id: 'star',     label: 'Star',      icon: Star,     color: '#f59e0b' },
  { id: 'check',    label: 'Correct',   icon: Check,    color: '#10b981' },
  { id: 'cross',    label: 'Incorrect', icon: X,        color: '#ef4444' },
  { id: 'smile',    label: 'Smile',     icon: Smile,    color: '#eab308' },
  { id: 'heart',    label: 'Heart',     icon: Heart,    color: '#ec4899' },
  { id: 'thumbsup', label: 'Great job', icon: ThumbsUp, color: '#3b82f6' },
]

export function findBuiltinSticker(id: string): BuiltinSticker | undefined {
  return BUILTIN_STICKERS.find(s => s.id === id)
}
