-- Account deactivation: soft-close for an org (owner-only) or a solo user with
-- no org. No data is ever deleted. deactivated_at gates page access via
-- redirects in src/app/dashboard/layout.tsx and src/app/settings/page.tsx —
-- a page-level gate, not an RLS-level one (same limitation the existing
-- setup_completed gate already has; see design doc for why this is fine).
--
-- All writes to deactivated_at go through /api/account/deactivate and
-- /api/account/reactivate using the service-role client after an explicit
-- owner-only check — NOT a direct client .update(), because the existing
-- "Owners and admins can update organisation settings" RLS policy on
-- organisations would otherwise let an admin (not just the owner) flip this
-- flag. The RLS policies below on account_deactivations are defense in
-- depth for a future client-side write path; the app doesn't currently
-- rely on them.

alter table organisations add column if not exists deactivated_at timestamptz;
alter table profiles add column if not exists deactivated_at timestamptz;

create table if not exists account_deactivations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  deactivated_by uuid not null references auth.users(id),
  reason text not null check (reason in ('too_expensive', 'missing_features', 'switched_tools', 'no_longer_needed', 'other')),
  feedback text,
  deactivated_at timestamptz not null default now(),
  reactivated_at timestamptz,
  constraint account_deactivations_one_owner check (
    (org_id is not null and user_id is null) or (org_id is null and user_id is not null)
  )
);

create index if not exists account_deactivations_org_id_idx on account_deactivations(org_id);
create index if not exists account_deactivations_user_id_idx on account_deactivations(user_id);

alter table account_deactivations enable row level security;

create policy "Members can view their account's deactivation history"
  on account_deactivations for select
  using (
    (org_id is not null and is_org_member(org_id))
    or (user_id = auth.uid())
  );

create policy "Owners can record a deactivation"
  on account_deactivations for insert
  with check (
    deactivated_by = auth.uid()
    and (
      (org_id is not null and has_org_role(org_id, ARRAY['owner'::member_role]))
      or (org_id is null and user_id = auth.uid())
    )
  );

create policy "Owners can record a reactivation"
  on account_deactivations for update
  using (
    (org_id is not null and has_org_role(org_id, ARRAY['owner'::member_role]))
    or (org_id is null and user_id = auth.uid())
  )
  with check (
    (org_id is not null and has_org_role(org_id, ARRAY['owner'::member_role]))
    or (org_id is null and user_id = auth.uid())
  );
