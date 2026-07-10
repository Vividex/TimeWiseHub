-- Fix onboarding: new users could never create an organisation.
--
-- Bug 1: `organisations` had no INSERT policy at all (RLS default-denies
-- with no matching policy -> 403 for everyone).
-- Bug 2: `organisation_members` had an INSERT policy that required the
-- inserting user to already be owner/admin of that org -- impossible for
-- the very first member of a brand-new org.
-- Bug 3: the app's onboarding insert chains `.select().single()`, which
-- makes PostgREST perform `INSERT ... RETURNING`. Postgres additionally
-- enforces the SELECT policy on the returned row, and a freshly-created org
-- has zero members yet, so the existing `is_org_member(id)` SELECT policy
-- correctly (but unhelpfully) denied it, surfacing as the same RLS error.
--
-- Fix: allow any authenticated user to create an organisation; let a
-- zero-member org be visible (bootstrap window only, closes the instant a
-- membership row exists); and add a second, additive INSERT policy on
-- organisation_members letting a user insert themselves as 'owner' only
-- when the org currently has zero members. The existing owner/admin-adds-
-- others policy is untouched -- Postgres OR's multiple permissive policies
-- together for the same command.

create policy "Authenticated users can create organisations"
  on organisations for insert
  to authenticated
  with check (true);

create policy "New organisations are visible until they have a member"
  on organisations for select
  to authenticated
  using (
    not exists (select 1 from organisation_members om where om.org_id = organisations.id)
  );

create policy "Users can bootstrap themselves as owner of a new organisation"
  on organisation_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and not exists (
      select 1 from organisation_members om where om.org_id = organisation_members.org_id
    )
  );
