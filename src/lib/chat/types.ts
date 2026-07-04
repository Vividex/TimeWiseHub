export type ChatConversationType = 'channel' | 'dm' | 'group'

export type ChatConversation = {
  id: string
  org_id: string
  type: ChatConversationType
  title: string | null
  dm_key: string | null
  created_by: string | null
  created_at: string
}

export type ChatAttachment = {
  id: string
  message_id: string
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  bucket: string
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  deleted_at: string | null
  created_at: string
  chat_attachments: ChatAttachment[]
}

export type ChatMember = {
  user_id: string
  full_name: string | null
  email: string
  role: 'owner' | 'admin' | 'manager' | 'employee'
  username: string | null
  nickname: string | null
  avatar_url: string | null
}

/** Peer-facing display name. Never returns the user's email. */
export function displayName(member: ChatMember | null | undefined): string {
  if (!member) return 'Unknown'
  return member.nickname ?? member.full_name ?? member.username ?? 'Unknown'
}

export type QuietHours = {
  enabled: boolean
  days: number[] // ISO weekday, Mon=1 … Sun=7
  start: string // "HH:MM"
  end: string // "HH:MM"
}

export type AvailabilityReason = 'after_hours' | 'on_leave' | 'holiday' | null

export type Availability = {
  available: boolean
  reason: AvailabilityReason
}
