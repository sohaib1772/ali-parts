-- Migration: Enable realtime publication and full replica identity on public.banners
-- Allows clients to receive instant live notifications when banners are created, updated, or deleted.

ALTER TABLE public.banners REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'banners'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.banners;
  END IF;
END $$;

-- Ensure read access for public and authenticated users
GRANT SELECT ON public.banners TO anon, authenticated;

-- Ensure image_url can be empty or null for video-only banners
ALTER TABLE public.banners ALTER COLUMN image_url DROP NOT NULL;
