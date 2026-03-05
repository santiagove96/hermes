BEGIN;

-- Public identity fields for onboarding/profile URLs
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS owner_username text,
  ADD COLUMN IF NOT EXISTS owner_full_name text;

CREATE TABLE IF NOT EXISTS public.user_profile_username_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profile_username_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read username aliases" ON public.user_profile_username_aliases;
CREATE POLICY "Public can read username aliases"
  ON public.user_profile_username_aliases FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Users can read own username aliases" ON public.user_profile_username_aliases;
CREATE POLICY "Users can read own username aliases"
  ON public.user_profile_username_aliases FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_username_lower
  ON public.user_profiles ((lower(username)))
  WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_username_aliases_lower
  ON public.user_profile_username_aliases ((lower(username)));

CREATE INDEX IF NOT EXISTS idx_projects_owner_username_slug_published
  ON public.projects (owner_username, slug)
  WHERE published = true;

CREATE INDEX IF NOT EXISTS idx_projects_owner_username_published_at
  ON public.projects (owner_username, published_at DESC)
  WHERE published = true;

CREATE INDEX IF NOT EXISTS idx_projects_user_id_slug_published
  ON public.projects (user_id, slug)
  WHERE published = true;

-- Reserved routes to avoid username conflicts
CREATE OR REPLACE FUNCTION public.is_reserved_username(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_username, '')) = ANY (ARRAY[
    'api','auth','login','signup','projects','project','upgrade','read',
    'reset-password','forgot-password','preview','onboarding','assets','health'
  ]);
$$;

CREATE OR REPLACE FUNCTION public.normalize_username(p_username text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(trim(coalesce(p_username, '')));
$$;

CREATE OR REPLACE FUNCTION public.check_username_availability(p_username text)
RETURNS TABLE(available boolean, reason text, normalized text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username text;
  v_user_id uuid;
BEGIN
  v_username := public.normalize_username(p_username);
  normalized := v_username;

  IF v_username = '' THEN
    RETURN QUERY SELECT false, 'empty', normalized;
    RETURN;
  END IF;

  IF length(v_username) < 3 OR length(v_username) > 30 THEN
    RETURN QUERY SELECT false, 'length', normalized;
    RETURN;
  END IF;

  IF v_username !~ '^[a-z0-9][a-z0-9_-]{2,29}$' THEN
    RETURN QUERY SELECT false, 'format', normalized;
    RETURN;
  END IF;

  IF public.is_reserved_username(v_username) THEN
    RETURN QUERY SELECT false, 'reserved', normalized;
    RETURN;
  END IF;

  SELECT id INTO v_user_id
  FROM public.user_profiles
  WHERE lower(username) = v_username
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'taken', normalized;
    RETURN;
  END IF;

  SELECT user_id INTO v_user_id
  FROM public.user_profile_username_aliases
  WHERE lower(username) = v_username
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    RETURN QUERY SELECT false, 'taken', normalized;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'available', normalized;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_unique_slug_for_user(p_user_id uuid, p_base_slug text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  candidate text;
  suffix integer := 2;
BEGIN
  candidate := coalesce(nullif(trim(p_base_slug), ''), 'untitled');

  WHILE EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.user_id = p_user_id
      AND p.published = true
      AND p.slug = candidate
  ) LOOP
    candidate := p_base_slug || '-' || suffix::text;
    suffix := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_identity(
  p_full_name text,
  p_username text,
  p_mark_completed boolean DEFAULT false
)
RETURNS TABLE(full_name text, username text, onboarding_completed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid;
  v_username text;
  v_prev_username text;
  v_full_name text;
  v_available boolean;
  v_reason text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_full_name := trim(coalesce(p_full_name, ''));
  IF length(v_full_name) < 2 OR length(v_full_name) > 80 THEN
    RAISE EXCEPTION 'Invalid full name';
  END IF;

  v_username := public.normalize_username(p_username);

  SELECT available, reason
  INTO v_available, v_reason
  FROM public.check_username_availability(v_username)
  LIMIT 1;

  SELECT up.username INTO v_prev_username
  FROM public.user_profiles up
  WHERE up.id = v_user_id;

  IF NOT v_available AND lower(coalesce(v_prev_username, '')) <> v_username THEN
    RAISE EXCEPTION 'Username unavailable: %', coalesce(v_reason, 'taken');
  END IF;

  IF v_prev_username IS NOT NULL AND lower(v_prev_username) <> v_username THEN
    INSERT INTO public.user_profile_username_aliases (user_id, username)
    VALUES (v_user_id, v_prev_username)
    ON CONFLICT ((lower(username))) DO NOTHING;
  END IF;

  UPDATE public.user_profiles up
  SET
    full_name = v_full_name,
    username = v_username,
    onboarding_completed_at = CASE
      WHEN p_mark_completed THEN coalesce(up.onboarding_completed_at, now())
      ELSE up.onboarding_completed_at
    END
  WHERE up.id = v_user_id;

  UPDATE public.projects p
  SET
    owner_username = v_username,
    owner_full_name = v_full_name,
    author_name = v_full_name
  WHERE p.user_id = v_user_id
    AND p.published = true;

  RETURN QUERY
  SELECT up.full_name, up.username, up.onboarding_completed_at
  FROM public.user_profiles up
  WHERE up.id = v_user_id;
END;
$$;

-- Public profile fields can be read for routing and metadata
DROP POLICY IF EXISTS "Public can read published profile fields" ON public.user_profiles;
CREATE POLICY "Public can read published profile fields"
  ON public.user_profiles FOR SELECT
  USING (username IS NOT NULL OR full_name IS NOT NULL);

-- Backfill owner fields for already-published projects using current profile values
UPDATE public.projects p
SET
  owner_username = up.username,
  owner_full_name = up.full_name,
  author_name = CASE WHEN coalesce(trim(p.author_name), '') = '' THEN coalesce(up.full_name, p.author_name, '') ELSE p.author_name END
FROM public.user_profiles up
WHERE p.user_id = up.id
  AND p.published = true
  AND (p.owner_username IS NULL OR p.owner_full_name IS NULL);

COMMIT;
