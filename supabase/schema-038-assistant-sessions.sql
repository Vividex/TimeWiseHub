-- supabase/schema-038-assistant-sessions.sql
-- Assistant conversation sessions for the full-page view.
-- The floating widget uses ephemeral React state (no DB).

create table public.assistant_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  title      text,
  messages   jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assistant_sessions enable row level security;

create policy "Users own their sessions"
  on public.assistant_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index assistant_sessions_user on public.assistant_sessions (user_id, updated_at desc);

-- Auto-update updated_at
create or replace function public.touch_assistant_session()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger assistant_session_updated
  before update on public.assistant_sessions
  for each row execute function public.touch_assistant_session();
