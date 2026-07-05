-- ============================================================
-- TimeWiseHub — Schema 082: Unread client messages
-- Shared org-wide read marker (not per-user) — whoever last viewed a
-- client's Messages page marks it read for the whole team, matching how
-- client_messages itself already treats any org member as having equal
-- access (not just admins/owners).
-- Run via Supabase MCP apply_migration (name: client_messages_unread)
-- ============================================================

alter table public.clients
  add column messages_last_viewed_at timestamptz;

-- No parameters — everything is derived from auth.uid() so this can never be called
-- with a spoofed org/owner id to see another business's unread messages. Mirrors the
-- existing get_chat_unread() function's security pattern exactly.
create or replace function public.get_unread_client_messages()
returns table (client_id uuid, client_name text, preview text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select distinct on (c.id)
    c.id as client_id,
    c.name as client_name,
    cm.body as preview,
    cm.created_at
  from public.clients c
  join public.client_messages cm on cm.client_id = c.id and cm.direction = 'inbound'
  where (
    c.owner_id = auth.uid()
    or (c.org_id is not null and exists (
      select 1 from public.organisation_members om
      where om.org_id = c.org_id and om.user_id = auth.uid()
    ))
  )
    and cm.created_at > coalesce(c.messages_last_viewed_at, '-infinity'::timestamptz)
  order by c.id, cm.created_at desc;
$$;

grant execute on function public.get_unread_client_messages() to authenticated;
