import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, description, amount, expenseDate, category } = await req.json()
  if (!projectId || !description || amount == null) {
    return NextResponse.json({ error: 'projectId, description and amount are required' }, { status: 400 })
  }

  // Verify the user has access to this project via RLS, and grab org_id
  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .single()
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('project_expenses')
    .insert({
      project_id: projectId,
      org_id: project.org_id ?? null,
      created_by: user.id,
      description,
      amount: Number(amount),
      expense_date: expenseDate ?? new Date().toISOString().slice(0, 10),
      category: category ?? null,
    })
    .select('id, description, amount, expense_date, category, created_by')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, expense: data })
}
