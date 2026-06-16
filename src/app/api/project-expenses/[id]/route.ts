import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS enforces creator-or-admin; a delete that returns nothing means access denied or not found
  const { error, count } = await supabase
    .from('project_expenses')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (count === 0) return NextResponse.json({ error: 'Not found or forbidden' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
