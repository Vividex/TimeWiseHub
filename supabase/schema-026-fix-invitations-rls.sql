-- ============================================================
-- TimeWiseHub — Schema 026: Fix invitations RLS
-- Run in Supabase SQL Editor
-- ============================================================

-- Invitation accept pages now use a service-role API lookup by exact token.
-- Authenticated users should not be able to enumerate all invitations.
drop policy if exists "Anyone can read invitation by token" on public.invitations;
