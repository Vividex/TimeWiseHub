-- supabase/schema-076-video-chat-sessions.sql
-- Video chat in Sessions: link scheduled_calls to a client session, add 1-hour reminder flag

alter table public.scheduled_calls
  add column session_id uuid references public.sessions(id) on delete set null,
  add column reminder_1hour_sent boolean not null default false;

create index scheduled_calls_session on public.scheduled_calls (session_id) where session_id is not null;
