// عامل الاكتشاف والرفع التلقائي المستمر من Archive.org
// يُستدعى من cron كل دقيقة. عند التفعيل:
// 1) يفحص عدد الكتب المعلّقة في bulk_upload_queue
// 2) إذا كانت أقل من min_pending_threshold، يجلب دفعة (batch_size, افتراضي 100) من Archive.org
//    ابتداءً من cursor المحفوظ، ويضيفها إلى الطابور
// 3) معالج الطابور (process-bulk-upload-queue) الذي يعمل بالفعل كل دقيقة هو ما يرفع الكتب
// النتيجة: تدفّق مستمر بلا توقف وبلا تدخل من المستخدم.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_ARABIC_ARCHIVE_QUERY = "collection:booksbylanguage_arabic AND mediatype:texts AND format:PDF";

function encodeArchivePath(name: string): string {
  return name.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function isDownloadableArchivePdf(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "KotobiAutoDiscovery/1.0",
        "Range": "bytes=0-0",
        "Accept": "application/pdf,*/*",
      },
      signal: AbortSignal.timeout(8_000),
    });
    try { await res.body?.cancel(); } catch (_) {}
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

interface Config {
  enabled: boolean;
  search_query: string;
  cursor: string | null;
  batch_size: number;
  min_pending_threshold: number;
  total_discovered: number;
}

// تحسين الاستعلام عبر Mistral (اختياري)
async function refineQueryWithMistral(userQuery: string): Promise<string> {
  const apiKey = Deno.env.get("MISTRAL_API_KEY");
  if (!apiKey || !userQuery) return userQuery;
  try {
    const r = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-large-latest",
        messages: [
          { role: "system", content: "حوّل طلب المستخدم إلى استعلام بحث archive.org Lucene لكتب PDF عربية. استخدم language:Arabic و mediatype:texts و format:PDF. أعد الاستعلام فقط." },
          { role: "user", content: userQuery },
        ],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });
    if (!r.ok) return userQuery;
    const d = await r.json();
    const refined = (d.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
    return refined || userQuery;
  } catch { return userQuery; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // 1) قراءة الإعدادات
    const { data: cfg, error: cfgErr } = await supabase
      .from("auto_discover_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();

    if (cfgErr) throw new Error(cfgErr.message);
    if (!cfg) {
      return new Response(JSON.stringify({ success: false, error: "config_missing" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const config = cfg as Config;

    if (!config.enabled) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2) فحص عدد الكتب المعلّقة (pending) في الطابور
    const { count: pendingCount, error: countErr } = await supabase
      .from("bulk_upload_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);

    if (countErr) throw new Error(countErr.message);

    const threshold = config.min_pending_threshold || 100;
    const pending = pendingCount || 0;

    if (pending >= threshold) {
      // الطابور ممتلئ بما يكفي - لا داعي لجلب المزيد الآن
      await supabase.from("auto_discover_config").update({
        last_run_at: new Date().toISOString(),
        last_status: `قائمة الانتظار ممتلئة (${pending}/${threshold})، تم التخطي`,
        last_error: null,
      }).eq("id", 1);
      return new Response(JSON.stringify({ success: true, skipped: true, pending, threshold }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) تحضير استعلام Archive.org — نستخدم استعلام المستخدم المخصص (تصنيف/موضوع)
    // إن وُجد، وإلا نعود للاستعلام الافتراضي لكل الكتب العربية.
    const userQ = (config.search_query || "").toString().trim();
    let archiveQuery = DEFAULT_ARABIC_ARCHIVE_QUERY;
    if (userQ && userQ !== DEFAULT_ARABIC_ARCHIVE_QUERY) {
      // إن لم يحتوِ المستخدم على فلاتر Lucene، نُحسّن استعلامه عبر Mistral
      // ونضمن وجود فلاتر mediatype/format/language
      const looksLikeLucene = /[:()]/.test(userQ);
      const refined = looksLikeLucene ? userQ : await refineQueryWithMistral(userQ);
      let q = refined;
      if (!/mediatype/i.test(q)) q += " AND mediatype:(texts)";
      if (!/format/i.test(q)) q += " AND format:(PDF)";
      if (!/language|collection:booksbylanguage/i.test(q)) q += " AND language:Arabic";
      archiveQuery = q;
    }

    const batchSize = Math.min(config.batch_size || 100, 200);
    // الهدف: عدد الكتب الجديدة التي نريد إضافتها هذا التشغيل
    const targetFresh = Math.max(threshold - pending, batchSize);

    // كشف العناوين العشوائية / أسماء الملفات / السلاسل غير المفهومة
    function isRealTitle(t: string | null | undefined, identifier: string): boolean {
      if (!t) return false;
      const s = t.toString().trim();
      if (s.length < 3 || s.length > 500) return false;

      // مطابق لمعرّف Archive نفسه
      if (s.toLowerCase() === identifier.toLowerCase()) return false;

      // عناوين عامة فارغة
      if (/^(untitled|unknown|no\s*title|scan\d*|test\d*|sample|document\d*|file\d*|new\s*document|بدون\s*عنوان|غير\s*معروف|مجهول)$/i.test(s)) return false;

      // أرقام فقط أو رموز فقط
      if (/^[\d\s\-_.,:;()[\]{}#@$%^&*+=!?'"\\\/|]+$/.test(s)) return false;

      // حرف واحد أو حرفين فقط
      if (s.replace(/\s+/g, '').length < 3) return false;

      // تكرار حرف نفسه 4 مرات أو أكثر (مثل: 11111، AAAA)
      if (/(.)\1{3,}/.test(s)) return false;

      // أرقام مكررة في النهاية (مثل: "كتاب1111111")
      if (/\d{5,}\s*$/.test(s) && !/\b(19|20)\d{2}\b/.test(s)) return false;

      // فحص النسبة: يجب أن تكون نسبة الأحرف العربية/اللاتينية إلى الطول الكلي معقولة
      const letters = (s.match(/[\u0600-\u06FFa-zA-Z]/g) || []).length;
      if (letters < 3) return false;
      if (letters / s.length < 0.5) return false;

      // كلمة واحدة طويلة بدون مسافات وبأحرف لاتينية فقط (CamelCase أو snake_case أسماء ملفات)
      // مثل: AlMasailWaDalailByShaykhFaiz أو aldawlawalostora
      const hasSpace = /\s/.test(s);
      const isAllLatin = /^[A-Za-z0-9_\-.]+$/.test(s);
      if (!hasSpace && isAllLatin && s.length > 12) return false;

      // CamelCase طويل: 4 تحولات حالة أو أكثر بدون مسافات
      if (!hasSpace && isAllLatin) {
        const transitions = (s.match(/[a-z][A-Z]/g) || []).length;
        if (transitions >= 3) return false;
      }

      // فقط أحرف منخفضة لاتينية بدون مسافات وأطول من 10 (أسماء ملفات منزوعة)
      if (!hasSpace && /^[a-z0-9_\-]+$/.test(s) && s.length > 10) return false;

      // فقط مسار/امتداد ملف
      if (/\.(pdf|epub|djvu|txt|zip|rar|jpg|png)$/i.test(s)) return false;

      return true;
    }

    // عنوان مُطبَّع لكشف التكرار (يزيل التشكيل والرموز والمسافات والأرقام)
    function normalizeTitle(t: string): string {
      return t
        .toString()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // تشكيل عربي
        .replace(/[إأآا]/g, 'ا')
        .replace(/[ىي]/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/[^\u0600-\u06FFa-z0-9]/g, '')
        .trim();
    }

    function extractAuthor(meta: any): string | null {
      const raw = meta?.metadata?.creator ?? meta?.metadata?.author;
      const v = Array.isArray(raw) ? raw[0] : raw;
      const s = (v ?? "").toString().trim();
      if (!s) return null;
      if (/^(unknown|n\/a|null|none|غير\s*معروف|مجهول|-)$/i.test(s)) return null;
      if (s.length < 2 || s.length > 200) return null;
      return s;
    }

    // فلتر بسيط: نقبل العنوان كما هو من Archive بدون تعديل،
    // لكن نرفض الكتاب كاملاً إذا كان العنوان عشوائياً (مثل twqktwqk أو أسماء ملفات).
    // الشرط: يجب أن يحتوي العنوان على حروف عربية حقيقية (مجموعة الكتب عربية).
    function looksLikeRealArabicTitle(t: string): boolean {
      const s = (t || "").toString().trim();
      if (s.length < 2) return false;
      const arabicLetters = (s.match(/[\u0600-\u06FF]/g) || []).length;
      // يجب أن يحتوي على حرفين عربيين على الأقل
      if (arabicLetters < 2) return false;
      // رفض تكرار الحرف نفسه 5 مرات (مثل ااااااا)
      if (/(.)\1{4,}/.test(s)) return false;
      return true;
    }

    async function resolveBook(identifier: string, fallbackTitle: string, fallbackAuthor: string | null): Promise<{ title: string; url: string; author: string | null; coverUrl: string | null } | null> {
      try {
        const r = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
          headers: { "User-Agent": "KotobiAutoDiscovery/1.0" },
        });
        if (!r.ok) return null;
        const meta = await r.json();
        const metaTitleRaw = meta?.metadata?.title;
        const metaTitle = Array.isArray(metaTitleRaw) ? metaTitleRaw[0] : metaTitleRaw;
        // ★ نختار أول عنوان يحتوي على حروف عربية (من metadata ثم من نتيجة البحث)،
        // ونحفظه كما هو حرفياً بدون تعديل. إذا لم يوجد عنوان عربي صالح → نتخطى الكتاب.
        const candidates = [metaTitle, fallbackTitle]
          .map((t) => (t ?? "").toString().trim())
          .filter((t) => t.length > 0);
        const realTitle = candidates.find(looksLikeRealArabicTitle);
        if (!realTitle) return null;

        const author = extractAuthor(meta) || fallbackAuthor;

        const files: any[] = Array.isArray(meta?.files) ? meta.files : [];
        const pdfs = files
          .filter((f) => typeof f.name === "string" && /\.pdf$/i.test(f.name))
          .map((f) => ({ name: f.name as string, size: f.size ? parseInt(f.size, 10) : 0 }));
        if (pdfs.length === 0) return null;
        const preferred = pdfs
          .filter((f) => !/_bw\.pdf$|_text\.pdf$/i.test(f.name))
          .sort((a, b) => b.size - a.size);
        const pdfCandidates = [...preferred, ...pdfs.filter((f) => !preferred.some((p) => p.name === f.name))]
          .slice(0, 4);
        const MAX_BYTES = 45 * 1024 * 1024;
        const chosen = (await Promise.all(pdfCandidates.map(async (candidate) => {
          if (candidate.size && candidate.size > MAX_BYTES) return null;
          const url = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeArchivePath(candidate.name)}`;
          return await isDownloadableArchivePdf(url) ? { ...candidate, url } : null;
        }))).find(Boolean);
        if (!chosen) return null;

        const images = files.filter((f) => typeof f.name === "string" && /\.(jpe?g|png)$/i.test(f.name) && !/_thumb|_small/i.test(f.name));
        const coverFile = images.find((f) => /cover|front|page0*1|0001/i.test(f.name)) || images[0];
        const coverUrl = coverFile
          ? `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURI(coverFile.name)}`
          : null;

        return {
          title: realTitle.toString().trim().slice(0, 500),
          url: chosen.url,
          author,
          coverUrl,
        };
      } catch {
        return null;
      }
    }

    // مطابقة معرّف Archive داخل أي رابط (download/items + CDN mirrors)
    function urlContainsId(url: string, id: string): boolean {
      if (!url || !id) return false;
      return url.includes(`/download/${id}/`) || url.includes(`/download/${id}?`)
        || url.includes(`/items/${id}/`) || url.includes(`/items/${id}?`)
        || url.includes(`/details/${id}`) || url.endsWith(`/download/${id}`)
        || url.endsWith(`/items/${id}`);
    }

    // ذاكرة جلسة لتجنب فحص نفس المعرّف مرتين خلال نفس التشغيل
    const sessionKnown = new Set<string>();
    // ذاكرة جلسة للعناوين المُطبَّعة (للتكرار النصي)
    const sessionTitles = new Set<string>();

    // كشف تكرار العنوان: يجلب جميع العناوين المُطبَّعة من approved_books و bulk_upload_queue
    // ويحفظها في ذاكرة الجلسة. يُستدعى مرة واحدة في بداية التشغيل.
    async function preloadKnownTitles() {
      const tables: Array<{ table: string; col: string }> = [
        { table: "approved_books", col: "title" },
        { table: "bulk_upload_queue", col: "title" },
      ];
      for (const { table, col } of tables) {
        let from = 0;
        const PAGE = 1000;
        for (let p = 0; p < 20; p++) {
          const { data, error } = await supabase
            .from(table)
            .select(col)
            .range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          for (const row of data) {
            const t = String((row as any)[col] || "").trim();
            if (t) {
              const n = normalizeTitle(t);
              if (n.length >= 4) sessionTitles.add(n);
            }
          }
          if (data.length < PAGE) break;
          from += PAGE;
        }
      }
    }
    await preloadKnownTitles();


    // فلترة المعرّفات مقابل قاعدة البيانات قبل أي metadata fetch
    // نتحقق من: approved_books (المنشورة) + book_submissions (المعلّقة/المرفوضة) + bulk_upload_queue (في الطابور)
    async function filterAlreadyKnown(ids: string[]): Promise<Set<string>> {
      const known = new Set<string>();
      if (ids.length === 0) return known;
      // إضافة من ذاكرة الجلسة أولاً
      for (const id of ids) if (sessionKnown.has(id)) known.add(id);

      const buildOr = (col: string, idList: string[]) =>
        idList.flatMap((id) => {
          const safe = id.replace(/[%,()]/g, "");
          return [
            `${col}.ilike.%/download/${safe}/%`,
            `${col}.ilike.%/items/${safe}/%`,
            `${col}.ilike.%/details/${safe}%`,
          ];
        }).join(",");

      const checkTable = async (table: string, col: string) => {
        const remaining = ids.filter((id) => !known.has(id));
        if (remaining.length === 0) return;
        // قسّم على دفعات لتجنّب OR طويل جداً
        const CHUNK = 40;
        for (let i = 0; i < remaining.length; i += CHUNK) {
          const slice = remaining.slice(i, i + CHUNK);
          try {
            const { data } = await supabase.from(table).select(col).or(buildOr(col, slice));
            for (const row of data || []) {
              const u = String((row as any)[col] || "");
              for (const id of slice) if (urlContainsId(u, id)) known.add(id);
            }
          } catch (_) {}
        }
      };

      // 1) الكتب المنشورة (الأهم - هذا كان الخطأ الأصلي)
      await checkTable("approved_books", "book_file_url");
      // 2) الطابور الحالي
      await checkTable("bulk_upload_queue", "book_file_url");
      // 3) الطلبات السابقة (مقبولة/مرفوضة/معلّقة)
      await checkTable("book_submissions", "source_book_file_url");
      await checkTable("book_submissions", "book_file_url");

      // حدّث ذاكرة الجلسة
      for (const id of known) sessionKnown.add(id);
      return known;
    }

    // 4) حلقة بحث متعددة الصفحات
    // لتنويع النتائج عبر مئات الآلاف من كتب archive.org، نختار ترتيب مختلف عشوائياً
    // كل تشغيل، ونعيد cursor دورياً (احتمال 35%) لاستكشاف شرائح جديدة.
    const SORT_OPTIONS = [
      "addeddate desc", "addeddate asc",
      "downloads desc", "week desc",
      "publicdate desc", "publicdate asc",
      "date desc", "date asc",
      "reviewdate desc", "titleSorter asc",
    ];
    const chosenSort = SORT_OPTIONS[Math.floor(Math.random() * SORT_OPTIONS.length)];
    const shouldForceResetForDefaultQuery = (config.search_query || "").trim() !== DEFAULT_ARABIC_ARCHIVE_QUERY;
    const shouldResetCursor = shouldForceResetForDefaultQuery || !config.cursor || Math.random() < 0.35;

    const STARTED_AT = Date.now();
    const MAX_MS = 90_000;
    const MAX_PAGES = 15;
    let cursor: string | null = shouldResetCursor ? null : config.cursor;
    let totalScanned = 0;
    let totalAlreadyKnown = 0;
    let totalSkippedNoTitle = 0;
    let exhausted = false;

    const fresh: Array<{ title: string; book_file_url: string; identifier: string; author: string | null; cover_image_url: string | null }> = [];
    const insertedUrls = new Set<string>();

    for (let page = 0; page < MAX_PAGES; page++) {
      if (fresh.length >= targetFresh) break;
      if (Date.now() - STARTED_AT > MAX_MS) break;

      const scrapeUrl = new URL("https://archive.org/services/search/v1/scrape");
      scrapeUrl.searchParams.set("q", archiveQuery);
      scrapeUrl.searchParams.set("fields", "identifier,title,creator");
      scrapeUrl.searchParams.set("count", String(batchSize));
      scrapeUrl.searchParams.set("sorts", chosenSort);
      if (cursor) scrapeUrl.searchParams.set("cursor", cursor);

      const archRes = await fetch(scrapeUrl.toString(), {
        headers: { "User-Agent": "KotobiAutoDiscovery/1.0" },
      });
      if (!archRes.ok) {
        const txt = await archRes.text();
        throw new Error(`archive.org HTTP ${archRes.status}: ${txt.slice(0, 200)}`);
      }
      const archData = await archRes.json();
      const items: Array<{ identifier: string; title: string | string[]; creator?: string | string[] }> =
        Array.isArray(archData?.items) ? archData.items : [];
      cursor = archData?.cursor || null;
      totalScanned += items.length;

      if (items.length === 0) { exhausted = true; break; }

      const ids = items.map((it) => it.identifier);
      const known = await filterAlreadyKnown(ids);
      totalAlreadyKnown += known.size;
      const unknownItems = items.filter((it) => !known.has(it.identifier));
      if (unknownItems.length === 0) {
        if (!cursor) { exhausted = true; break; }
        continue;
      }

      const CONCURRENCY = 8;
      let idx = 0;
      let skippedByTitle = 0;
      const pageFresh: Array<{ title: string; book_file_url: string; identifier: string; author: string | null; cover_image_url: string | null }> = [];
      async function worker() {
        while (idx < unknownItems.length) {
          if (fresh.length + pageFresh.length >= targetFresh) return;
          const i = idx++;
          const it = unknownItems[i];
          const fallbackTitle = (Array.isArray(it.title) ? it.title[0] : it.title) || "";
          const fallbackAuthorRaw = Array.isArray(it.creator) ? it.creator[0] : it.creator;
          const fallbackAuthor = fallbackAuthorRaw ? String(fallbackAuthorRaw).trim() : null;
          const book = await resolveBook(it.identifier, fallbackTitle, fallbackAuthor);
          if (book) {
            // كشف التكرار حسب العنوان المُطبَّع (يتجنب نفس الكتاب برابط مختلف)
            const norm = normalizeTitle(book.title);
            if (norm.length >= 4 && sessionTitles.has(norm)) {
              skippedByTitle++;
              continue;
            }
            if (!insertedUrls.has(book.url)) {
              insertedUrls.add(book.url);
              if (norm.length >= 4) sessionTitles.add(norm); // امنع التكرار داخل نفس التشغيل
              pageFresh.push({
                title: book.title,
                book_file_url: book.url,
                identifier: it.identifier,
                author: book.author,
                cover_image_url: book.coverUrl,
              });
            }
          } else {
            totalSkippedNoTitle++;
          }
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
      totalAlreadyKnown += skippedByTitle; // اعتبر تكرار العنوان أيضاً كـ "معروف"

      if (pageFresh.length > 0) {
        const batchLabel = `auto-${new Date().toISOString().slice(0, 19)}`;
        const rows = pageFresh.map((b) => ({
          title: b.title,
          book_file_url: b.book_file_url,
          cover_image_url: b.cover_image_url,
          source_author: b.author,
          status: "pending",
          attempts: 0,
          max_attempts: 3,
          created_by_email: "auto-discover@kotobi.local",
          batch_label: batchLabel,
        }));
        const { error: insErr } = await supabase
          .from("bulk_upload_queue")
          .insert(rows);
        if (!insErr) {
          fresh.push(...pageFresh);
        } else {
          console.warn("[auto-discover] insert error:", insErr.message);
        }
      }

      if (!cursor) { exhausted = true; break; }
    }

    const inserted = fresh.length;
    const nextCursor = exhausted ? null : cursor;

    // 6) تحديث المؤشر والإحصاءات
    await supabase.from("auto_discover_config").update({
      search_query: DEFAULT_ARABIC_ARCHIVE_QUERY,
      cursor: nextCursor,
      total_discovered: (config.total_discovered || 0) + inserted,
      last_run_at: new Date().toISOString(),
      last_status: `أُضيف ${inserted} كتاب جديد (تم تخطي ${totalAlreadyKnown} مكرر و ${totalSkippedNoTitle} بدون اسم/PDF صالح من ${totalScanned} نتيجة، المعلّق: ${pending})${exhausted ? " — اكتملت دورة البحث" : ""}`,
      last_error: null,
    }).eq("id", 1);

    return new Response(JSON.stringify({
      success: true,
      scanned: totalScanned,
      inserted,
      already_known: totalAlreadyKnown,
      skipped_no_title: totalSkippedNoTitle,
      pending_before: pending,
      next_cursor: nextCursor,
      exhausted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[auto-discover] error:", msg);
    await supabase.from("auto_discover_config").update({
      last_run_at: new Date().toISOString(),
      last_status: "فشل",
      last_error: msg.slice(0, 500),
    }).eq("id", 1);
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
