-- Hermes initial schema
-- Tables: projects, brain_dumps, interviews, drafts, feedback, assistant_conversations

-- ============================================================
-- projects
-- ============================================================
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  status      text not null default 'interview'
                check (status in ('interview','draft','rewriting','feedback','complete')),
  content     text not null default '',
  highlights  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index projects_user_id_idx on public.projects(user_id);

alter table public.projects enable row level security;

create policy "Users can read own projects"
  on public.projects for select
  using (auth.uid() = user_id);

create policy "Users can insert own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

create policy "Users can update own projects"
  on public.projects for update
  using (auth.uid() = user_id);

create policy "Users can delete own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ============================================================
-- brain_dumps
-- ============================================================
create table public.brain_dumps (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  content      text not null default '',
  prior_essays jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index brain_dumps_project_id_idx on public.brain_dumps(project_id);

alter table public.brain_dumps enable row level security;

create policy "Users can read own brain_dumps"
  on public.brain_dumps for select
  using (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own brain_dumps"
  on public.brain_dumps for insert
  with check (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own brain_dumps"
  on public.brain_dumps for update
  using (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own brain_dumps"
  on public.brain_dumps for delete
  using (exists (
    select 1 from public.projects where projects.id = brain_dumps.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- interviews
-- ============================================================
create table public.interviews (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  messages    jsonb not null default '[]'::jsonb,
  outline     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index interviews_project_id_idx on public.interviews(project_id);

alter table public.interviews enable row level security;

create policy "Users can read own interviews"
  on public.interviews for select
  using (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own interviews"
  on public.interviews for insert
  with check (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own interviews"
  on public.interviews for update
  using (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own interviews"
  on public.interviews for delete
  using (exists (
    select 1 from public.projects where projects.id = interviews.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- drafts
-- ============================================================
create table public.drafts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  version     integer not null default 1,
  skeleton    text not null default '',
  rewrite     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index drafts_project_id_idx on public.drafts(project_id);

alter table public.drafts enable row level security;

create policy "Users can read own drafts"
  on public.drafts for select
  using (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own drafts"
  on public.drafts for insert
  with check (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own drafts"
  on public.drafts for update
  using (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own drafts"
  on public.drafts for delete
  using (exists (
    select 1 from public.projects where projects.id = drafts.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- feedback
-- ============================================================
create table public.feedback (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  draft_id    uuid references public.drafts(id) on delete set null,
  content     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index feedback_project_id_idx on public.feedback(project_id);

alter table public.feedback enable row level security;

create policy "Users can read own feedback"
  on public.feedback for select
  using (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own feedback"
  on public.feedback for update
  using (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own feedback"
  on public.feedback for delete
  using (exists (
    select 1 from public.projects where projects.id = feedback.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- assistant_conversations
-- ============================================================
create table public.assistant_conversations (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null unique references public.projects(id) on delete cascade,
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.assistant_conversations enable row level security;

create policy "Users can read own assistant_conversations"
  on public.assistant_conversations for select
  using (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can insert own assistant_conversations"
  on public.assistant_conversations for insert
  with check (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can update own assistant_conversations"
  on public.assistant_conversations for update
  using (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

create policy "Users can delete own assistant_conversations"
  on public.assistant_conversations for delete
  using (exists (
    select 1 from public.projects where projects.id = assistant_conversations.project_id and projects.user_id = auth.uid()
  ));

-- ============================================================
-- updated_at trigger
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

create trigger brain_dumps_updated_at
  before update on public.brain_dumps
  for each row execute function public.set_updated_at();

create trigger interviews_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

create trigger drafts_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();

create trigger feedback_updated_at
  before update on public.feedback
  for each row execute function public.set_updated_at();

create trigger assistant_conversations_updated_at
  before update on public.assistant_conversations
  for each row execute function public.set_updated_at();
ALTER TABLE public.projects
  ADD COLUMN pages jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Add publishing support to projects table

ALTER TABLE public.projects
  ADD COLUMN published boolean NOT NULL DEFAULT false,
  ADD COLUMN short_id text,
  ADD COLUMN slug text,
  ADD COLUMN author_name text NOT NULL DEFAULT '',
  ADD COLUMN published_tabs text[] DEFAULT '{}',
  ADD COLUMN published_at timestamptz;

-- Partial unique index: only enforce uniqueness on non-null short_id values
CREATE UNIQUE INDEX idx_projects_short_id ON public.projects (short_id) WHERE short_id IS NOT NULL;

-- Allow anyone to read published projects (OR-combines with existing owner-scoped SELECT policy)
CREATE POLICY "Anyone can read published projects"
  ON public.projects FOR SELECT
  USING (published = true);
-- Invite codes table for beta gating
CREATE TABLE public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 25,
  current_uses INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS policies — only the server (service key) accesses this table
ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

-- Atomic: increment usage only if under the limit, returns true/false
CREATE OR REPLACE FUNCTION public.use_invite_code(code_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invite_codes
  SET current_uses = current_uses + 1
  WHERE code = code_input AND current_uses < max_uses;

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Rollback: decrement usage (used when user creation fails after code was consumed)
CREATE OR REPLACE FUNCTION public.rollback_invite_code(code_input TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.invite_codes
  SET current_uses = GREATEST(current_uses - 1, 0)
  WHERE code = code_input;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Seed initial invite code
INSERT INTO public.invite_codes (code, max_uses) VALUES ('HERMES-BETA-2026', 25);
-- Add optional subtitle field to projects
ALTER TABLE projects ADD COLUMN subtitle text DEFAULT '';
-- Add published_pages column to store a frozen snapshot of content at publish time.
-- Readers see published_pages instead of live-editing pages.

ALTER TABLE projects ADD COLUMN published_pages JSONB DEFAULT '{}';

-- Backfill: copy current pages into published_pages for already-published projects
-- so existing published essays continue to work.
UPDATE projects SET published_pages = pages WHERE published = true;
-- Subscription & usage tables for Free/Pro pricing
-- Tables: user_profiles, message_usage, processed_stripe_events

-- ============================================================
-- user_profiles
-- ============================================================
create table public.user_profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  plan                    text not null default 'free' check (plan in ('free', 'pro')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  subscription_status     text not null default 'none'
                            check (subscription_status in ('none', 'active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired')),
  billing_cycle_anchor    timestamptz,
  cancel_at_period_end    boolean not null default false,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

-- Server uses service key for writes — no insert/update policies needed

-- Reuse set_updated_at trigger from 00001
create trigger user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on new user signup
create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_user_profile();

-- Backfill existing users
insert into public.user_profiles (id)
  select id from auth.users
  on conflict do nothing;

-- ============================================================
-- message_usage
-- ============================================================
create table public.message_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index message_usage_user_date_idx on public.message_usage(user_id, created_at);

alter table public.message_usage enable row level security;

create policy "Users can read own usage"
  on public.message_usage for select
  using (auth.uid() = user_id);

-- ============================================================
-- processed_stripe_events (idempotency)
-- ============================================================
create table public.processed_stripe_events (
  event_id      text primary key,
  event_type    text not null,
  processed_at  timestamptz not null default now()
);

create index processed_stripe_events_processed_at_idx
  on public.processed_stripe_events(processed_at);

alter table public.processed_stripe_events enable row level security;
-- No policies — server-only via service key

-- ============================================================
-- Helper functions for usage counting
-- ============================================================

-- Count messages sent by a user on a specific date (UTC)
create or replace function public.count_daily_messages(p_user_id uuid, p_date date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.message_usage
  where user_id = p_user_id
    and created_at >= p_date::timestamptz
    and created_at < (p_date + interval '1 day')::timestamptz;
$$;

-- Count messages sent by a user since a billing period start
create or replace function public.count_period_messages(p_user_id uuid, p_period_start timestamptz)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.message_usage
  where user_id = p_user_id
    and created_at >= p_period_start;
$$;
-- User-configurable MCP servers (beta feature)
-- Each user can register up to 10 external MCP servers (HTTP only)

create table public.user_mcp_servers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  url         text not null,
  headers     jsonb not null default '{}',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_mcp_servers_name_check check (name ~ '^[a-z0-9][a-z0-9-]{0,29}$'),
  constraint user_mcp_servers_url_length check (length(url) <= 512),
  unique (user_id, name)
);

create index user_mcp_servers_user_id_idx on public.user_mcp_servers(user_id);

alter table public.user_mcp_servers enable row level security;

create policy "Users can read own mcp servers"
  on public.user_mcp_servers for select
  using (auth.uid() = user_id);

-- Reuse set_updated_at trigger from 00001
create trigger user_mcp_servers_updated_at
  before update on public.user_mcp_servers
  for each row execute function public.set_updated_at();
-- Migration: Security & Performance Hardening
-- Applied: 2026-02-18 to staging (jrqajnmudggfyghmyrun) and production (oddczcritnsiahruqqaw)
-- Note: Production was applied with adapted SQL (different policy names, feedback joins
--   through drafts, assistant_conversations uses single ALL policy, extra
--   public.update_updated_at_column function). This file reflects staging schema.
-- Fixes:
--   1. Pin search_path on public functions (prevents search_path injection)
--   2. Wrap auth.uid() in (select ...) in all RLS policies (InitPlan optimization)
--   3. Add missing index on message_usage.project_id

BEGIN;

-- =============================================================================
-- 1. Pin function search paths
-- =============================================================================

-- set_updated_at() — trigger function, no SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = ''
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

-- use_invite_code(text) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.use_invite_code(code_input text)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.invite_codes
  SET current_uses = current_uses + 1
  WHERE code = code_input AND current_uses < max_uses;
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count > 0;
END;
$function$;

-- rollback_invite_code(text) — SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.rollback_invite_code(code_input text)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $function$
BEGIN
  UPDATE public.invite_codes
  SET current_uses = GREATEST(current_uses - 1, 0)
  WHERE code = code_input;
END;
$function$;

-- =============================================================================
-- 2. Wrap auth.uid() in (select auth.uid()) for RLS InitPlan optimization
-- =============================================================================

-- ---- projects ----

DROP POLICY "Users can read own projects" ON public.projects;
CREATE POLICY "Users can read own projects" ON public.projects
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY "Users can insert own projects" ON public.projects;
CREATE POLICY "Users can insert own projects" ON public.projects
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Users can update own projects" ON public.projects;
CREATE POLICY "Users can update own projects" ON public.projects
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY "Users can delete own projects" ON public.projects;
CREATE POLICY "Users can delete own projects" ON public.projects
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ---- brain_dumps ----

DROP POLICY "Users can read own brain_dumps" ON public.brain_dumps;
CREATE POLICY "Users can read own brain_dumps" ON public.brain_dumps
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = brain_dumps.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can insert own brain_dumps" ON public.brain_dumps;
CREATE POLICY "Users can insert own brain_dumps" ON public.brain_dumps
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = brain_dumps.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can update own brain_dumps" ON public.brain_dumps;
CREATE POLICY "Users can update own brain_dumps" ON public.brain_dumps
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = brain_dumps.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can delete own brain_dumps" ON public.brain_dumps;
CREATE POLICY "Users can delete own brain_dumps" ON public.brain_dumps
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = brain_dumps.project_id
      AND projects.user_id = (select auth.uid())
  ));

-- ---- interviews ----

DROP POLICY "Users can read own interviews" ON public.interviews;
CREATE POLICY "Users can read own interviews" ON public.interviews
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = interviews.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can insert own interviews" ON public.interviews;
CREATE POLICY "Users can insert own interviews" ON public.interviews
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = interviews.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can update own interviews" ON public.interviews;
CREATE POLICY "Users can update own interviews" ON public.interviews
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = interviews.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can delete own interviews" ON public.interviews;
CREATE POLICY "Users can delete own interviews" ON public.interviews
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = interviews.project_id
      AND projects.user_id = (select auth.uid())
  ));

-- ---- drafts ----

DROP POLICY "Users can read own drafts" ON public.drafts;
CREATE POLICY "Users can read own drafts" ON public.drafts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = drafts.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can insert own drafts" ON public.drafts;
CREATE POLICY "Users can insert own drafts" ON public.drafts
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = drafts.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can update own drafts" ON public.drafts;
CREATE POLICY "Users can update own drafts" ON public.drafts
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = drafts.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can delete own drafts" ON public.drafts;
CREATE POLICY "Users can delete own drafts" ON public.drafts
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = drafts.project_id
      AND projects.user_id = (select auth.uid())
  ));

-- ---- feedback ----

DROP POLICY "Users can read own feedback" ON public.feedback;
CREATE POLICY "Users can read own feedback" ON public.feedback
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = feedback.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can insert own feedback" ON public.feedback;
CREATE POLICY "Users can insert own feedback" ON public.feedback
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = feedback.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can update own feedback" ON public.feedback;
CREATE POLICY "Users can update own feedback" ON public.feedback
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = feedback.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can delete own feedback" ON public.feedback;
CREATE POLICY "Users can delete own feedback" ON public.feedback
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = feedback.project_id
      AND projects.user_id = (select auth.uid())
  ));

-- ---- assistant_conversations ----

DROP POLICY "Users can read own assistant_conversations" ON public.assistant_conversations;
CREATE POLICY "Users can read own assistant_conversations" ON public.assistant_conversations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = assistant_conversations.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can insert own assistant_conversations" ON public.assistant_conversations;
CREATE POLICY "Users can insert own assistant_conversations" ON public.assistant_conversations
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = assistant_conversations.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can update own assistant_conversations" ON public.assistant_conversations;
CREATE POLICY "Users can update own assistant_conversations" ON public.assistant_conversations
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = assistant_conversations.project_id
      AND projects.user_id = (select auth.uid())
  ));

DROP POLICY "Users can delete own assistant_conversations" ON public.assistant_conversations;
CREATE POLICY "Users can delete own assistant_conversations" ON public.assistant_conversations
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = assistant_conversations.project_id
      AND projects.user_id = (select auth.uid())
  ));

-- ---- user_profiles ----

DROP POLICY "Users can read own profile" ON public.user_profiles;
CREATE POLICY "Users can read own profile" ON public.user_profiles
  FOR SELECT USING ((select auth.uid()) = id);

-- ---- message_usage ----

DROP POLICY "Users can read own usage" ON public.message_usage;
CREATE POLICY "Users can read own usage" ON public.message_usage
  FOR SELECT USING ((select auth.uid()) = user_id);

-- ---- user_mcp_servers ----

DROP POLICY "Users can read own mcp servers" ON public.user_mcp_servers;
CREATE POLICY "Users can read own mcp servers" ON public.user_mcp_servers
  FOR SELECT USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 3. Add missing index on message_usage.project_id
-- =============================================================================

CREATE INDEX IF NOT EXISTS message_usage_project_id_idx
  ON public.message_usage (project_id);

COMMIT;
-- 00009_audit_remediation.sql
-- Audit remediation: atomic highlights, RLS policies, invite code generation

-- 5A: Atomic highlights append RPC
-- Replaces the read-modify-write pattern with a single atomic JSONB append.
-- Caps highlights at 200 per project and verifies project ownership.
create or replace function public.append_highlights(
  p_project_id uuid,
  p_user_id uuid,
  p_new_highlights jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_existing jsonb;
  v_merged jsonb;
begin
  -- Verify project ownership
  select user_id, coalesce(highlights, '[]'::jsonb)
    into v_owner_id, v_existing
    from public.projects
    where id = p_project_id
    for update;

  if v_owner_id is null or v_owner_id != p_user_id then
    raise exception 'Project not found or not owned by user';
  end if;

  -- Append new highlights and cap at 200
  v_merged := v_existing || p_new_highlights;
  if jsonb_array_length(v_merged) > 200 then
    -- Keep the last 200 highlights (most recent)
    v_merged := (
      select jsonb_agg(elem)
      from (
        select elem
        from jsonb_array_elements(v_merged) as elem
        order by elem->>'id' desc
        limit 200
      ) sub
    );
  end if;

  update public.projects
    set highlights = v_merged
    where id = p_project_id;
end;
$$;

-- 5B: RLS write policies on user_mcp_servers
-- Ensures users can only insert/update/delete their own MCP server configs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'user_mcp_servers' and policyname = 'Users can insert own MCP servers'
  ) then
    create policy "Users can insert own MCP servers"
      on public.user_mcp_servers
      for insert
      to authenticated
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'user_mcp_servers' and policyname = 'Users can update own MCP servers'
  ) then
    create policy "Users can update own MCP servers"
      on public.user_mcp_servers
      for update
      to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'user_mcp_servers' and policyname = 'Users can delete own MCP servers'
  ) then
    create policy "Users can delete own MCP servers"
      on public.user_mcp_servers
      for delete
      to authenticated
      using ((select auth.uid()) = user_id);
  end if;
end
$$;

-- 5C: Random invite code generator
create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select encode(gen_random_bytes(6), 'hex');
$$;
BEGIN;

-- Extend invite_codes: null = standard, non-null = trial (number of days)
ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS trial_days INTEGER;

-- Track trial expiry per user: null = no trial, future = active, past = expired
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;

-- New version of use_invite_code that returns trial_days info.
-- Returns -1 when invalid/exhausted, 0 when standard, N>0 when trial.
CREATE OR REPLACE FUNCTION public.use_invite_code_v2(code_input TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_trial_days INTEGER;
  updated_count INTEGER;
BEGIN
  UPDATE public.invite_codes
  SET current_uses = current_uses + 1
  WHERE code = code_input AND current_uses < max_uses
  RETURNING trial_days INTO v_trial_days;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RETURN -1;
  END IF;

  RETURN COALESCE(v_trial_days, 0);
END;
$$;

COMMIT;

-- NOTE: Trial invite code should be inserted manually via Supabase SQL editor:
--   INSERT INTO public.invite_codes (code, max_uses, trial_days)
--     VALUES ('your-secret-trial-code', 50, 30);
-- Do NOT add real codes here — this is an open-source repo.


-- 00012_add_analyze_usage.sql
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
