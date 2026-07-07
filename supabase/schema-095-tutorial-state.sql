-- ============================================================
-- TimeWiseHub — Schema 095: Hands-on onboarding tutorial state
-- Extends user_onboarding_dismissed (previously just a dismissal
-- flag) into a fuller state row tracking step progress. Same row
-- identity (one per user), RLS unchanged (user_id = auth.uid()
-- already covers every column). Run via Supabase MCP
-- apply_migration (name: tutorial_state)
-- ============================================================

alter table user_onboarding_dismissed
  add column profile_key text,
  add column current_step_index integer not null default 0,
  add column started_at timestamptz,
  add column context jsonb not null default '{}'::jsonb,
  alter column dismissed_at drop not null,
  alter column dismissed_at drop default;

-- Grandfather every existing user so this ships without an unsolicited "Welcome"
-- popup for anyone already using the app — only accounts created after this
-- migration lack a row and are eligible for the automatic Welcome trigger.
insert into user_onboarding_dismissed (user_id, org_id, dismissed_at)
select p.id, om.org_id, now()
from profiles p
left join organisation_members om on om.user_id = p.id
on conflict (user_id) do nothing;
