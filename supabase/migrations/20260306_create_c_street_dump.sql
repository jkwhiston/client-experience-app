create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.task_dump_tasks (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'done')),
  column_order integer not null default 0,
  priority_flag text not null default 'none'
    check (priority_flag in ('none', 'low', 'medium', 'high')),
  due_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_dump_tasks_content_check
    check (
      coalesce(nullif(btrim(title), ''), nullif(btrim(body), '')) is not null
    )
);

create table if not exists public.task_dump_task_workspace_blocks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task_dump_tasks(id) on delete cascade,
  label text,
  content text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_dump_task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.task_dump_tasks(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  media_kind text not null
    check (media_kind in ('image', 'audio', 'video', 'file')),
  created_at timestamptz not null default now()
);

create table if not exists public.task_dump_thoughts (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text not null default '',
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_dump_thoughts_content_check
    check (
      coalesce(nullif(btrim(title), ''), nullif(btrim(content), '')) is not null
    )
);

create table if not exists public.task_dump_thought_attachments (
  id uuid primary key default gen_random_uuid(),
  thought_id uuid not null references public.task_dump_thoughts(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint,
  media_kind text not null
    check (media_kind in ('image', 'audio', 'video', 'file')),
  created_at timestamptz not null default now()
);

create index if not exists task_dump_tasks_status_order_idx
  on public.task_dump_tasks (status, column_order)
  where deleted_at is null;

create index if not exists task_dump_tasks_deleted_idx
  on public.task_dump_tasks (deleted_at);

create index if not exists task_dump_blocks_task_order_idx
  on public.task_dump_task_workspace_blocks (task_id, sort_order);

create index if not exists task_dump_thoughts_order_idx
  on public.task_dump_thoughts (sort_order)
  where deleted_at is null;

create index if not exists task_dump_thoughts_deleted_idx
  on public.task_dump_thoughts (deleted_at);

create index if not exists task_dump_task_attachments_task_idx
  on public.task_dump_task_attachments (task_id, created_at);

create index if not exists task_dump_thought_attachments_thought_idx
  on public.task_dump_thought_attachments (thought_id, created_at);

drop trigger if exists task_dump_tasks_set_updated_at on public.task_dump_tasks;
create trigger task_dump_tasks_set_updated_at
before update on public.task_dump_tasks
for each row
execute function public.set_updated_at();

drop trigger if exists task_dump_task_workspace_blocks_set_updated_at on public.task_dump_task_workspace_blocks;
create trigger task_dump_task_workspace_blocks_set_updated_at
before update on public.task_dump_task_workspace_blocks
for each row
execute function public.set_updated_at();

drop trigger if exists task_dump_thoughts_set_updated_at on public.task_dump_thoughts;
create trigger task_dump_thoughts_set_updated_at
before update on public.task_dump_thoughts
for each row
execute function public.set_updated_at();

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'c-street-dump',
  'c-street-dump',
  true,
  52428800,
  array[
    'image/*',
    'audio/*',
    'video/*',
    'application/pdf',
    'application/zip',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'c_street_dump_select'
  ) then
    create policy c_street_dump_select
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'c-street-dump');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'c_street_dump_insert'
  ) then
    create policy c_street_dump_insert
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'c-street-dump');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'c_street_dump_update'
  ) then
    create policy c_street_dump_update
      on storage.objects
      for update
      to anon, authenticated
      using (bucket_id = 'c-street-dump')
      with check (bucket_id = 'c-street-dump');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'c_street_dump_delete'
  ) then
    create policy c_street_dump_delete
      on storage.objects
      for delete
      to anon, authenticated
      using (bucket_id = 'c-street-dump');
  end if;
end
$$;
