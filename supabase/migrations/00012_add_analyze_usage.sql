create table if not exists public.analyze_usage (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  level text not null check (level in ('curioso', 'comprometido', 'exigente')),
  created_at timestamptz not null default now()
);

create index if not exists analyze_usage_user_created_idx
  on public.analyze_usage (user_id, created_at desc);

alter table public.analyze_usage enable row level security;
