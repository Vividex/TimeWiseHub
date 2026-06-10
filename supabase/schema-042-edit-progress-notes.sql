-- TimeWiseHub — Schema 042: Editable progress notes

create policy "Creator can view own progress notes"
  on public.progress_notes for select
  using (created_by = auth.uid());

create policy "Creator can update own progress notes"
  on public.progress_notes for update
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Org admins can update progress notes"
  on public.progress_notes for update
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = progress_notes.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  )
  with check (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = progress_notes.org_id and om.user_id = auth.uid()
        and om.role in ('owner', 'admin', 'manager')
    )
  );
