-- ============================================================
-- TimeWiseHub — Schema 080: Exclude session chats from unread count
-- The earlier "exclude session chats from Team Chat inbox" fix (schema/commit
-- for the conversation list query) never touched this RPC, so a message in a
-- video call's session chat still inflated the Team Chat unread badge for any
-- staff member who was a call participant.
-- Run via Supabase MCP apply_migration (name: chat_unread_exclude_session)
-- ============================================================

create or replace function public.get_chat_unread()
returns table (conversation_id uuid, unread_count bigint)
language sql security definer stable set search_path = public as $$
  select p.conversation_id, count(m.id) as unread_count
  from public.chat_participants p
  join public.chat_conversations c on c.id = p.conversation_id
  left join public.chat_messages m
    on m.conversation_id = p.conversation_id
   and m.created_at > p.last_read_at
   and m.sender_id <> p.user_id
   and m.deleted_at is null
  where p.user_id = auth.uid()
    and c.type in ('channel', 'dm')
  group by p.conversation_id;
$$;
