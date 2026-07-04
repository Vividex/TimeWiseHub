-- ============================================================
-- TimeWiseHub — Schema 081: Client email messaging
-- One running email thread per client, no client account needed — outbound
-- messages are logged when sent; inbound replies are logged by a webhook
-- using the service role (bypasses RLS, matching how other service-role-only
-- inbound integrations already work in this codebase).
-- org_id is nullable — clients.org_id is nullable too (solo Pro users have
-- clients with no org), so RLS mirrors the existing dual org-member-or-owner
-- pattern already used on the clients and sessions tables.
-- Run via Supabase MCP apply_migration (name: client_messages)
-- ============================================================

create table public.client_messages (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.clients on delete cascade,
  org_id         uuid references public.organisations on delete cascade,
  direction      text not null check (direction in ('outbound', 'inbound')),
  body           text not null,
  sender_user_id uuid references public.profiles on delete set null,
  created_at     timestamptz not null default now()
);

create index client_messages_client on public.client_messages (client_id, created_at);

alter table public.client_messages enable row level security;

create policy "client_messages: org members view"
  on public.client_messages for select
  using (
    org_id is not null and exists (
      select 1 from public.organisation_members om
      where om.org_id = client_messages.org_id and om.user_id = auth.uid()
    )
  );

create policy "client_messages: org members insert"
  on public.client_messages for insert
  with check (
    org_id is not null and exists (
      select 1 from public.organisation_members om
      where om.org_id = client_messages.org_id and om.user_id = auth.uid()
    )
    and sender_user_id = auth.uid()
  );

create policy "client_messages: owner view"
  on public.client_messages for select
  using (
    org_id is null and exists (
      select 1 from public.clients c
      where c.id = client_messages.client_id and c.owner_id = auth.uid()
    )
  );

create policy "client_messages: owner insert"
  on public.client_messages for insert
  with check (
    org_id is null and exists (
      select 1 from public.clients c
      where c.id = client_messages.client_id and c.owner_id = auth.uid()
    )
    and sender_user_id = auth.uid()
  );
