-- FCM/native push device tokens, separate from push_subscriptions (which is shaped for standard
-- web push -- endpoint/p256dh/auth -- meaningless for FCM's single-token model).
create table push_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  unique (user_id, token)
);

alter table push_device_tokens enable row level security;

create policy "Users can manage their own push device tokens"
  on push_device_tokens for all
  using (auth.uid() = user_id);
