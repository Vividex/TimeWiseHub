-- ============================================================
-- TimeWiseHub — Schema 103: Video call whiteboard
-- Freeform collaborative drawing scoped to a tutoring session,
-- live or reopened later. Run via Supabase MCP apply_migration
-- (name: whiteboard)
-- ============================================================

create type public.whiteboard_object_type as enum ('text_box', 'stroke', 'sticker');

create table public.whiteboard_objects (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions on delete cascade,
  object_type  public.whiteboard_object_type not null,
  x            numeric(6,5) not null,
  y            numeric(6,5) not null,
  width        numeric(6,5) not null,
  height       numeric(6,5) not null,
  content      jsonb not null,
  created_by   uuid not null references public.profiles on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index whiteboard_objects_scope
  on public.whiteboard_objects (session_id, created_at);

alter table public.whiteboard_objects enable row level security;

-- Resolves access via sessions' own org_id/created_by directly (sessions
-- already carries these, so no topics/subjects hop is needed, unlike
-- can_edit_worksheet), OR via the guest identity tied to the session's
-- client. Mirrors can_edit_worksheet's shape
-- (schema-092-worksheet-annotations.sql) applied to a simpler table.
create or replace function public.can_edit_whiteboard(p_session_id uuid)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_org_id uuid;
  v_created_by uuid;
  v_client_id uuid;
  v_guest_user_id uuid;
begin
  select org_id, created_by, client_id into v_org_id, v_created_by, v_client_id
  from public.sessions where id = p_session_id;

  if v_created_by is null then
    return false;
  end if;

  if v_org_id is not null then
    if exists (
      select 1 from public.organisation_members om
      where om.org_id = v_org_id and om.user_id = auth.uid()
    ) then
      return true;
    end if;
  else
    if v_created_by = auth.uid() then
      return true;
    end if;
  end if;

  select guest_chat_user_id into v_guest_user_id from public.clients where id = v_client_id;
  if v_guest_user_id is not null and v_guest_user_id = auth.uid() then
    return true;
  end if;

  return false;
end;
$$;

create policy "Can view whiteboard objects" on public.whiteboard_objects for select
  using (public.can_edit_whiteboard(session_id));

create policy "Can manage whiteboard objects" on public.whiteboard_objects for all
  using (public.can_edit_whiteboard(session_id))
  with check (public.can_edit_whiteboard(session_id));

-- Storage bucket for ad hoc uploaded stickers. Path convention:
-- {sessionId}/{filename} — lets a storage policy resolve access via
-- can_edit_whiteboard() using the first path segment.
insert into storage.buckets (id, name, public) values ('whiteboard-stickers', 'whiteboard-stickers', false);

create policy "whiteboard-stickers: read with access" on storage.objects for select
  using (
    bucket_id = 'whiteboard-stickers'
    and public.can_edit_whiteboard((storage.foldername(name))[1]::uuid)
  );

create policy "whiteboard-stickers: upload with access" on storage.objects for insert
  with check (
    bucket_id = 'whiteboard-stickers'
    and public.can_edit_whiteboard((storage.foldername(name))[1]::uuid)
  );
