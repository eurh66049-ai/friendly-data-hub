-- Helper function: ping IndexNow endpoint via pg_net
CREATE OR REPLACE FUNCTION public.notify_indexnow(p_urls text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://kotobi.xyz/api/indexnow',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('urls', to_jsonb(p_urls))
  );
EXCEPTION WHEN OTHERS THEN
  -- لا نفشل العملية الأصلية إذا فشل ping
  RAISE NOTICE 'IndexNow ping failed: %', SQLERRM;
END;
$$;

-- Trigger: on book approval -> notify IndexNow
CREATE OR REPLACE FUNCTION public.trigger_indexnow_book()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_slug text;
  v_url text;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'approved') THEN
    v_slug := COALESCE(NEW.slug, NEW.id::text);
    v_url := 'https://kotobi.xyz/book/' || v_slug;
    PERFORM public.notify_indexnow(ARRAY[
      v_url,
      'https://kotobi.xyz/',
      'https://kotobi.xyz/sitemap.xml'
    ]);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS book_indexnow_trigger ON public.book_submissions;
CREATE TRIGGER book_indexnow_trigger
AFTER INSERT OR UPDATE OF status ON public.book_submissions
FOR EACH ROW EXECUTE FUNCTION public.trigger_indexnow_book();

-- Trigger: on author insert -> notify IndexNow
CREATE OR REPLACE FUNCTION public.trigger_indexnow_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_path text;
BEGIN
  v_path := COALESCE(NULLIF(NEW.slug, ''), NEW.name);
  IF v_path IS NOT NULL THEN
    PERFORM public.notify_indexnow(ARRAY['https://kotobi.xyz/author/' || v_path]);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS author_indexnow_trigger ON public.authors;
CREATE TRIGGER author_indexnow_trigger
AFTER INSERT ON public.authors
FOR EACH ROW EXECUTE FUNCTION public.trigger_indexnow_author();
