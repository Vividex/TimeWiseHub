// src/lib/assistant/write-executors.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyTaskAssigned } from '@/lib/task-notifications'
import { createServiceClient } from '@/lib/supabase-service'

type ToolInput = Record<string, unknown>

export async function executeWriteTool(
  name: string,
  input: ToolInput,
  supabase: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (name) {
      case 'create_task': {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            project_id: input.project_id as string,
            title: input.title as string,
            notes: (input.notes as string) ?? null,
            priority: (input.priority as string) ?? 'normal',
            due_date: (input.due_date as string) ?? null,
            assignee_id: (input.assignee_id as string) ?? null,
            status: 'todo',
          })
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        if (data && input.assignee_id) {
          notifyTaskAssigned(data.id, input.assignee_id as string, userId).catch(() => {})
        }
        return { ok: true, result: data }
      }

      case 'update_task': {
        const { id, ...fields } = input
        const { data, error } = await supabase
          .from('tasks')
          .update(fields)
          .eq('id', id as string)
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        if (data && fields.assignee_id) {
          notifyTaskAssigned(data.id, fields.assignee_id as string, userId).catch(() => {})
        }
        return { ok: true, result: data }
      }

      case 'create_project': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('projects')
          .insert({
            owner_id: userId,
            org_id: membership?.org_id ?? null,
            name: input.name as string,
            description: (input.description as string) ?? null,
            due_date: (input.due_date as string) ?? null,
            colour: (input.colour as string) ?? '#2563eb',
            client_id: (input.client_id as string) ?? null,
          })
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'update_project': {
        const { id, ...fields } = input
        const { data, error } = await supabase
          .from('projects')
          .update(fields)
          .eq('id', id as string)
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_client': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('clients')
          .insert({
            owner_id: userId,
            org_id: membership?.org_id ?? null,
            name: input.name as string,
            email: (input.email as string) ?? null,
            phone: (input.phone as string) ?? null,
            address: (input.address as string) ?? null,
          })
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'update_client': {
        const { id, ...fields } = input
        const { data, error } = await supabase
          .from('clients')
          .update(fields)
          .eq('id', id as string)
          .select('id, name')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_time_entry': {
        const { data, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: userId,
            description: (input.description as string) ?? null,
            started_at: input.started_at as string,
            ended_at: input.ended_at as string,
            task_id: (input.task_id as string) ?? null,
          })
          .select('id')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'start_timer': {
        const { data, error } = await supabase
          .from('time_entries')
          .insert({
            user_id: userId,
            description: (input.description as string) ?? null,
            started_at: new Date().toISOString(),
            task_id: (input.task_id as string) ?? null,
          })
          .select('id, started_at')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'stop_timer': {
        const { data: active } = await supabase
          .from('time_entries')
          .select('id')
          .eq('user_id', userId)
          .is('ended_at', null)
          .maybeSingle()
        if (!active) return { ok: false, error: 'No active timer found.' }
        const { data, error } = await supabase
          .from('time_entries')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', active.id)
          .select('id, started_at, ended_at')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_expense': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        let category_id: string | null = null
        if (input.category_name) {
          const { data: cat } = await supabase
            .from('expense_categories')
            .select('id')
            .ilike('name', input.category_name as string)
            .maybeSingle()
          category_id = cat?.id ?? null
        }
        const { data, error } = await supabase
          .from('expenses')
          .insert({
            user_id: userId,
            org_id: membership?.org_id ?? null,
            amount: input.amount as number,
            currency: (input.currency as string) ?? 'AUD',
            description: input.description as string,
            expense_date: (input.expense_date as string) ?? new Date().toISOString().slice(0, 10),
            category_id,
            status: 'draft',
          })
          .select('id, amount, description')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_calendar_event': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('calendar_events')
          .insert({
            created_by: userId,
            org_id: membership?.org_id ?? null,
            title: input.title as string,
            description: (input.description as string) ?? null,
            start_at: input.start_at as string,
            end_at: (input.end_at as string) ?? null,
            all_day: (input.all_day as boolean) ?? false,
          })
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_leave_request': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('leave_requests')
          .insert({
            user_id: userId,
            org_id: membership?.org_id ?? null,
            leave_type: input.leave_type as string,
            start_date: input.start_date as string,
            end_date: input.end_date as string,
            notes: (input.notes as string) ?? null,
            status: 'submitted',
          })
          .select('id, leave_type, start_date, end_date')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_session': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data: session, error: sessErr } = await supabase
          .from('sessions')
          .insert({
            client_id: input.client_id as string,
            org_id: membership?.org_id ?? null,
            created_by: userId,
            title: input.title as string,
            scheduled_at: input.scheduled_at as string,
            duration_minutes: Number(input.duration_minutes ?? 60),
            status: 'scheduled',
          })
          .select('id, title, scheduled_at')
          .single()
        if (sessErr || !session) return { ok: false, error: sessErr?.message ?? 'Failed to create session.' }
        const { data: templates } = await supabase
          .from('client_session_templates')
          .select('title, position')
          .eq('client_id', input.client_id as string)
          .order('position')
        if (templates && templates.length > 0) {
          await supabase.from('session_todos').insert(
            templates.map(t => ({ session_id: session.id, title: t.title, completed: false, position: t.position }))
          )
        }
        return { ok: true, result: session }
      }

      case 'update_session': {
        const { session_id, ...fields } = input
        const { data, error } = await supabase
          .from('sessions')
          .update(fields)
          .eq('id', session_id as string)
          .select('id, title, status')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'add_session_todo': {
        const { data: existing } = await supabase
          .from('session_todos')
          .select('position')
          .eq('session_id', input.session_id as string)
          .order('position', { ascending: false })
          .limit(1)
          .maybeSingle()
        const position = existing ? existing.position + 1 : 0
        const { data, error } = await supabase
          .from('session_todos')
          .insert({ session_id: input.session_id as string, title: input.title as string, completed: false, position })
          .select('id, title')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'check_session_todo': {
        const { data, error } = await supabase
          .from('session_todos')
          .update({ completed: input.completed as boolean })
          .eq('id', input.todo_id as string)
          .select('id, title, completed')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'add_progress_note': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()
        const { data, error } = await supabase
          .from('progress_notes')
          .insert({
            client_id: input.client_id as string,
            org_id: membership?.org_id ?? null,
            created_by: userId,
            body: input.body as string,
          })
          .select('id, created_at')
          .single()
        if (error) return { ok: false, error: error.message }
        return { ok: true, result: data }
      }

      case 'create_quote': {
        const { data: membership } = await supabase
          .from('organisation_members')
          .select('org_id')
          .eq('user_id', userId)
          .maybeSingle()

        // Use service role to count all user's quotes for sequential numbering
        const service = createServiceClient()
        const { count: qCount } = await service
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', userId)
          .eq('status', 'quote')
        const year = new Date().getFullYear()
        const invoiceNumber = `Q-${year}-${String((qCount ?? 0) + 1).padStart(3, '0')}`

        type QuoteItem = { description: string; quantity?: number; unit_price: number }
        const items = (input.items as QuoteItem[]) ?? []
        const subtotal = items.reduce((s, i) => s + ((i.quantity ?? 1) * i.unit_price), 0)

        const { data: quote, error } = await supabase
          .from('invoices')
          .insert({
            owner_id: userId,
            org_id: membership?.org_id ?? null,
            client_id: (input.client_id as string) ?? null,
            invoice_number: invoiceNumber,
            status: 'quote',
            issue_date: new Date().toISOString().slice(0, 10),
            due_date: (input.due_date as string) ?? null,
            currency: (input.currency as string) ?? 'AUD',
            subtotal,
            notes: (input.notes as string) ?? null,
          })
          .select('id, invoice_number')
          .single()

        if (error || !quote) return { ok: false, error: error?.message ?? 'Failed to create quote.' }

        if (items.length > 0) {
          await supabase.from('invoice_items').insert(
            items.map((item, idx) => ({
              invoice_id: quote.id,
              description: item.description,
              quantity: item.quantity ?? 1,
              unit_price: item.unit_price,
              sort_order: idx,
            }))
          )
        }

        return { ok: true, result: { id: quote.id, invoice_number: invoiceNumber, subtotal } }
      }

      default:
        return { ok: false, error: `Unknown write tool: ${name}` }
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
