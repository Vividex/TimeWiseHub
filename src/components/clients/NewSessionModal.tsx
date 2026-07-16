'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { YEAR_GROUPS } from '@/lib/tutoring/constants'

type Template = { id: string; title: string; position: number }
type Repeat = 'none' | 'weekly' | 'fortnightly' | 'monthly'
type StudentOption = { id: string; name: string }
type SubjectOption = { id: string; name: string }
type TopicOption = { id: string; name: string }
type SiteOption = { id: string; label: string }

const NEW_SUBJECT = '__new_subject__'
const NEW_TOPIC = '__new_topic__'

export default function NewSessionModal({
  clientId,
  orgId,
  clientLabel,
  students,
  subjects,
  sites,
  showTutoringFields,
  defaultOpen = false,
}: {
  clientId: string
  orgId: string | null
  clientLabel: { singular: string; plural: string }
  students: StudentOption[]
  subjects: SubjectOption[]
  sites: SiteOption[]
  showTutoringFields: boolean
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(defaultOpen)
  const [title, setTitle] = useState('')
  const [studentId, setStudentId] = useState('')
  const [siteId, setSiteId] = useState('')
  const [yearGroup, setYearGroup] = useState('')
  const [subjectChoice, setSubjectChoice] = useState('')
  const [newSubjectName, setNewSubjectName] = useState('')
  const [topicChoice, setTopicChoice] = useState('')
  const [newTopicName, setNewTopicName] = useState('')
  const [topicOptions, setTopicOptions] = useState<TopicOption[]>([])
  const [scheduledAt, setScheduledAt] = useState('')
  const [duration, setDuration] = useState(60)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [templates, setTemplates] = useState<Template[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isNewSubject = subjectChoice === NEW_SUBJECT

  useEffect(() => {
    setYearGroup('')
    setSubjectChoice('')
    setNewSubjectName('')
    setTopicChoice('')
    setNewTopicName('')
    if (!studentId) return
    supabase
      .from('sessions')
      .select('year_group, subject_id')
      .eq('student_id', studentId)
      .order('scheduled_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        const last = data?.[0]
        if (last?.year_group) setYearGroup(last.year_group as string)
        if (last?.subject_id) setSubjectChoice(last.subject_id as string)
      })
  }, [studentId])

  useEffect(() => {
    setTopicChoice('')
    setNewTopicName('')
    if (!subjectChoice || isNewSubject || !yearGroup) { setTopicOptions([]); return }
    supabase
      .from('topics')
      .select('id, name')
      .eq('subject_id', subjectChoice)
      .eq('year_group', yearGroup)
      .eq('archived', false)
      .order('name')
      .then(({ data }) => setTopicOptions(data ?? []))
  }, [subjectChoice, yearGroup, isNewSubject])

  useEffect(() => {
    if (!open) return
    supabase
      .from('client_session_templates')
      .select('id, title, position')
      .eq('client_id', clientId)
      .order('position')
      .then(({ data }) => setTemplates(data ?? []))
  }, [open, clientId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !scheduledAt) return
    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in.'); setSaving(false); return }

    let resolvedSubjectId: string | null = subjectChoice && !isNewSubject ? subjectChoice : null
    if (isNewSubject && newSubjectName.trim()) {
      const { data: newSubject, error: subjErr } = await supabase
        .from('subjects')
        .insert({ org_id: orgId, created_by: user.id, name: newSubjectName.trim() })
        .select('id')
        .single()
      if (subjErr || !newSubject) {
        setError(subjErr?.message ?? 'Failed to create subject.')
        setSaving(false)
        return
      }
      resolvedSubjectId = newSubject.id
    }

    let resolvedTopicId: string | null = topicChoice && topicChoice !== NEW_TOPIC ? topicChoice : null
    const topicNameToCreate = isNewSubject ? newTopicName.trim() : (topicChoice === NEW_TOPIC ? newTopicName.trim() : '')
    if (topicNameToCreate && resolvedSubjectId && yearGroup) {
      const { data: newTopic, error: topicErr } = await supabase
        .from('topics')
        .insert({ subject_id: resolvedSubjectId, year_group: yearGroup, created_by: user.id, name: topicNameToCreate })
        .select('id')
        .single()
      if (topicErr || !newTopic) {
        setError(topicErr?.message ?? 'Failed to create topic.')
        setSaving(false)
        return
      }
      resolvedTopicId = newTopic.id
    }

    if (repeat !== 'none') {
      const res = await fetch(`/api/clients/${clientId}/sessions/series`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          scheduledAt,
          durationMinutes: duration,
          recurrenceInterval: repeat,
          studentId: studentId || null,
          yearGroup: yearGroup || null,
          subjectId: resolvedSubjectId,
          topicId: resolvedTopicId,
        }),
      })
      const json = await res.json()
      setSaving(false)
      if (!res.ok) { setError(json.error ?? 'Failed to create recurring session.'); return }
      router.push(`/dashboard/clients/${clientId}/sessions/${json.firstSessionId}`)
      return
    }

    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        org_id: orgId,
        created_by: user.id,
        title: title.trim(),
        scheduled_at: new Date(scheduledAt).toISOString(),
        duration_minutes: duration,
        status: 'scheduled',
        student_id: studentId || null,
        year_group: yearGroup || null,
        subject_id: resolvedSubjectId,
        topic_id: resolvedTopicId,
        site_id: siteId || null,
      })
      .select('id')
      .single()

    if (sessErr || !session) {
      setError(sessErr?.message ?? 'Failed to create session.')
      setSaving(false)
      return
    }

    if (templates.length > 0) {
      await supabase.from('session_todos').insert(
        templates.map(t => ({
          session_id: session.id,
          title: t.title,
          completed: false,
          position: t.position,
        }))
      )
    }

    fetch(`/api/clients/${clientId}/sessions/${session.id}/notify-scheduled`, { method: 'POST' }).catch(() => {})

    router.push(`/dashboard/clients/${clientId}/sessions/${session.id}`)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600"
      >
        + New session
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-black text-gray-900">New session</h2>
        {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Weekly check-in"
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>
          {students.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Student</label>
              <select
                value={studentId}
                onChange={e => setStudentId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">— Select student —</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          {sites.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Location</label>
              <select
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
              >
                <option value="">{clientLabel.singular}&apos;s main address</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          )}
          {showTutoringFields && (
            <>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Year group</label>
                <select
                  value={yearGroup}
                  onChange={e => setYearGroup(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">— None —</option>
                  {YEAR_GROUPS.map(yg => <option key={yg} value={yg}>{yg}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Subject</label>
                <select
                  value={subjectChoice}
                  onChange={e => setSubjectChoice(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                >
                  <option value="">— None —</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value={NEW_SUBJECT}>+ Add new subject…</option>
                </select>
                {isNewSubject && (
                  <input
                    value={newSubjectName}
                    onChange={e => setNewSubjectName(e.target.value)}
                    placeholder="e.g. Music"
                    className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                  />
                )}
              </div>
              {subjectChoice && (
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Topic</label>
                  {isNewSubject ? (
                    <input
                      value={newTopicName}
                      onChange={e => setNewTopicName(e.target.value)}
                      placeholder="e.g. Algebra"
                      className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                    />
                  ) : (
                    <>
                      <select
                        value={topicChoice}
                        onChange={e => setTopicChoice(e.target.value)}
                        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                      >
                        <option value="">— None —</option>
                        {topicOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        <option value={NEW_TOPIC}>+ Add new topic…</option>
                      </select>
                      {topicChoice === NEW_TOPIC && (
                        <input
                          value={newTopicName}
                          onChange={e => setNewTopicName(e.target.value)}
                          placeholder="e.g. Algebra"
                          className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Date &amp; time</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              required
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Duration (minutes)</label>
            <input
              type="number"
              value={duration}
              onChange={e => setDuration(Number(e.target.value))}
              min={5}
              max={480}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-500">Repeat</label>
            <select
              value={repeat}
              onChange={e => setRepeat(e.target.value as Repeat)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none"
            >
              <option value="none">Does not repeat</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </select>
            {repeat !== 'none' && (
              <p className="mt-1 text-xs text-gray-400">
                Creates this session plus 7 upcoming occurrences, kept topped up automatically.
              </p>
            )}
          </div>
          {templates.length > 0 && (
            <p className="rounded-xl bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-700">
              Checklist will be pre-filled from this {clientLabel.singular.toLowerCase()}&apos;s saved template ({templates.length} items).
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-600 disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
