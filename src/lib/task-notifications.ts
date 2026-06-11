import { createServiceClient } from '@/lib/supabase-service'
import { sendPushToUser } from '@/lib/push'

export async function notifyTaskAssigned(taskId: string, assigneeId: string, assignedById: string) {
  if (!assigneeId || assigneeId === assignedById) return

  const service = createServiceClient()

  const { data: task } = await service
    .from('tasks')
    .select('title, projects(name)')
    .eq('id', taskId)
    .maybeSingle()
  if (!task) return

  const { data: assigner } = await service
    .from('profiles')
    .select('full_name, email')
    .eq('id', assignedById)
    .maybeSingle()

  const p = assigner as { full_name?: string | null; email?: string } | null
  const assignerName = p?.full_name?.trim() || p?.email || 'Someone'
  const projectName = (task.projects as unknown as { name: string } | null)?.name
  const body = projectName ? `${projectName}: ${task.title as string}` : (task.title as string)

  await sendPushToUser(assigneeId, {
    title: `${assignerName} assigned you a task`,
    body,
    url: '/dashboard/tasks',
    tag: `task-assigned:${taskId}`,
  })
}
