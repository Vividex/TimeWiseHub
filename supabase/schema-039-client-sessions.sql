-- supabase/schema-039-client-sessions.sql
-- Phase 14: Client sessions, to-do lists, per-client templates, progress notes

-- ── session_status enum ───────────────────────────────────────
create type public.session_status as enum ('scheduled', 'in_progress', 'completed');

-- ── sessions ─────────────────────────────────────────────────
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients on delete cascade,
  org_id           uuid references public.organisations on delete cascade,
  created_by       uuid not null references public.profiles on delete cascade,
  title            text not null,
  scheduled_at     timestamptz not null,
  duration_minutes integer not null default 60,
  notes            text,
  status           public.session_status not null default 'scheduled',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "Org members can view sessions"
  on public.sessions for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = sessions.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage sessions"
  on public.sessions for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = sessions.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Creator can manage own sessions"
  on public.sessions for all
  using (created_by = auth.uid());

create index sessions_client on public.sessions (client_id, scheduled_at);
create index sessions_org    on public.sessions (org_id, scheduled_at);

create or replace function public.touch_session()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger session_updated
  before update on public.sessions
  for each row execute function public.touch_session();

-- ── session_todos ─────────────────────────────────────────────
create table public.session_todos (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions on delete cascade,
  title      text not null,
  completed  boolean not null default false,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.session_todos enable row level security;

create policy "session_todos: org members can select"
  on public.session_todos for select
  using (
    exists (
      select 1 from public.sessions s
      join public.organisation_members om on om.org_id = s.org_id
      where s.id = session_todos.session_id and om.user_id = auth.uid()
    )
  );

create policy "session_todos: org admins can manage"
  on public.session_todos for all
  using (
    exists (
      select 1 from public.sessions s
      join public.organisation_members om on om.org_id = s.org_id
      where s.id = session_todos.session_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "session_todos: creator can manage"
  on public.session_todos for all
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_todos.session_id and s.created_by = auth.uid()
    )
  );

create index session_todos_session on public.session_todos (session_id, position);

-- ── client_session_templates ──────────────────────────────────
create table public.client_session_templates (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients on delete cascade,
  title      text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.client_session_templates enable row level security;

create policy "templates: org members can select"
  on public.client_session_templates for select
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_session_templates.client_id and om.user_id = auth.uid()
    )
  );

create policy "templates: org admins can manage"
  on public.client_session_templates for all
  using (
    exists (
      select 1 from public.clients c
      join public.organisation_members om on om.org_id = c.org_id
      where c.id = client_session_templates.client_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "templates: client owner can manage"
  on public.client_session_templates for all
  using (
    exists (
      select 1 from public.clients c
      where c.id = client_session_templates.client_id and c.owner_id = auth.uid()
    )
  );

create index templates_client on public.client_session_templates (client_id, position);

-- ── progress_notes (append-only) ─────────────────────────────
create table public.progress_notes (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.clients on delete cascade,
  org_id     uuid references public.organisations on delete cascade,
  created_by uuid not null references public.profiles on delete cascade,
  body       text not null,
  created_at timestamptz not null default now()
);

alter table public.progress_notes enable row level security;

create policy "Org members can view progress notes"
  on public.progress_notes for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = progress_notes.org_id and om.user_id = auth.uid()
    )
  );

create policy "Org admins can insert progress notes"
  on public.progress_notes for insert
  with check (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = progress_notes.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );

create policy "Creator can insert own notes"
  on public.progress_notes for insert
  with check (created_by = auth.uid());

create index progress_notes_client on public.progress_notes (client_id, created_at desc);
create index progress_notes_org    on public.progress_notes (org_id);
