create table if not exists public.flashcards (
  project_id uuid primary key references public.projects(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flashcards enable row level security;

-- Reuse set_updated_at trigger from 00001
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'flashcards_updated_at'
  ) THEN
    CREATE TRIGGER flashcards_updated_at
      BEFORE UPDATE ON public.flashcards
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;
