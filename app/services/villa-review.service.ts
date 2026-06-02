import { supabase } from "@/lib/supabase";

/* ===============================================================
   🛡️ FAZ 33 — VILLA REVIEW SERVICE
   ===============================================================
   public.villa_reviews — guest yorum sistemi.

   USE CASES:
     - Public: villa detay sayfasında approved review listesi +
       guest yorum form (createVillaReview is_approved=false yazar)
     - Admin /maki-admin/reviews: tüm yorumlar — onayla / öne çıkar / sil
     - SEO: approved review'lardan AggregateRating üretilir

   MODERATION FLOW:
     guest form → INSERT is_approved=false
        ↓
     admin onayı → UPDATE is_approved=true, approved_at=now()
        ↓
     public villa detay sayfasında görünür + AggregateRating dahil
     toplam puan/sayım hesabına dahil edilir
        ↓
     "Öne çıkar" toggle → is_featured=true; DB partial unique index
     `(villa_id) WHERE is_featured` aynı villa için ikinci featured
     reddeder.

   ANTI-SPAM (faz 33):
     - guest_name >= 2 char, max 80
     - comment >= 10 char, max 1500
     - rating 1..5 integer
     - trim + empty-line collapse
     - captcha YOK / auth YOK (kapsam dışı)

   EXISTING PATTERN REUSE:
     - faq.service.ts shape (named helpers, Result<T> tarzı dönüş)
     - manualReservation.service.ts Result<T> wrapper
     - cache.helpers.ts unstable_cache tag system
   =============================================================== */

/* ---------------------------------------------------------------
   📦 TYPES — public + admin contract
   --------------------------------------------------------------- */

/** Public villa detail sayfasının render ettiği minimum shape. */
export type VillaReviewPublic = {
  id: string;
  guest_name: string;
  rating: number;
  comment: string;
  created_at: string | null;
  /** Featured review villa başına 1 tane. */
  is_featured: boolean;
};

/** Admin moderation listesi shape'i — villa adıyla birlikte join. */
export type VillaReviewAdmin = {
  id: string;
  villa_id: string;
  villa_title: string | null;
  guest_name: string;
  rating: number;
  comment: string;
  is_approved: boolean;
  is_featured: boolean;
  approved_at: string | null;
  created_at: string | null;
};

/** Public form payload (server action giriş). */
export type CreateVillaReviewInput = {
  villa_id: string;
  guest_name: string;
  rating: number;
  comment: string;
};

/** Aggregate stats — SEO AggregateRating + UI header için. */
export type VillaReviewStats = {
  count: number;
  /** 1..5 ortalama (1 ondalık). 0 review için 0. */
  average: number;
};

/** Mevcut Result<T> pattern (faq / villa-admin / private token service). */
export type ReviewResult<T = void> =
  /* 🛡️ `{}` burada void-case için kasıtlı boş intersection — `{value}`
     ile birleşime sıfır alan ekler. `Record<string, never>` alternatifi
     ama domain-wide pattern (faq/villa-admin) ile drift olmasın diye
     mevcut hali korunuyor. */
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  | ({ ok: true } & (T extends void ? {} : { value: T }))
  | { ok: false; error: string };

/* ---------------------------------------------------------------
   📐 CONSTRAINTS — service-side defensive (DB constraint'lerin yansıması)
   --------------------------------------------------------------- */
const MIN_NAME_LEN = 2;
const MAX_NAME_LEN = 80;
const MIN_COMMENT_LEN = 10;
const MAX_COMMENT_LEN = 1500;
const MIN_RATING = 1;
const MAX_RATING = 5;

/** Yorum text'i için defansif sanitize:
 *   - trim
 *   - >=3 ardışık boş satırı çift newline'a indir (anti-flood)
 *   - max length uygulanmaz (length check ayrı aşamada).
 */
function sanitizeComment(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
}

function sanitizeName(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
}

/* ===============================================================
   🛡️ PUBLIC READ — approved review listesi
   ===============================================================
   Villa detay sayfasında render edilen yorum listesi.
     - is_approved=true
     - newest first (created_at DESC)
     - max 20 satır (faz 33 cap; ilerideki "Tüm yorumları gör"
       gerekirse paginate ekleyebiliriz)
     - Featured review'lar varsa onları üstte gösteriyoruz (is_featured
       DESC, created_at DESC tie-break)
=============================================================== */
const PUBLIC_REVIEW_LIMIT = 20;

export async function getApprovedVillaReviews(
  villaId: string
): Promise<VillaReviewPublic[]> {
  if (!villaId) return [];

  const { data, error } = await supabase
    .from("villa_reviews")
    .select(
      "id, guest_name, rating, comment, created_at, is_featured"
    )
    .eq("villa_id", villaId)
    .eq("is_approved", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(PUBLIC_REVIEW_LIMIT);

  if (error) {
    console.error("[review.getApproved] FAILED", error.message);
    return [];
  }

  type Row = {
    id: string;
    guest_name: string | null;
    rating: number | null;
    comment: string | null;
    created_at: string | null;
    is_featured: boolean | null;
  };

  return ((data || []) as Row[]).map((r) => ({
    id: String(r.id),
    guest_name: (r.guest_name || "").trim() || "Misafir",
    rating: clampRating(r.rating),
    comment: String(r.comment || ""),
    created_at: r.created_at ?? null,
    is_featured: !!r.is_featured,
  }));
}

/* ===============================================================
   🛡️ FAZ 39F — GLOBAL REVIEW STATS (homepage hero floating card)
   ===============================================================
   Anasayfa hero'sundaki floating "★ 4.9 / 5 · N gerçek yorum"
   kartı için site-wide aggregate. PER-VILLA stats batch'inden
   bağımsız tek query.

   PERFORMANCE:
     - 1 SQL query (`SELECT rating WHERE is_approved=true`)
     - O(n) JS sum; n ≈ toplam approved review sayısı
     - Cache: getCachedGlobalReviewStats (tag: villa-reviews,
       TTL: 1h). Admin moderation invalidate akışı zaten mevcut.
     - Hiçbir per-villa fetch yapılmaz → N+1 yok
     - Hero için ek prop; client fetch yok

   EMPTY DATASET:
     count===0 → average=0 döner; UI kart koşullu render eder
     (Hero count===0 ise floating card'ı hiç göstermez).
=============================================================== */
export type GlobalReviewStats = {
  count: number;
  average: number;
};

export async function getGlobalReviewStats(): Promise<GlobalReviewStats> {
  const { data, error } = await supabase
    .from("villa_reviews")
    .select("rating")
    .eq("is_approved", true);

  if (error) {
    console.error("[review.globalStats] FAILED", error.message);
    return { count: 0, average: 0 };
  }
  type Row = { rating: number | null };
  const rows = (data || []) as Row[];
  if (rows.length === 0) return { count: 0, average: 0 };

  let sum = 0;
  for (const r of rows) sum += clampRating(r.rating);
  return {
    count: rows.length,
    average: Math.round((sum / rows.length) * 10) / 10,
  };
}

/* ===============================================================
   🛡️ FAZ 35 — VILLA CARD REVIEW STATS BATCH
   ===============================================================
   Villa card'larında "★ 4.9 (12)" trust meta için. Listeleme
   surface'lerinin (homepage, /arama, /kiralik-villalar) tek
   villa başına ek query yapmaması için TÜM yorumların aggregate'i
   tek round-trip'te döner.

   STRATEJİ:
     - SELECT villa_id, rating WHERE is_approved=true
     - JS-side group-by villa_id → { count, sumRating }
     - average = round(sum / count, 1)
     - Return: Record<villa_id, { count, average }>

   PERFORMANCE:
     - 1 SQL query (boyut: tüm approved review'ların `rating` kolonu;
       satır başı ~10 byte; 10k review için ~100 KB sınırı içinde)
     - JS aggregate O(n) — 10k için ms-altı
     - Çağıran tarafta Promise.all ile villa listesi ile paralel
       çalıştırılır → net latency artışı = max(listQuery, statsQuery)
       değil, statsQuery genelde çok daha hızlı → ~0 ek latency
     - Boş dataset → boş {} döner; UI conditional render

   CACHE:
     Bu helper'ın kendi cache wrapper'ı YOK. Çağrı sahibi (getVillas
     içine girdiği için) outer `getCachedVillas` cache'inde dolaylı
     yere cache'lenir. Cache tag genişletmesi cache.helpers'ta:
     `getCachedVillas` artık `["villas","villa-reviews"]` tag set'i ile
     review CRUD invalidate flow'una bağlanır.

   N+1 ENGEL:
     Bu fonksiyon TEK round-trip; çağıran kod hiçbir villa için
     ayrı stat query atmaz. Villa listesi ne kadar büyürse büyüsün
     (50, 100, 500) ek bir DB roundtrip oluşmaz.
=============================================================== */
export type VillaReviewStatsBatch = Record<
  string,
  { count: number; average: number }
>;

export async function getVillaReviewStatsBatch(): Promise<VillaReviewStatsBatch> {
  const { data, error } = await supabase
    .from("villa_reviews")
    .select("villa_id, rating")
    .eq("is_approved", true);

  if (error) {
    console.error("[review.statsBatch] FAILED", error.message);
    return {};
  }

  type Row = { villa_id: string | null; rating: number | null };
  const rows = (data || []) as Row[];
  if (rows.length === 0) return {};

  /* Tek pass JS aggregate; sum + count. */
  const acc = new Map<string, { count: number; sum: number }>();
  for (const r of rows) {
    const id = typeof r.villa_id === "string" ? r.villa_id : "";
    if (!id) continue;
    const rating = clampRating(r.rating);
    const cur = acc.get(id);
    if (cur) {
      cur.count += 1;
      cur.sum += rating;
    } else {
      acc.set(id, { count: 1, sum: rating });
    }
  }

  const result: VillaReviewStatsBatch = {};
  for (const [id, { count, sum }] of acc) {
    result[id] = {
      count,
      average: Math.round((sum / count) * 10) / 10,
    };
  }
  return result;
}

function clampRating(value: number | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_RATING;
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(n)));
}

/* ===============================================================
   🛡️ FAZ 34 — HOMEPAGE TESTIMONIAL SHAPE
   ===============================================================
   Anasayfa "Misafir Deneyimleri" testimonial section'ı için.
   Tek round-trip embedded join: villa { slug, title, villa_images }.
   Cover image mapping mapVilla pattern'i ile birebir aynı kural
   (is_cover öncelik, ardından sort_order ASC).

   PUBLIC kontratı:
     - Yalnız approved review'lar
     - Featured-first sort, ardından newest fallback
     - Max 6 (homepage performance)
     - Villa silinmiş/pasif ise client filter düşer (defansif)
=============================================================== */
const HOMEPAGE_REVIEW_LIMIT = 6;

export type HomepageReviewItem = {
  id: string;
  guest_name: string;
  rating: number;
  comment: string;
  created_at: string | null;
  is_featured: boolean;
  villa: {
    id: string;
    slug: string;
    title: string;
    /** Cover (is_cover öncelikli, ardından sort_order ASC). NULL → image yok. */
    cover_image: string | null;
    /** Default-null defensive; UI badge gerekirse kullanılabilir. */
    location: string | null;
  };
};

export async function getFeaturedHomepageReviews(): Promise<
  HomepageReviewItem[]
> {
  /* Embedded join — villa kayıtları yalnız aktif + silinmemiş
     (homepage'de pasif/silinmiş villa görünmemeli) ama embed-eq()
     filter PostgREST tarafından villa relation'ında doğrudan
     uygulanmıyor; JS-side filter daha güvenli ve mevcut homepage
     collection pattern'iyle birebir (lib/cache.helpers.ts >
     getCachedHomepageCollectionVillas). */
  const { data, error } = await supabase
    .from("villa_reviews")
    .select(
      `id, guest_name, rating, comment, created_at, is_featured,
       villa:villa_id (
         id, slug, title, is_active, deleted_at,
         location:villa_locations(name),
         villa_images ( image_url, is_cover, sort_order )
       )`
    )
    .eq("is_approved", true)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(HOMEPAGE_REVIEW_LIMIT * 2); /* over-fetch buffer; sonra trim */

  if (error) {
    console.error("[review.homepage] FAILED", error.message);
    return [];
  }

  type VillaImageRow = {
    image_url: string | null;
    is_cover: boolean | null;
    sort_order: number | null;
  };

  type Row = {
    id: string;
    guest_name: string | null;
    rating: number | null;
    comment: string | null;
    created_at: string | null;
    is_featured: boolean | null;
    villa: {
      id: string;
      slug: string | null;
      title: string | null;
      is_active: boolean | null;
      deleted_at: string | null;
      location: { name: string | null } | null;
      villa_images: VillaImageRow[] | null;
    } | null;
  };

  const rows = (data || []) as unknown as Row[];
  const result: HomepageReviewItem[] = [];

  for (const r of rows) {
    const v = r.villa;
    if (!v || !v.id || !v.slug) continue;
    /* Defansif: pasif veya silinmiş villaya ait testimonial homepage'de
       gösterilmesin. Public/SEO surface'i ile parity. */
    if (v.is_active === false) continue;
    if (v.deleted_at != null) continue;

    /* Cover image — mapVilla / homepage collection pattern'i ile
       birebir aynı kural. */
    const images = Array.isArray(v.villa_images) ? v.villa_images : [];
    const sorted = [...images].sort((a, b) => {
      if (a?.is_cover) return -1;
      if (b?.is_cover) return 1;
      return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
    });
    const cover =
      sorted.find(
        (i) =>
          typeof i?.image_url === "string" &&
          i.image_url.trim().length > 0
      )?.image_url ?? null;

    result.push({
      id: String(r.id),
      guest_name: (r.guest_name || "").trim() || "Misafir",
      rating: clampRating(r.rating),
      comment: String(r.comment || ""),
      created_at: r.created_at,
      is_featured: !!r.is_featured,
      villa: {
        id: String(v.id),
        slug: String(v.slug),
        title: String(v.title || ""),
        cover_image: cover,
        location: v.location?.name ?? null,
      },
    });

    if (result.length >= HOMEPAGE_REVIEW_LIMIT) break;
  }

  return result;
}

/* ===============================================================
   🛡️ PUBLIC READ — aggregate stats (count + average)
   ===============================================================
   SEO AggregateRating + UI header'da kullanılır. Yalnız approved
   review'lar dahil edilir. Hesap server-side; küçük dataset için
   N+1 maliyetsiz.

   PERFORMANCE NOTE:
     `head: true, count: "exact"` ile sayım sadece sayı döner, body
     gelmez. Average için ayrı bir minimal SELECT yapılır
     (rating array → JS reduce). Toplam 2 round-trip; küçük query.
=============================================================== */
export async function getVillaReviewStats(
  villaId: string
): Promise<VillaReviewStats> {
  if (!villaId) return { count: 0, average: 0 };

  const { data, error } = await supabase
    .from("villa_reviews")
    .select("rating")
    .eq("villa_id", villaId)
    .eq("is_approved", true);

  if (error) {
    console.error("[review.getStats] FAILED", error.message);
    return { count: 0, average: 0 };
  }

  type Row = { rating: number | null };
  const rows = (data || []) as Row[];
  if (rows.length === 0) return { count: 0, average: 0 };

  let sum = 0;
  for (const r of rows) {
    sum += clampRating(r.rating);
  }
  const average = Math.round((sum / rows.length) * 10) / 10;
  return { count: rows.length, average };
}

/* ===============================================================
   🛡️ PUBLIC WRITE — guest yorum gönderir
   ===============================================================
   Validation:
     - guest_name >= 2 char (sanitized)
     - rating 1..5 integer
     - comment >= 10 char (sanitized)
     - is_approved=false (admin onayına gönderilir)
   Hata case'lerinde Result.ok=false döner; caller toast.error gösterir.
=============================================================== */
export async function createVillaReview(
  input: CreateVillaReviewInput
): Promise<ReviewResult> {
  const villaId = String(input?.villa_id || "").trim();
  if (!villaId) return { ok: false, error: "Villa bilgisi eksik" };

  const guestName = sanitizeName(input?.guest_name || "");
  if (guestName.length < MIN_NAME_LEN) {
    return { ok: false, error: "Lütfen adınızı girin (en az 2 karakter)." };
  }
  if (guestName.length > MAX_NAME_LEN) {
    return { ok: false, error: "Ad çok uzun (maks. 80 karakter)." };
  }

  const ratingNum = Number(input?.rating);
  if (!Number.isFinite(ratingNum)) {
    return { ok: false, error: "Geçerli bir puan seçin." };
  }
  const rating = Math.round(ratingNum);
  if (rating < MIN_RATING || rating > MAX_RATING) {
    return { ok: false, error: "Puan 1-5 arasında olmalı." };
  }

  const comment = sanitizeComment(input?.comment || "");
  if (comment.length < MIN_COMMENT_LEN) {
    return {
      ok: false,
      error: "Yorum en az 10 karakter olmalı.",
    };
  }
  if (comment.length > MAX_COMMENT_LEN) {
    return {
      ok: false,
      error: "Yorum çok uzun (maks. 1500 karakter).",
    };
  }

  const { error } = await supabase.from("villa_reviews").insert({
    villa_id: villaId,
    guest_name: guestName,
    rating,
    comment,
    is_approved: false,
    is_featured: false,
  });

  if (error) {
    console.error("[review.create] FAILED", error.message);
    return { ok: false, error: "Yorumunuz kaydedilemedi. Lütfen tekrar deneyin." };
  }

  return { ok: true };
}

/* ===============================================================
   🛡️ ADMIN — moderation listesi
   ===============================================================
   /maki-admin/reviews sayfası için. Tüm review'lar (approved +
   pending), villa adı join'li. Sort: en yeni üstte; admin önce
   bekleyen onayları (oldest pending first) görmek isteyebilir
   ileride, şimdilik newest-first canonical pattern.
=============================================================== */
export async function getVillaReviewsForAdmin(): Promise<VillaReviewAdmin[]> {
  const { data, error } = await supabase
    .from("villa_reviews")
    .select(
      `id, villa_id, guest_name, rating, comment, is_approved, is_featured,
       approved_at, created_at, villa:villa_id ( title )`
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[review.adminList] FAILED", error.message);
    return [];
  }

  type Row = {
    id: string;
    villa_id: string;
    guest_name: string | null;
    rating: number | null;
    comment: string | null;
    is_approved: boolean | null;
    is_featured: boolean | null;
    approved_at: string | null;
    created_at: string | null;
    villa: { title: string | null } | null;
  };

  return ((data || []) as unknown as Row[]).map((r) => ({
    id: String(r.id),
    villa_id: String(r.villa_id),
    villa_title: r.villa?.title ?? null,
    guest_name: (r.guest_name || "").trim() || "Misafir",
    rating: clampRating(r.rating),
    comment: String(r.comment || ""),
    is_approved: !!r.is_approved,
    is_featured: !!r.is_featured,
    approved_at: r.approved_at,
    created_at: r.created_at,
  }));
}

/* ===============================================================
   🛡️ ADMIN — onayla
   ===============================================================
   is_approved=true + approved_at=now() set eder. Idempotent
   (zaten onaylıysa noop ama yine success döner). */
export async function approveVillaReview(
  id: string
): Promise<ReviewResult> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const { error } = await supabase
    .from("villa_reviews")
    .update({
      is_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[review.approve] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ===============================================================
   🛡️ ADMIN — sil
   ===============================================================
   Soft delete YOK (review tablosu lifecycle gerektirmez; admin
   spam silmek istiyor). Hard delete; FK side-effect yok. */
export async function deleteVillaReview(
  id: string
): Promise<ReviewResult> {
  if (!id) return { ok: false, error: "ID gerekli" };

  const { error } = await supabase
    .from("villa_reviews")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("[review.delete] FAILED", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/* ===============================================================
   🛡️ ADMIN — featured toggle (villa başına 1 tane)
   ===============================================================
   FLOW:
     1) Şu anki review fetch et (is_featured + villa_id öğrenmek için)
     2) Eğer zaten featured ise → is_featured=false (toggle off)
     3) Aksi takdirde:
        a) Aynı villa'daki diğer featured review'ları is_featured=false
           yap (DB partial unique index zaten enforce ediyor; defansif
           clear ile race condition'da clean state)
        b) Bu review'u is_featured=true yap

   ⚠️ DB partial unique index `(villa_id) WHERE is_featured` zaten
   ikinci featured'ı reddeder. Bu service-side defensive clear ile
   "iki round-trip ama her zaman doğru" garantisi sağlanır.

   Onaylanmamış review featured YAPILAMAZ — defensive guard. Admin
   önce onaylamalı. */
export async function toggleFeaturedReview(
  id: string
): Promise<ReviewResult> {
  if (!id) return { ok: false, error: "ID gerekli" };

  /* 1) mevcut state'i al */
  const { data: existing, error: selErr } = await supabase
    .from("villa_reviews")
    .select("id, villa_id, is_featured, is_approved")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    console.error("[review.toggleFeatured] select FAILED", selErr.message);
    return { ok: false, error: selErr.message };
  }
  if (!existing) return { ok: false, error: "Yorum bulunamadı" };

  if (!existing.is_approved && !existing.is_featured) {
    return {
      ok: false,
      error: "Yorumu öne çıkarmadan önce onaylayın.",
    };
  }

  /* 2) Toggle off */
  if (existing.is_featured) {
    const { error } = await supabase
      .from("villa_reviews")
      .update({ is_featured: false })
      .eq("id", id);
    if (error) {
      console.error("[review.toggleFeatured] unset FAILED", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }

  /* 3) Aynı villa'daki diğer featured'ı temizle (defansif) */
  const { error: clearErr } = await supabase
    .from("villa_reviews")
    .update({ is_featured: false })
    .eq("villa_id", existing.villa_id)
    .eq("is_featured", true);

  if (clearErr) {
    console.error("[review.toggleFeatured] clear FAILED", clearErr.message);
    return { ok: false, error: clearErr.message };
  }

  /* 4) Bu review'u featured yap */
  const { error: setErr } = await supabase
    .from("villa_reviews")
    .update({ is_featured: true })
    .eq("id", id);

  if (setErr) {
    console.error("[review.toggleFeatured] set FAILED", setErr.message);
    return { ok: false, error: setErr.message };
  }
  return { ok: true };
}
