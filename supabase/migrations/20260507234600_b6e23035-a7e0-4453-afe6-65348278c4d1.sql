-- إلغاء الجدولة السابقة إن وُجدت
DO $$
BEGIN
  PERFORM cron.unschedule('daily-indexnow-ping');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'daily-indexnow-ping',
  '0 6 * * *', -- يومياً الساعة 6 صباحاً UTC
  $$
  SELECT net.http_post(
    url := 'https://kotobi.xyz/api/indexnow',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"urls": ["https://kotobi.xyz/", "https://kotobi.xyz/sitemap.xml", "https://kotobi.xyz/categories", "https://kotobi.xyz/authors", "https://kotobi.xyz/quotes"]}'::jsonb
  );
  $$
);