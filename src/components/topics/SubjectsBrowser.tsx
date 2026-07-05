'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import TopicAssetsPanel from './TopicAssetsPanel'

type TopicItem = { id: string; name: string; year_group: string; assetCount: number }
type SubjectItem = { id: string; name: string; topics: TopicItem[] }

export default function SubjectsBrowser({ subjects }: { subjects: SubjectItem[] }) {
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null)

  if (subjects.length === 0) {
    return <p className="text-sm text-gray-400 dark:text-slate-500">No subjects yet.</p>
  }

  return (
    <div className="space-y-6">
      {subjects.map(subject => (
        <div key={subject.id}>
          <h2 className="text-lg font-black text-gray-900 dark:text-slate-100">{subject.name}</h2>
          {subject.topics.length === 0 ? (
            <p className="mt-1 text-sm text-gray-400 dark:text-slate-500">No topics yet.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {subject.topics.map(topic => (
                <li key={topic.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedTopicId(prev => prev === topic.id ? null : topic.id)}
                    className="flex w-full items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-2 text-left text-sm font-semibold text-gray-900 shadow-sm transition-colors hover:border-cyan-200 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {expandedTopicId === topic.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span>{topic.year_group} · {topic.name}</span>
                    <span className="ml-auto text-xs font-normal text-gray-400">
                      {topic.assetCount} {topic.assetCount === 1 ? 'file' : 'files'}
                    </span>
                  </button>
                  {expandedTopicId === topic.id && <TopicAssetsPanel topicId={topic.id} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
