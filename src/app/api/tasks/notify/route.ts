import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { notifyTaskAssigned } from '@/lib/task-notifications'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taskId, assigneeId } = await req.json() as { taskId?: string; assigneeId?: string }
  if (!taskId || !assigneeId) {
    return NextResponse.json({ error: 'taskId and assigneeId required' }, { status: 400 })
  }

  notifyTaskAssigned(taskId, assigneeId, user.id).catch(console.error)
  return NextResponse.json({ ok: true })
}
