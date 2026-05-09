
-- Unique index so backfill / trigger can ON CONFLICT safely
CREATE UNIQUE INDEX IF NOT EXISTS uniq_text_extraction_queue_book_id
ON public.text_extraction_queue(book_id);

-- Trigger function: enqueue when a submission becomes approved
CREATE OR REPLACE FUNCTION public.enqueue_text_extraction_on_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.text_extraction_queue (book_id, status, attempts)
    VALUES (NEW.id, 'pending', 0)
    ON CONFLICT (book_id) DO UPDATE
      SET status = 'pending',
          attempts = 0,
          last_error = NULL,
          started_at = NULL,
          finished_at = NULL,
          updated_at = now()
      WHERE public.text_extraction_queue.status <> 'completed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_text_extraction_on_approval_ins ON public.book_submissions;
CREATE TRIGGER trg_enqueue_text_extraction_on_approval_ins
AFTER INSERT ON public.book_submissions
FOR EACH ROW EXECUTE FUNCTION public.enqueue_text_extraction_on_approval();

DROP TRIGGER IF EXISTS trg_enqueue_text_extraction_on_approval_upd ON public.book_submissions;
CREATE TRIGGER trg_enqueue_text_extraction_on_approval_upd
AFTER UPDATE OF status ON public.book_submissions
FOR EACH ROW EXECUTE FUNCTION public.enqueue_text_extraction_on_approval();

-- Reset stuck/failed entries
UPDATE public.text_extraction_queue
SET status = 'pending', attempts = 0, last_error = NULL,
    started_at = NULL, finished_at = NULL, updated_at = now()
WHERE status = 'failed' OR (status = 'pending' AND attempts >= 5);

-- Backfill: enqueue every approved book that lacks extracted text and is not already queued
INSERT INTO public.text_extraction_queue (book_id, status, attempts)
SELECT ab.id, 'pending', 0
FROM public.approved_books ab
WHERE NOT EXISTS (SELECT 1 FROM public.book_extracted_text bet WHERE bet.book_id = ab.id)
ON CONFLICT (book_id) DO NOTHING;
