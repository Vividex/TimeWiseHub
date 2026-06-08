-- ============================================================
-- TimeWiseHub — Schema 036: Team Chat (Phase 12)
-- Unified conversations (channel + dm), participant-keyed RLS.
-- Run via Supabase MCP apply_migration (name: chat_core)
-- ============================================================

-- ── 1. Enum ──────────────────────────────────────────────────
create type public.chat_conversation_type as enum ('channel', 'dm');

-- ── 2. Tables ────────────────────────────────────────────────
create table public.chat_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations on delete cascade,
  type        public.chat_conversation_type not null,
  title       text,
  dm_key      text,
  created_by  uuid references public.profiles,
  created_at  timestamptz not null default now(),
  unique (org_id, dm_key)
);

create table public.chat_participants (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations on delete cascade,
  user_id         uuid not null references public.profiles on delete cascade,
  last_read_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index chat_participants_user on public.chat_participants (user_id);

create table public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations on delete cascade,
  sender_id       uuid not null references public.profiles,
  body            text not null default '',
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index chat_messages_conv on public.chat_messages (conversation_id, created_at desc);

create table public.chat_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.chat_messages on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  size_bytes   bigint not null,
  created_at   timestamptz not null default now()
);
create index chat_attachments_message on public.chat_attachments (message_id);

alter table public.chat_conversations enable row level security;
alter table public.chat_participants  enable row level security;
alter table public.chat_messages       enable row level security;
alter table public.chat_attachments    enable row level security;

-- ── 3. Helper functions (SECURITY DEFINER — avoid RLS recursion) ──
-- "is the current user a participant of this conversation?"
create or replace function public.is_chat_participant(p_conversation uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_participants
    where conversation_id = p_conversation and user_id = auth.uid()
  );
$$;

-- "may the current user post to this conversation?"
-- dm: must be a participant. channel: participant AND management role in the org.
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
  if v_type = 'dm' then
    return true;
  end if;
  -- channel: management only
  return exists (
    select 1 from public.organisation_members om
    where om.org_id = v_org and om.user_id = auth.uid()
      and om.role in ('owner', 'admin', 'manager')
  );
end;
$$;

grant execute on function public.is_chat_participant(uuid) to authenticated;
grant execute on function public.can_post_chat(uuid) to authenticated;

-- ── 4. RLS policies ──────────────────────────────────────────
create policy "View conversations you are in"
  on public.chat_conversations for select
  using (public.is_chat_participant(id));

create policy "View participants of your conversations"
  on public.chat_participants for select
  using (public.is_chat_participant(conversation_id));

create policy "Update only your own read marker"
  on public.chat_participants for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "View messages in your conversations"
  on public.chat_messages for select
  using (public.is_chat_participant(conversation_id));

create policy "Post messages where allowed"
  on public.chat_messages for insert
  with check (sender_id = auth.uid() and public.can_post_chat(conversation_id));

-- UPDATE is for soft-delete only (a trigger enforces only deleted_at changes).
create policy "Delete own messages or moderate channel"
  on public.chat_messages for update
  using (
    sender_id = auth.uid()
    or exists (
      select 1 from public.chat_conversations c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = chat_messages.conversation_id
        and c.type = 'channel'
        and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "View attachments in your conversations"
  on public.chat_attachments for select
  using (exists (
    select 1 from public.chat_messages m
    where m.id = chat_attachments.message_id
      and public.is_chat_participant(m.conversation_id)
  ));

create policy "Add attachments where you can post"
  on public.chat_attachments for insert
  with check (exists (
    select 1 from public.chat_messages m
    where m.id = chat_attachments.message_id
      and public.can_post_chat(m.conversation_id)
  ));

-- ── 5. Soft-delete guard: UPDATE may only set deleted_at ─────
create or replace function public.chat_message_update_guard()
returns trigger language plpgsql as $$
begin
  if new.body is distinct from old.body
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_id is distinct from old.sender_id
     or new.created_at is distinct from old.created_at then
    raise exception 'chat messages are immutable except for deletion';
  end if;
  return new;
end;
$$;

create trigger chat_messages_update_guard
  before update on public.chat_messages
  for each row execute function public.chat_message_update_guard();

-- ── 6. Announcements channel: ensure + membership sync ───────
create or replace function public.ensure_announcements_channel(p_org uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.chat_conversations
  where org_id = p_org and type = 'channel' limit 1;
  if v_id is null then
    insert into public.chat_conversations (org_id, type, title)
    values (p_org, 'channel', 'Announcements')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.sync_chat_channel_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_conv uuid;
begin
  if (tg_op = 'INSERT') then
    v_conv := public.ensure_announcements_channel(new.org_id);
    insert into public.chat_participants (conversation_id, user_id)
    values (v_conv, new.user_id)
    on conflict (conversation_id, user_id) do nothing;
  elsif (tg_op = 'DELETE') then
    select id into v_conv from public.chat_conversations
    where org_id = old.org_id and type = 'channel' limit 1;
    if v_conv is not null then
      delete from public.chat_participants
      where conversation_id = v_conv and user_id = old.user_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_sync_chat_channel_membership
  after insert or delete on public.organisation_members
  for each row execute function public.sync_chat_channel_membership();

-- ── 7. start_dm: find-or-create a 1:1 DM in the shared org ───
create or replace function public.start_dm(p_target uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me   uuid := auth.uid();
  v_org  uuid;
  v_key  text;
  v_id   uuid;
begin
  if p_target = v_me then raise exception 'cannot DM yourself'; end if;
  select om.org_id into v_org
  from public.organisation_members om
  where om.user_id = v_me
    and om.org_id in (select org_id from public.organisation_members where user_id = p_target)
  limit 1;
  if v_org is null then raise exception 'users do not share an organisation'; end if;

  v_key := least(v_me, p_target)::text || ':' || greatest(v_me, p_target)::text;

  select id into v_id from public.chat_conversations
  where org_id = v_org and dm_key = v_key;
  if v_id is not null then return v_id; end if;

  begin
    insert into public.chat_conversations (org_id, type, dm_key, created_by)
    values (v_org, 'dm', v_key, v_me)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.chat_conversations
    where org_id = v_org and dm_key = v_key;
    return v_id;
  end;

  insert into public.chat_participants (conversation_id, user_id)
  values (v_id, v_me), (v_id, p_target)
  on conflict do nothing;
  return v_id;
end;
$$;

grant execute on function public.start_dm(uuid) to authenticated;

-- ── 8. send_chat_message: atomic message + attachments (RLS enforced) ──
create or replace function public.send_chat_message(
  p_id uuid, p_conversation uuid, p_body text, p_attachments jsonb
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_att jsonb;
begin
  insert into public.chat_messages (id, conversation_id, sender_id, body)
  values (coalesce(p_id, gen_random_uuid()), p_conversation, auth.uid(), coalesce(p_body, ''))
  returning id into v_id;

  if p_attachments is not null then
    for v_att in select * from jsonb_array_elements(p_attachments) loop
      insert into public.chat_attachments (message_id, storage_path, file_name, mime_type, size_bytes)
      values (
        v_id,
        v_att->>'storage_path',
        v_att->>'file_name',
        v_att->>'mime_type',
        (v_att->>'size_bytes')::bigint
      );
    end loop;
  end if;
  return v_id;
end;
$$;

grant execute on function public.send_chat_message(uuid, uuid, text, jsonb) to authenticated;

-- ── 9. Unread counts for the current user ────────────────────
create or replace function public.get_chat_unread()
returns table (conversation_id uuid, unread_count bigint)
language sql security definer stable set search_path = public as $$
  select p.conversation_id, count(m.id) as unread_count
  from public.chat_participants p
  left join public.chat_messages m
    on m.conversation_id = p.conversation_id
   and m.created_at > p.last_read_at
   and m.sender_id <> p.user_id
   and m.deleted_at is null
  where p.user_id = auth.uid()
  group by p.conversation_id;
$$;

grant execute on function public.get_chat_unread() to authenticated;

-- ── 10. Realtime publication ─────────────────────────────────
alter publication supabase_realtime add table public.chat_messages;

-- ── 11. Backfill: one Announcements channel per org + seed members ──
do $$
declare r record; v_conv uuid;
begin
  for r in select id from public.organisations loop
    v_conv := public.ensure_announcements_channel(r.id);
    insert into public.chat_participants (conversation_id, user_id)
    select v_conv, om.user_id from public.organisation_members om
    where om.org_id = r.id
    on conflict (conversation_id, user_id) do nothing;
  end loop;
end $$;
