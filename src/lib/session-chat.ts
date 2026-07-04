import { createServiceClient } from '@/lib/supabase-service'

export async function ensureGuestChatUser(clientId: string): Promise<{ userId: string; email: string }> {
  const service = createServiceClient()
  const { data: client } = await service
    .from('clients').select('id, email, guest_chat_user_id').eq('id', clientId).maybeSingle()

  if (!client?.email) throw new Error('Client has no email on file')
  if (client.guest_chat_user_id) return { userId: client.guest_chat_user_id, email: client.email }

  const { data: created, error } = await service.auth.admin.createUser({
    email: client.email,
    email_confirm: true,
    // app_metadata (not user_metadata) — the signed-in user cannot edit this themselves via
    // the client SDK. dashboard/layout.tsx trusts this flag to keep guests out of the app.
    app_metadata: { is_client_guest: true, client_id: client.id },
  })

  if (error || !created.user) {
    // Lost a race with a concurrent call for the same client (e.g. two guest tabs) — the other
    // call already created the user; re-read what it stored.
    const { data: retry } = await service
      .from('clients').select('guest_chat_user_id').eq('id', clientId).maybeSingle()
    if (retry?.guest_chat_user_id) return { userId: retry.guest_chat_user_id, email: client.email }
    throw new Error(`Failed to create guest chat user: ${error?.message}`)
  }

  await service.from('clients').update({ guest_chat_user_id: created.user.id }).eq('id', clientId)
  return { userId: created.user.id, email: client.email }
}

export async function mintGuestChatToken(email: string): Promise<string> {
  const service = createServiceClient()
  const { data, error } = await service.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties?.hashed_token) throw new Error(`Failed to mint guest chat token: ${error?.message}`)
  return data.properties.hashed_token
}

export async function ensureSessionChatParticipant(sessionId: string, userId: string): Promise<string> {
  const service = createServiceClient()

  let conversationId: string

  const { data: existing } = await service
    .from('chat_conversations').select('id').eq('session_id', sessionId).eq('type', 'session').maybeSingle()

  if (existing) {
    conversationId = existing.id
  } else {
    const { data: session } = await service.from('sessions').select('org_id').eq('id', sessionId).maybeSingle()
    if (!session?.org_id) throw new Error('Session has no organisation')

    const { data: created, error } = await service
      .from('chat_conversations')
      .insert({ org_id: session.org_id, type: 'session', session_id: sessionId })
      .select('id')
      .single()

    if (created) {
      conversationId = created.id
    } else {
      // Lost a race with a concurrent create (e.g. two staff opening the call at once) — the
      // unique index on session_id means exactly one insert wins; re-fetch the winner's row.
      const { data: retry } = await service
        .from('chat_conversations').select('id').eq('session_id', sessionId).eq('type', 'session').maybeSingle()
      if (!retry) throw new Error(`Failed to create session chat: ${error?.message}`)
      conversationId = retry.id
    }
  }

  await service
    .from('chat_participants')
    .upsert(
      { conversation_id: conversationId, user_id: userId },
      { onConflict: 'conversation_id,user_id', ignoreDuplicates: true },
    )

  return conversationId
}
