-- supabase/schema-067-purge-strivon-contamination.sql
-- Purge all Strivon contamination from TimeWiseHub's database.
-- A rogue Claude session erroneously deployed Strivon code and migrations
-- to this project. This migration removes all Strivon tables, views,
-- triggers, seed data, and strips the 'coach'/'client' values from the
-- member_role enum.

-- 1. STRIVON VIEWS
DROP VIEW IF EXISTS public.client_14d_avg_calories CASCADE;
DROP VIEW IF EXISTS public.client_14d_avg_steps CASCADE;
DROP VIEW IF EXISTS public.client_14d_bodyweight_trend CASCADE;
DROP VIEW IF EXISTS public.client_latest_metric CASCADE;

-- 2. STRIVON TABLES (CASCADE drops their RLS policies automatically)
DROP TABLE IF EXISTS public.community_comments CASCADE;
DROP TABLE IF EXISTS public.community_posts CASCADE;
DROP TABLE IF EXISTS public.assigned_workout_exercises CASCADE;
DROP TABLE IF EXISTS public.assigned_workouts CASCADE;
DROP TABLE IF EXISTS public.workout_template_exercises CASCADE;
DROP TABLE IF EXISTS public.workout_templates CASCADE;
DROP TABLE IF EXISTS public.coach_exercise_favourites CASCADE;
DROP TABLE IF EXISTS public.client_daily_metrics CASCADE;
DROP TABLE IF EXISTS public.client_targets CASCADE;
DROP TABLE IF EXISTS public.checkins CASCADE;
DROP TABLE IF EXISTS public.coach_notes CASCADE;
DROP TABLE IF EXISTS public.coaching_clients CASCADE;
DROP TABLE IF EXISTS public.exercises CASCADE;
DROP TABLE IF EXISTS public.programs CASCADE;

-- 3. AUTH TRIGGER added by Strivon migrations
DROP TRIGGER IF EXISTS on_auth_user_created_link_coaching_profile ON auth.users;
DROP FUNCTION IF EXISTS public.link_coaching_profile_on_signup();

-- 4. SEED DATA (fake Strivon org + users injected during the incident)
DELETE FROM public.chat_participants WHERE user_id IN ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-000000000c02');
DELETE FROM public.organisation_members WHERE org_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.profiles WHERE id IN ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-000000000c02');
DELETE FROM auth.users WHERE id IN ('00000000-0000-0000-0000-000000000c01','00000000-0000-0000-0000-000000000c02');
DELETE FROM public.organisations WHERE id = '00000000-0000-0000-0000-000000000001';

-- 5. ENUM CLEANUP: remove 'coach' and 'client' values added by Strivon.
--
-- PostgreSQL cannot remove enum values directly; the only way is to create
-- a new enum, convert all columns that use it, drop the old one, then rename.
-- All RLS policies that reference member_role must be dropped first because
-- they store type OIDs internally and block both the column ALTER and the
-- function drop that depends on the old enum signature.

-- 5a. Create the clean target enum
CREATE TYPE public.member_role_v2 AS ENUM ('owner', 'admin', 'manager', 'employee');

-- 5b. Drop every policy that references member_role (across all tables).
--     Strivon table policies are already gone via CASCADE in step 2.
DROP POLICY IF EXISTS "Managers can view org member activity" ON public.activity_log;
DROP POLICY IF EXISTS "Org admins can manage org events" ON public.calendar_events;
DROP POLICY IF EXISTS "managers can insert invitees" ON public.call_invitees;
DROP POLICY IF EXISTS "managers delete org certs" ON public.certifications;
DROP POLICY IF EXISTS "managers insert org certs" ON public.certifications;
DROP POLICY IF EXISTS "managers read org certs" ON public.certifications;
DROP POLICY IF EXISTS "managers update org certs" ON public.certifications;
DROP POLICY IF EXISTS "Delete own messages or moderate channel" ON public.chat_messages;
DROP POLICY IF EXISTS "templates: org admins can manage" ON public.client_session_templates;
DROP POLICY IF EXISTS "Org admins can manage org clients" ON public.clients;
DROP POLICY IF EXISTS "Org admins can manage crew members" ON public.crew_members;
DROP POLICY IF EXISTS "Org admins can manage crews" ON public.crews;
DROP POLICY IF EXISTS "managers delete org docs" ON public.employee_documents;
DROP POLICY IF EXISTS "managers insert org docs" ON public.employee_documents;
DROP POLICY IF EXISTS "managers read org docs" ON public.employee_documents;
DROP POLICY IF EXISTS "managers update any profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "managers upsert any profile" ON public.employee_profiles;
DROP POLICY IF EXISTS "Owners and admins can manage categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Managers can update expense status" ON public.expenses;
DROP POLICY IF EXISTS "Managers can view org expenses" ON public.expenses;
DROP POLICY IF EXISTS "org_financial_read" ON public.income_entries;
DROP POLICY IF EXISTS "Owners and admins can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Owners and admins can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Invoice owners can manage items" ON public.invoice_items;
DROP POLICY IF EXISTS "Org admins can manage org invoices" ON public.invoices;
DROP POLICY IF EXISTS "Managers can manage org leave balances" ON public.leave_balances;
DROP POLICY IF EXISTS "Managers can update org leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "Managers can view org leave requests" ON public.leave_requests;
DROP POLICY IF EXISTS "managers read org availability" ON public.member_availability;
DROP POLICY IF EXISTS "managers write org availability" ON public.member_availability;
DROP POLICY IF EXISTS "Admins can delete org payslips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload org payslips" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view org payslips" ON storage.objects;
DROP POLICY IF EXISTS "Managers can view org receipts" ON storage.objects;
DROP POLICY IF EXISTS "View project document objects (confidential gated)" ON storage.objects;
DROP POLICY IF EXISTS "managers update checklist" ON public.onboarding_checklists;
DROP POLICY IF EXISTS "managers upsert checklist" ON public.onboarding_checklists;
DROP POLICY IF EXISTS "managers read org progress" ON public.onboarding_progress;
DROP POLICY IF EXISTS "managers update org progress" ON public.onboarding_progress;
DROP POLICY IF EXISTS "managers upsert org progress" ON public.onboarding_progress;
DROP POLICY IF EXISTS "Owners and admins can add members" ON public.organisation_members;
DROP POLICY IF EXISTS "Owners and admins can remove members" ON public.organisation_members;
DROP POLICY IF EXISTS "Owners and admins can update members" ON public.organisation_members;
DROP POLICY IF EXISTS "Owners and admins can update organisation settings" ON public.organisations;
DROP POLICY IF EXISTS "org_financial_manage_runs" ON public.pay_runs;
DROP POLICY IF EXISTS "financial_delete" ON public.pay_statements;
DROP POLICY IF EXISTS "financial_insert" ON public.pay_statements;
DROP POLICY IF EXISTS "own_or_financial_read" ON public.pay_statements;
DROP POLICY IF EXISTS "admin_delete" ON public.payslips;
DROP POLICY IF EXISTS "admin_insert" ON public.payslips;
DROP POLICY IF EXISTS "own_or_admin_read" ON public.payslips;
DROP POLICY IF EXISTS "Org admins can insert progress notes" ON public.progress_notes;
DROP POLICY IF EXISTS "Org admins can update progress notes" ON public.progress_notes;
DROP POLICY IF EXISTS "Modify documents (uploader or management)" ON public.project_documents;
DROP POLICY IF EXISTS "Remove documents (uploader or management)" ON public.project_documents;
DROP POLICY IF EXISTS "View documents (confidential gated)" ON public.project_documents;
DROP POLICY IF EXISTS "creator or admin can delete project expenses" ON public.project_expenses;
DROP POLICY IF EXISTS "Project owners and org admins can manage members" ON public.project_members;
DROP POLICY IF EXISTS "Org admins can manage org projects" ON public.projects;
DROP POLICY IF EXISTS "admins manage templates" ON public.roster_shift_templates;
DROP POLICY IF EXISTS "managers read org templates" ON public.roster_shift_templates;
DROP POLICY IF EXISTS "managers delete shifts" ON public.roster_shifts;
DROP POLICY IF EXISTS "managers insert shifts" ON public.roster_shifts;
DROP POLICY IF EXISTS "managers read all org shifts" ON public.roster_shifts;
DROP POLICY IF EXISTS "managers update shifts" ON public.roster_shifts;
DROP POLICY IF EXISTS "managers can manage calls" ON public.scheduled_calls;
DROP POLICY IF EXISTS "session_todos: org admins can manage" ON public.session_todos;
DROP POLICY IF EXISTS "Org admins can manage sessions" ON public.sessions;
DROP POLICY IF EXISTS "Managers can view org member time entries" ON public.time_entries;
DROP POLICY IF EXISTS "Managers can update org member timesheets" ON public.timesheets;
DROP POLICY IF EXISTS "Managers can view org member timesheets" ON public.timesheets;

-- 5c. Drop has_org_role — its signature references the old member_role type,
--     so it must go before the column ALTERs and the DROP TYPE.
DROP FUNCTION IF EXISTS public.has_org_role(uuid, member_role[]);

-- 5d. Convert every column that uses the old enum, then swap the type.
--     Defaults must be dropped first (they embed the old type OID).
ALTER TABLE public.organisation_members ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.organisation_members ALTER COLUMN role TYPE public.member_role_v2 USING role::text::public.member_role_v2;

ALTER TABLE public.invitations ALTER COLUMN role DROP DEFAULT;
ALTER TABLE public.invitations ALTER COLUMN role TYPE public.member_role_v2 USING role::text::public.member_role_v2;

DROP TYPE public.member_role;
ALTER TYPE public.member_role_v2 RENAME TO member_role;

ALTER TABLE public.organisation_members ALTER COLUMN role SET DEFAULT 'employee'::public.member_role;
ALTER TABLE public.invitations ALTER COLUMN role SET DEFAULT 'employee'::public.member_role;

-- 6. RECREATE has_org_role with the clean enum signature
CREATE OR REPLACE FUNCTION public.has_org_role(p_org_id uuid, p_roles public.member_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members om
    WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND om.role = ANY(p_roles)
  );
$$;

-- 7. RECREATE all RLS policies that were dropped in step 5b
CREATE POLICY "Managers can view org member activity" ON public.activity_log FOR SELECT USING (EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = activity_log.user_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Org admins can manage org events" ON public.calendar_events FOR ALL USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = calendar_events.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "managers can insert invitees" ON public.call_invitees FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM scheduled_calls JOIN organisation_members ON organisation_members.org_id = scheduled_calls.org_id WHERE scheduled_calls.id = call_invitees.call_id AND organisation_members.user_id = auth.uid() AND organisation_members.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers read org certs" ON public.certifications FOR SELECT USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers insert org certs" ON public.certifications FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers update org certs" ON public.certifications FOR UPDATE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers delete org certs" ON public.certifications FOR DELETE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Delete own messages or moderate channel" ON public.chat_messages FOR UPDATE USING (sender_id = auth.uid() OR EXISTS (SELECT 1 FROM chat_conversations c JOIN organisation_members om ON om.org_id = c.org_id WHERE c.id = chat_messages.conversation_id AND c.type = 'channel'::chat_conversation_type AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "templates: org admins can manage" ON public.client_session_templates FOR ALL USING (EXISTS (SELECT 1 FROM clients c JOIN organisation_members om ON om.org_id = c.org_id WHERE c.id = client_session_templates.client_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Org admins can manage org clients" ON public.clients FOR ALL USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = clients.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Org admins can manage crew members" ON public.crew_members FOR ALL USING (EXISTS (SELECT 1 FROM crews c JOIN organisation_members om ON om.org_id = c.org_id WHERE c.id = crew_members.crew_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Org admins can manage crews" ON public.crews FOR ALL USING (EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = crews.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "managers read org docs" ON public.employee_documents FOR SELECT USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers insert org docs" ON public.employee_documents FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers delete org docs" ON public.employee_documents FOR DELETE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers upsert any profile" ON public.employee_profiles FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers update any profile" ON public.employee_profiles FOR UPDATE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Owners and admins can manage categories" ON public.expense_categories FOR ALL USING (EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = expense_categories.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Managers can view org expenses" ON public.expenses FOR SELECT USING (EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = expenses.user_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Managers can update expense status" ON public.expenses FOR UPDATE USING (EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = expenses.user_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "org_financial_read" ON public.income_entries FOR SELECT USING (org_id IS NOT NULL AND org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Owners and admins can view invitations" ON public.invitations FOR SELECT USING (EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = invitations.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Owners and admins can create invitations" ON public.invitations FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = invitations.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Invoice owners can manage items" ON public.invoice_items FOR ALL USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_items.invoice_id AND (i.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = i.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])))));
CREATE POLICY "Org admins can manage org invoices" ON public.invoices FOR ALL USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = invoices.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Managers can manage org leave balances" ON public.leave_balances FOR ALL USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = leave_balances.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Managers can view org leave requests" ON public.leave_requests FOR SELECT USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = leave_requests.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Managers can update org leave requests" ON public.leave_requests FOR UPDATE USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = leave_requests.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers read org availability" ON public.member_availability FOR SELECT USING (EXISTS (SELECT 1 FROM organisation_members WHERE org_id = member_availability.org_id AND user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers write org availability" ON public.member_availability FOR ALL USING (EXISTS (SELECT 1 FROM organisation_members WHERE org_id = member_availability.org_id AND user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[]))) WITH CHECK (EXISTS (SELECT 1 FROM organisation_members WHERE org_id = member_availability.org_id AND user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Admins can view org payslips" ON storage.objects FOR SELECT USING (bucket_id = 'payslips' AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON target.org_id = viewer.org_id WHERE viewer.user_id = auth.uid() AND viewer.role = ANY(ARRAY['owner','admin']::member_role[]) AND target.user_id::text = (storage.foldername(objects.name))[1]));
CREATE POLICY "Admins can upload org payslips" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'payslips' AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON target.org_id = viewer.org_id WHERE viewer.user_id = auth.uid() AND viewer.role = ANY(ARRAY['owner','admin']::member_role[]) AND target.user_id::text = (storage.foldername(objects.name))[1]));
CREATE POLICY "Admins can delete org payslips" ON storage.objects FOR DELETE USING (bucket_id = 'payslips' AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON target.org_id = viewer.org_id WHERE viewer.user_id = auth.uid() AND viewer.role = ANY(ARRAY['owner','admin']::member_role[]) AND target.user_id::text = (storage.foldername(objects.name))[1]));
CREATE POLICY "Managers can view org receipts" ON storage.objects FOR SELECT USING (bucket_id = 'receipts' AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN profiles target_profile ON target_profile.id::text = (storage.foldername(objects.name))[1] JOIN organisation_members target ON target.user_id = target_profile.id WHERE viewer.org_id = target.org_id AND viewer.user_id = auth.uid() AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "View project document objects (confidential gated)" ON storage.objects FOR SELECT USING (bucket_id = 'project-documents' AND EXISTS (SELECT 1 FROM project_documents d JOIN projects p ON p.id = d.project_id WHERE d.storage_path = objects.name AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = d.project_id AND pm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())) AND (d.confidential = false OR d.uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])))));
CREATE POLICY "managers upsert checklist" ON public.onboarding_checklists FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers update checklist" ON public.onboarding_checklists FOR UPDATE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers read org progress" ON public.onboarding_progress FOR SELECT USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers upsert org progress" ON public.onboarding_progress FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers update org progress" ON public.onboarding_progress FOR UPDATE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Owners and admins can add members" ON public.organisation_members FOR INSERT WITH CHECK (has_org_role(org_id, ARRAY['owner','admin']::member_role[]));
CREATE POLICY "Owners and admins can remove members" ON public.organisation_members FOR DELETE USING (has_org_role(org_id, ARRAY['owner','admin']::member_role[]));
CREATE POLICY "Owners and admins can update members" ON public.organisation_members FOR UPDATE USING (has_org_role(org_id, ARRAY['owner','admin']::member_role[])) WITH CHECK (has_org_role(org_id, ARRAY['owner','admin']::member_role[]));
CREATE POLICY "Owners and admins can update organisation settings" ON public.organisations FOR UPDATE USING (has_org_role(id, ARRAY['owner','admin']::member_role[])) WITH CHECK (has_org_role(id, ARRAY['owner','admin']::member_role[]));
CREATE POLICY "org_financial_manage_runs" ON public.pay_runs FOR ALL USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[]))) WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "own_or_financial_read" ON public.pay_statements FOR SELECT USING (user_id = auth.uid() OR org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "financial_insert" ON public.pay_statements FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "financial_delete" ON public.pay_statements FOR DELETE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "own_or_admin_read" ON public.payslips FOR SELECT USING (user_id = auth.uid() OR org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "admin_insert" ON public.payslips FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "admin_delete" ON public.payslips FOR DELETE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "Org admins can insert progress notes" ON public.progress_notes FOR INSERT WITH CHECK (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = progress_notes.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Org admins can update progress notes" ON public.progress_notes FOR UPDATE USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = progress_notes.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[]))) WITH CHECK (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = progress_notes.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "View documents (confidential gated)" ON public.project_documents FOR SELECT USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_documents.project_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = project_documents.project_id AND pm.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))) AND (confidential = false OR uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM projects p JOIN organisation_members om ON om.org_id = p.org_id WHERE p.id = project_documents.project_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[]))));
CREATE POLICY "Modify documents (uploader or management)" ON public.project_documents FOR UPDATE USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM projects p JOIN organisation_members om ON om.org_id = p.org_id WHERE p.id = project_documents.project_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[]))) WITH CHECK (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM projects p JOIN organisation_members om ON om.org_id = p.org_id WHERE p.id = project_documents.project_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Remove documents (uploader or management)" ON public.project_documents FOR DELETE USING (uploaded_by = auth.uid() OR EXISTS (SELECT 1 FROM projects p JOIN organisation_members om ON om.org_id = p.org_id WHERE p.id = project_documents.project_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "creator or admin can delete project expenses" ON public.project_expenses FOR DELETE USING (created_by = auth.uid() OR (org_id IS NOT NULL AND org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[]))));
CREATE POLICY "Project owners and org admins can manage members" ON public.project_members FOR ALL USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = project_members.project_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])))));
CREATE POLICY "Org admins can manage org projects" ON public.projects FOR ALL USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = projects.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "admins manage templates" ON public.roster_shift_templates FOR ALL USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[]))) WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin']::member_role[])));
CREATE POLICY "managers read org templates" ON public.roster_shift_templates FOR SELECT USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers read all org shifts" ON public.roster_shifts FOR SELECT USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])) AND deleted_at IS NULL);
CREATE POLICY "managers insert shifts" ON public.roster_shifts FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers update shifts" ON public.roster_shifts FOR UPDATE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers delete shifts" ON public.roster_shifts FOR DELETE USING (org_id IN (SELECT org_id FROM organisation_members WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "managers can manage calls" ON public.scheduled_calls FOR ALL USING (EXISTS (SELECT 1 FROM organisation_members WHERE org_id = scheduled_calls.org_id AND user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[]))) WITH CHECK (EXISTS (SELECT 1 FROM organisation_members WHERE org_id = scheduled_calls.org_id AND user_id = auth.uid() AND role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "session_todos: org admins can manage" ON public.session_todos FOR ALL USING (EXISTS (SELECT 1 FROM sessions s JOIN organisation_members om ON om.org_id = s.org_id WHERE s.id = session_todos.session_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Org admins can manage sessions" ON public.sessions FOR ALL USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members om WHERE om.org_id = sessions.org_id AND om.user_id = auth.uid() AND om.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Managers can view org member time entries" ON public.time_entries FOR SELECT USING (EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = time_entries.user_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Managers can view org member timesheets" ON public.timesheets FOR SELECT USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = timesheets.user_id AND target.org_id = timesheets.org_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
CREATE POLICY "Managers can update org member timesheets" ON public.timesheets FOR UPDATE USING (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = timesheets.user_id AND target.org_id = timesheets.org_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[]))) WITH CHECK (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM organisation_members viewer JOIN organisation_members target ON viewer.org_id = target.org_id WHERE viewer.user_id = auth.uid() AND target.user_id = timesheets.user_id AND target.org_id = timesheets.org_id AND viewer.role = ANY(ARRAY['owner','admin','manager']::member_role[])));
