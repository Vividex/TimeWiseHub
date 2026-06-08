'use client'

import { useState } from 'react'
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

export default function TasksHub({
  poolTasks,
  myTasks,
  orgMembers,
  currentUserId,
  currentUserRole,
}: {
  poolTasks: PoolTask[]
  myTasks: PoolTask[]
  orgMembers: OrgMember[]
  currentUserId: string
  currentUserRole: string
}) {
  const [tab, setTab] = useState<'pool' | 'mine'>('pool')

  return (
    <div className="space-y-6">
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
    </div>
  )
}
