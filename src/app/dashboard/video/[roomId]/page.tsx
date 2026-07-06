import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-service'
import { resolveProgramAssetSignedUrl } from '@/lib/program-storage'
import { createTopicAssetSignedUrl } from '@/lib/tutoring/topic-storage'
import { ensureSessionChatParticipant } from '@/lib/session-chat'
import CallRoom from '@/components/video/CallRoom'
import type { LinkedTopicAsset } from '@/components/video/WorksheetTab'
import type { LinkedProgramBundle, Program, ProgramAsset } from '@/types/programs'

const DAILY_API = 'https://api.daily.co/v1'

async function issueOrgMemberToken(roomName: string, isOwner: boolean, userName: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + 4 * 60 * 60
  const res = await fetch(`${DAILY_API}/meeting-tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { room_name: roomName, is_owner: isOwner, exp, user_name: userName },
    }),
  })
  if (!res.ok) throw new Error(`Token issue failed: ${res.status}`)
  const data = await res.json() as { token: string }
  return data.token
}

async function fetchLinkedProgram(sessionId: string, userId: string): Promise<LinkedProgramBundle | null> {
  const service = createServiceClient()

  const { data: session } = await service
    .from('sessions').select('program_id').eq('id', sessionId).maybeSingle()
  if (!session?.program_id) return null

  const { data: program } = await service
    .from('programs').select('*').eq('id', session.program_id).maybeSingle()
  if (!program) return null

  const { data: membership } = await service
    .from('organisation_members').select('role')
    .eq('user_id', userId).eq('org_id', program.org_id ?? '').maybeSingle()
  const isOwner = program.owner_id === userId
  if (!isOwner && !membership) return null

  const [{ data: categories }, { data: assets }] = await Promise.all([
    service.from('program_categories').select('*')
      .eq('program_id', program.id).order('sort_order').order('created_at'),
    service.from('program_assets').select('*')
      .eq('program_id', program.id).order('sort_order').order('created_at'),
  ])

  const assetsWithUrls: ProgramAsset[] = await Promise.all(
    (assets ?? []).map(async asset => ({ ...asset, signed_url: await resolveProgramAssetSignedUrl(asset) })),
  )

  return {
    program: program as Program,
    categories: categories ?? [],
    assets: assetsWithUrls,
  }
}

async function fetchLinkedTopicAssets(sessionId: string, userId: string): Promise<{ assets: LinkedTopicAsset[]; studentId: string | null }> {
  const service = createServiceClient()

  const { data: session } = await service
    .from('sessions').select('topic_id, student_id').eq('id', sessionId).maybeSingle()
  if (!session?.topic_id) return { assets: [], studentId: session?.student_id ?? null }

  const { data: topic } = await service
    .from('topics').select('subject_id').eq('id', session.topic_id).maybeSingle()
  if (!topic) return { assets: [], studentId: session.student_id }

  const { data: subject } = await service
    .from('subjects').select('org_id, created_by').eq('id', topic.subject_id).maybeSingle()
  if (!subject) return { assets: [], studentId: session.student_id }

  if (subject.org_id) {
    const { data: membership } = await service
      .from('organisation_members').select('role').eq('user_id', userId).eq('org_id', subject.org_id).maybeSingle()
    if (!membership) return { assets: [], studentId: session.student_id }
  } else if (subject.created_by !== userId) {
    return { assets: [], studentId: session.student_id }
  }

  const { data: assets } = await service
    .from('topic_assets')
    .select('id, name, asset_type, storage_path')
    .eq('topic_id', session.topic_id)
    .in('asset_type', ['pdf', 'image'])

  const withUrls: LinkedTopicAsset[] = await Promise.all(
    (assets ?? []).map(async a => ({
      id: a.id,
      name: a.name,
      asset_type: a.asset_type as 'pdf' | 'image',
      signed_url: (a.storage_path ? await createTopicAssetSignedUrl(a.storage_path) : null) ?? '',
    })),
  )

  return { assets: withUrls.filter(a => a.signed_url), studentId: session.student_id }
}

export default async function CallRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const { roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: call } = await supabase
    .from('scheduled_calls')
    .select('id, daily_room_name, room_url, created_by, org_id, session_id')
    .eq('id', roomId)
    .maybeSingle()

  if (!call?.daily_room_name || !call?.room_url) redirect('/dashboard/video')

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from('organisation_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('org_id', call.org_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  if (!membership) redirect('/dashboard/video')

  const p = profile as unknown as { full_name: string | null; email: string | null } | null
  const userName = p?.full_name || p?.email || 'Participant'

  const linkedProgram = call.session_id ? await fetchLinkedProgram(call.session_id, user.id) : null
  const sessionChat = call.session_id
    ? { conversationId: await ensureSessionChatParticipant(call.session_id, user.id), userId: user.id }
    : null
  const { assets: linkedTopicAssets, studentId: sessionStudentId } = call.session_id
    ? await fetchLinkedTopicAssets(call.session_id, user.id)
    : { assets: [], studentId: null }

  let token: string
  try {
    token = await issueOrgMemberToken(call.daily_room_name, call.created_by === user.id, userName)
  } catch {
    redirect('/dashboard/video')
  }

  return (
    <CallRoom
      roomUrl={call.room_url}
      token={token!}
      dailyRoomName={call.daily_room_name}
      isCreator={call.created_by === user.id}
      callId={roomId}
      linkedProgram={linkedProgram}
      sessionChat={sessionChat}
      linkedTopicAssets={linkedTopicAssets}
      sessionStudentId={sessionStudentId}
      currentUserId={user.id}
    />
  )
}
