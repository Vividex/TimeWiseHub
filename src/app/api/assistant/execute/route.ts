// src/app/api/assistant/execute/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { WRITE_TOOLS } from '@/lib/assistant/tools'
import { executeWriteTool } from '@/lib/assistant/write-executors'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { tool: string; input: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  if (!body.tool || !WRITE_TOOLS.has(body.tool)) {
    return NextResponse.json({ error: 'Invalid or disallowed tool.' }, { status: 400 })
  }

  const result = await executeWriteTool(body.tool, body.input ?? {}, supabase, user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 })
  }
  return NextResponse.json({ ok: true, result: result.result })
}
