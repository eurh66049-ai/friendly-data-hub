
-- 1) Snapshot table for the home page
CREATE TABLE IF NOT EXISTS public.home_books_cache (
  id uuid PRIMARY KEY,
  title text,
  author text,
  category text,
  cover_image_url text,
  rating numeric,
  views integer,
  created_at timestamptz,
  slug text,
  language text,
  page_count integer,
  book_file_type text,
  display_type text,
  total_reviews bigint DEFAULT 0,
  average_rating numeric DEFAULT 0,
  rating_distribution jsonb DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb,
  shuffle_key double precision NOT NULL DEFAULT random(),
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_books_cache_shuffle ON public.home_books_cache (shuffle_key);
CREATE INDEX IF NOT EXISTS idx_home_books_cache_created ON public.home_books_cache (created_at DESC);

ALTER TABLE public.home_books_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read home books cache" ON public.home_books_cache;
CREATE POLICY "Public read home books cache"
  ON public.home_books_cache FOR SELECT
  USING (true);

-- 2) Refresh function
CREATE OR REPLACE FUNCTION public.refresh_home_books_cache()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  TRUNCATE public.home_books_cache;

  INSERT INTO public.home_books_cache (
    id, title, author, category, cover_image_url, rating, views,
    created_at, slug, language, page_count, book_file_type, display_type,
    total_reviews, average_rating, rating_distribution, shuffle_key
  )
  SELECT
    bs.id,
    bs.title,
    bs.author,
    bs.category,
    bs.cover_image_url,
    COALESCE(bs.rating, 0)::numeric,
    COALESCE(bs.views, 0),
    bs.created_at,
    bs.slug,
    bs.language,
    COALESCE(bs.page_count, 0),
    COALESCE(bs.book_file_type, 'pdf'),
    bs.display_type,
    COALESCE(s.total_reviews, 0),
    COALESCE(s.average_rating, 0),
    COALESCE(s.rating_distribution, '{"1":0,"2":0,"3":0,"4":0,"5":0}'::jsonb),
    random()
  FROM public.book_submissions bs
  LEFT JOIN (
    SELECT
      book_id,
      COUNT(*)::bigint AS total_reviews,
      AVG(rating)::numeric AS average_rating,
      jsonb_build_object(
        '1', COUNT(*) FILTER (WHERE rating = 1),
        '2', COUNT(*) FILTER (WHERE rating = 2),
        '3', COUNT(*) FILTER (WHERE rating = 3),
        '4', COUNT(*) FILTER (WHERE rating = 4),
        '5', COUNT(*) FILTER (WHERE rating = 5)
      ) AS rating_distribution
    FROM public.book_reviews
    GROUP BY book_id
  ) s ON s.book_id = bs.id
  WHERE bs.status = 'approved';
END;
$$;

-- 3) Fast home fetch (books + stats in one shot)
CREATE OR REPLACE FUNCTION public.get_home_books_fast(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0)
RETURNS TABLE (
  id uuid,
  title text,
  author text,
  category text,
  cover_image_url text,
  rating numeric,
  views integer,
  created_at timestamptz,
  slug text,
  language text,
  page_count integer,
  book_file_type text,
  display_type text,
  total_reviews bigint,
  average_rating numeric,
  rating_distribution jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id, title, author, category, cover_image_url, rating, views, created_at,
    slug, language, page_count, book_file_type, display_type,
    total_reviews, average_rating, rating_distribution
  FROM public.home_books_cache
  ORDER BY shuffle_key
  LIMIT p_limit
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_books_fast(integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_home_books_cache() TO service_role;

-- 4) Initial population
SELECT public.refresh_home_books_cache();

-- 5) Schedule refresh every 30 minutes
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('refresh-home-books-cache')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-home-books-cache');
    PERFORM cron.schedule(
      'refresh-home-books-cache',
      '*/30 * * * *',
      $cron$ SELECT public.refresh_home_books_cache(); $cron$
    );
  END IF;
END $$;
