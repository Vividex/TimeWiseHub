import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: invoice } = await service.from('invoices').select('owner_id').eq('id', id).single()

  if (!invoice || invoice.owner_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await service.from('invoices').update({
    status: 'paid',
    paid_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}
