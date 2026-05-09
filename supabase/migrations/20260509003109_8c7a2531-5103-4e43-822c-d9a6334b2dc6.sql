ALTER TABLE public.auto_discover_config
ALTER COLUMN search_query SET DEFAULT 'collection:booksbylanguage_arabic AND mediatype:texts AND format:PDF';

UPDATE public.auto_discover_config
SET search_query = 'collection:booksbylanguage_arabic AND mediatype:texts AND format:PDF',
    cursor = NULL,
    enabled = true,
    last_status = 'تم إصلاح مصدر الجلب: سيجلب النظام كل الكتب العربية تلقائياً بدون استعلام يدوي',
    last_error = NULL
WHERE id = 1;