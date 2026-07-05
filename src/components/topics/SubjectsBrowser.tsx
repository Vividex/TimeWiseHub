'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { YEAR_GROUPS } from '@/lib/tutoring/constants'
import TopicAssetsPanel from './TopicAssetsPanel'

type SubjectOption = { id: string; name: string }
type TopicOption = { id: string; name: string }

export default function SubjectsBrowser({ subjects }: { subjects: SubjectOption[] }) {
  const supabase = createClient()
  const [yearGroup, setYearGroup] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [topicId, setTopicId] = useState('')
  const [topicOptions, setTopicOptions] = useState<TopicOption[]>([])
  const [loadingTopics, setLoadingTopics] = useState(false)

  useEffect(() => {
    setTopicId('')
    if (!yearGroup || !subjectId) { setTopicOptions([]); return }
    setLoadingTopics(true)
    supabase
      .from('topics')
      .select('id, name')
      .eq('subject_id', subjectId)
      .eq('year_group', yearGroup)
      .eq('archived', false)
      .order('name')
      .then(({ data }) => { setTopicOptions(data ?? []); setLoadingTopics(false) })
  }, [yearGroup, subjectId])

  if (subjects.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">No subjects yet.</p>
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Year group</label>
        <select
          value={yearGroup}
          onChange={e => setYearGroup(e.target.value)}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">— Select year group —</option>
          {YEAR_GROUPS.map(yg => <option key={yg} value={yg}>{yg}</option>)}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Subject</label>
        <select
          value={subjectId}
          onChange={e => setSubjectId(e.target.value)}
          disabled={!yearGroup}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="">— Select subject —</option>
          {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {yearGroup && subjectId && (
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Topic</label>
          {loadingTopics ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : topicOptions.length === 0 ? (
            <p className="text-xs text-gray-400">
              No topics for {yearGroup} · {subjects.find(s => s.id === subjectId)?.name} yet — create one while booking a session.
            </p>
          ) : (
            <select
              value={topicId}
              onChange={e => setTopicId(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">— Select topic —</option>
              {topicOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
        </div>
      )}

      {topicId && <TopicAssetsPanel topicId={topicId} />}
    </div>
  )
}
