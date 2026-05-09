CREATE OR REPLACE FUNCTION public.get_book_details(p_book_id text)
 RETURNS TABLE(id uuid, user_id uuid, title text, subtitle text, author text, author_bio text, author_image_url text, category text, publisher text, translator text, description text, publication_year integer, page_count integer, language text, display_type text, cover_image_url text, book_file_url text, file_type text, file_size bigint, file_metadata jsonb, rights_confirmation boolean, created_at timestamp with time zone, reviewed_at timestamp with time zone, user_email text, processing_status text, views integer, rating numeric, slug text, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    bs.id, bs.user_id, bs.title, bs.subtitle, bs.author, bs.author_bio,
    bs.author_image_url, bs.category, bs.publisher, bs.translator,
    bs.description, bs.publication_year, bs.page_count, bs.language,
    bs.display_type, bs.cover_image_url, bs.book_file_url, bs.file_type,
    bs.file_size, bs.file_metadata, bs.rights_confirmation, bs.created_at,
    bs.reviewed_at, bs.user_email, bs.processing_status, bs.views,
    bs.rating, bs.slug, true as is_active
  FROM book_submissions bs
  WHERE (
      bs.slug = p_book_id
      OR bs.id::text = p_book_id
      OR lower(replace(bs.slug, '-', '')) = lower(replace(p_book_id, '-', ''))
      OR bs.slug LIKE p_book_id || '-%'
      OR lower(replace(bs.slug, '-', '')) LIKE lower(replace(p_book_id, '-', '')) || '%'
    )
    AND bs.status = 'approved'
  ORDER BY
    (bs.slug = p_book_id) DESC,
    (bs.id::text = p_book_id) DESC,
    (bs.slug LIKE p_book_id || '-%') DESC,
    bs.created_at DESC
  LIMIT 1;
END;
$function$;