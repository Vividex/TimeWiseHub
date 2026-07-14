// src/lib/whiteboard/objects.ts
import { createClient } from '@/lib/supabase-browser'
import type { WhiteboardObjectContent, NewWhiteboardObject, WhiteboardObject } from '@/types/whiteboard'

export function whiteboardChannelName(sessionId: string): string {
  return `whiteboard:${sessionId}`
}

export async function fetchWhiteboardObjects(sessionId: string): Promise<WhiteboardObject[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whiteboard_objects')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as WhiteboardObject[]
}

export async function insertWhiteboardObject(row: NewWhiteboardObject): Promise<WhiteboardObject> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('whiteboard_objects')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as unknown as WhiteboardObject
}

export async function updateWhiteboardObjectContent(id: string, content: WhiteboardObjectContent): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whiteboard_objects')
    .update({ content, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function updateWhiteboardObjectPosition(
  id: string,
  position: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whiteboard_objects')
    .update({ ...position, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// Erasing a stroke down to one surviving run needs both new points (content)
// and a new tight bounding box (position) written atomically in one request
// — the two separate functions above would otherwise be two round trips for
// what's conceptually a single update.
export async function updateWhiteboardObjectStroke(
  id: string,
  patch: { x: number; y: number; width: number; height: number; content: WhiteboardObjectContent },
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('whiteboard_objects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteWhiteboardObject(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase.from('whiteboard_objects').delete().eq('id', id)
  if (error) throw error
}
