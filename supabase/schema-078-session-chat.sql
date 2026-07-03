-- ============================================================
-- TimeWiseHub — Schema 078: Session chat structure
-- Room chat scoped to one video call's participants (staff + client),
-- reusing existing chat_conversations/messages/attachments infra.
-- Run via Supabase MCP apply_migration (name: session_chat)
-- ============================================================

alter table public.chat_conversations
  add column session_id uuid references public.sessions(id) on delete cascade;

create unique index chat_conversations_session
  on public.chat_conversations (session_id) where session_id is not null;

alter table public.clients
  add column guest_chat_user_id uuid references public.profiles(id);

-- Session-type conversations behave like DMs for posting purposes: any participant may post,
-- no org-role gate (unlike channels).
create or replace function public.can_post_chat(p_conversation uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_type public.chat_conversation_type;
  v_org  uuid;
begin
  select type, org_id into v_type, v_org
  from public.chat_conversations where id = p_conversation;
  if v_type is null then return false; end if;
  if not exists (
    select 1 from public.chat_participants
    where conversation_id = p_conversation and user_id = auth.uid()
  ) then
    return false;
  end if;
  if v_type = 'dm' or v_type = 'session' then
    return true;
  end if;
  return exists (
    select 1 from public.organisation_members om
    where om.org_id = v_org and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
  );
end;
$$;
