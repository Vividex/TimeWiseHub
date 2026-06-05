-- Support requests submitted via the in-app assistant
create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  description text not null,
  conversation_context jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.support_requests enable row level security;

create policy "users can submit their own support requests"
  on public.support_requests for insert
  to authenticated
  with check (auth.uid() = user_id);
