-- ============================================================
-- TimeWiseHub — Schema 008: Projects, tasks, documents
-- Run in Supabase SQL Editor
-- ============================================================


-- ── Project status ───────────────────────────────────────────

create type public.project_status as enum ('active', 'archived');
create type public.task_status   as enum ('todo', 'in_progress', 'done');
create type public.task_priority as enum ('urgent', 'high', 'normal', 'low');


-- ── Projects ─────────────────────────────────────────────────

create table public.projects (
  id          uuid default gen_random_uuid() primary key,
  owner_id    uuid not null references public.profiles on delete cascade,
  org_id      uuid references public.organisations on delete cascade,
  name        text not null,
  description text,
  colour      text not null default '#2563eb',
  due_date    date,
  status      public.project_status not null default 'active',
  created_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

create policy "Owners can manage their own projects"
  on public.projects for all
  using (auth.uid() = owner_id);

create policy "Org members can view org projects"
  on public.projects for select
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = projects.org_id
      and om.user_id = auth.uid()
    )
  );

create policy "Org admins can manage org projects"
  on public.projects for all
  using (
    org_id is not null and
    exists (
      select 1 from public.organisation_members om
      where om.org_id = projects.org_id
      and om.user_id = auth.uid()
      and om.role in ('owner', 'admin')
    )
  );

create index projects_owner on public.projects (owner_id, status);
create index projects_org   on public.projects (org_id, status);


-- ── Project members ──────────────────────────────────────────

create table public.project_members (
  id         uuid default gen_random_uuid() primary key,
  project_id uuid not null references public.projects on delete cascade,
  user_id    uuid not null references public.profiles on delete cascade,
  unique(project_id, user_id)
);

alter table public.project_members enable row level security;

create policy "Project owners and org admins can manage members"
  on public.project_members for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
      and (
        p.owner_id = auth.uid() or
        exists (
          select 1 from public.organisation_members om
          where om.org_id = p.org_id
          and om.user_id = auth.uid()
          and om.role in ('owner', 'admin')
        )
      )
    )
  );

create policy "Members can view project members"
  on public.project_members for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_members.project_id
      and (
        p.owner_id = auth.uid() or
        exists (
          select 1 from public.project_members pm2
          where pm2.project_id = project_members.project_id
          and pm2.user_id = auth.uid()
        )
      )
    )
  );


-- ── Tasks ─────────────────────────────────────────────────────

create table public.tasks (
  id           uuid default gen_random_uuid() primary key,
  project_id   uuid not null references public.projects on delete cascade,
  assignee_id  uuid references public.profiles on delete set null,
  title        text not null,
  notes        text,
  priority     public.task_priority not null default 'normal',
  status       public.task_status not null default 'todo',
  due_date     date,
  completed_at timestamptz,
  created_at   timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "Project members and owners can manage tasks"
  on public.tasks for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = tasks.project_id
      and (
        p.owner_id = auth.uid() or
        exists (
          select 1 from public.project_members pm
          where pm.project_id = tasks.project_id
          and pm.user_id = auth.uid()
        ) or
        exists (
          select 1 from public.organisation_members om
          where om.org_id = p.org_id
          and om.user_id = auth.uid()
        )
      )
    )
  );

create index tasks_project    on public.tasks (project_id, status);
create index tasks_assignee   on public.tasks (assignee_id, status, due_date);
create index tasks_due        on public.tasks (due_date) where status != 'done';


-- ── Project documents ─────────────────────────────────────────

create table public.project_documents (
  id           uuid default gen_random_uuid() primary key,
  project_id   uuid not null references public.projects on delete cascade,
  uploaded_by  uuid not null references public.profiles on delete cascade,
  name         text not null,
  storage_path text not null,
  size_bytes   integer,
  created_at   timestamptz not null default now()
);

alter table public.project_documents enable row level security;

create policy "Project members can manage documents"
  on public.project_documents for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_documents.project_id
      and (
        p.owner_id = auth.uid() or
        exists (
          select 1 from public.project_members pm
          where pm.project_id = project_documents.project_id
          and pm.user_id = auth.uid()
        ) or
        exists (
          select 1 from public.organisation_members om
          where om.org_id = p.org_id
          and om.user_id = auth.uid()
        )
      )
    )
  );
