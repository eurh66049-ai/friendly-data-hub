CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_books_pdf_url_trgm ON public.books USING gin (pdf_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_books_cover_url_key_trgm ON public.books USING gin (cover_url_key gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_book_submissions_book_file_url_trgm ON public.book_submissions USING gin (book_file_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_submissions_source_book_file_url_trgm ON public.book_submissions USING gin (source_book_file_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_submissions_cover_image_url_trgm ON public.book_submissions USING gin (cover_image_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_submissions_source_cover_image_url_trgm ON public.book_submissions USING gin (source_cover_image_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_book_submissions_author_image_url_trgm ON public.book_submissions USING gin (author_image_url gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_bulk_upload_queue_book_file_url_trgm ON public.bulk_upload_queue USING gin (book_file_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_bulk_upload_queue_cover_image_url_trgm ON public.bulk_upload_queue USING gin (cover_image_url gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_media_files_file_url_trgm ON public.media_files USING gin (file_url gin_trgm_ops);