'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import TaskPool from './TaskPool'
import MyTasks from './MyTasks'

type PoolTask = {
  id: string
  title: string
  priority: string
  status: string
  due_date: string | null
  notes: string | null
  assignee_id: string | null
  completed_at: string | null
  projects: { id: string; name: string; colour: string } | null
}

type OrgMember = { userId: string; displayName: string }
type Project = { id: string; name: string; colour: string }

export default function TasksHub({
  poolTasks,
  myTasks,
  orgMembers,
  currentUserId,
  currentUserRole,
  projects,
}: {
  poolTasks: PoolTask[]
  myTasks: PoolTask[]
  orgMembers: OrgMember[]
  currentUserId: string
  currentUserRole: string
  projects: Project[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'pool' | 'mine'>('pool')
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [priority, setPriority] = useState('normal')
  const [dueDate, setDueDate] = useState('')
  const [assignee, setAssignee] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !projectId) return
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { data: newTask, error: err } = await supabase.from('tasks').insert({
      project_id: projectId,
      assignee_id: assignee || currentUserId,
      title: title.trim(),
      priority,
      due_date: dueDate || null,
    }).select('id, assignee_id').single()
    setLoading(false)
    if (err) { setError(err.message); return }

    if (newTask?.assignee_id) {
      fetch('/api/tasks/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: newTask.id, assigneeId: newTask.assignee_id }),
      }).catch(() => {})
    }

    setTitle(''); setPriority('normal'); setDueDate(''); setAssignee('')
    setShowModal(false)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900">Tasks</h1>
        {projects.length > 0 && (
          <button
            onClick={() => setShowModal(true)}
            className="rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 px-4 py-2 text-sm font-semibold"
          >
            + New task
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('pool')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'pool'
              ? 'bg-cyan-500 text-white'
              : 'bg-gray-100 text-gray-500 hover:text-gray-900'
          }`}
        >
          Available ({poolTasks.length})
        </button>
        <button
          onClick={() => setTab('mine')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'mine'
              ? 'bg-cyan-500 text-white'
              : 'bg-gray-100 text-gray-500 hover:text-gray-900'
          }`}
        >
          My Tasks ({myTasks.length})
        </button>
      </div>

      {tab === 'pool' ? (
        <TaskPool
          initialTasks={poolTasks}
          orgMembers={orgMembers}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
        />
      ) : (
        <MyTasks
          initialTasks={myTasks}
          currentUserId={currentUserId}
        />
      )}

      {/* New task modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-black text-gray-900">New task</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Project</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)} required
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500">Title</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)} required autoFocus
                  placeholder="What needs doing?"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Priority</label>
                  <select value={priority} onChange={e => setPriority(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Due date</label>
                  <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400" />
                </div>
              </div>
              {orgMembers.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500">Assign to</label>
                  <select value={assignee} onChange={e => setAssignee(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400">
                    <option value="">Me</option>
                    {orgMembers.map(m => <option key={m.userId} value={m.userId}>{m.displayName}</option>)}
                  </select>
                </div>
              )}
              {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={loading || !title.trim()}
                  className="flex-1 rounded-xl bg-gradient-to-b from-cyan-500 to-cyan-600 text-white shadow-md shadow-cyan-500/25 transition-all duration-150 hover:from-cyan-600 hover:to-cyan-700 hover:shadow-lg hover:shadow-cyan-500/30 active:scale-[0.965] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400 py-2 text-sm font-semibold disabled:opacity-50">
                  {loading ? 'Creating...' : 'Create task'}
                </button>
                <button type="button" onClick={() => setShowModal(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 shadow-sm hover:bg-gray-50 hover:border-gray-300">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
