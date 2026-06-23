import { unstable_cache } from "next/cache";
import { supabase } from "@/lib/supabase";

import { resolveVillaImageUrl } from "@/lib/storage.helpers";
import { getPublicSettings } from "@/app/services/settings.service";
import { getMenu } from "@/app/services/menu.service";
import { getVillas } from "@/app/services/villa.service";
import { getFaqs } from "@/app/services/faq.service";
import {
  getApprovedVillaReviews,
  getFeaturedHomepageReviews,
  getGlobalReviewStats,
  getVillaReviewStats,
  getVillaReviewStatsBatch,
  type GlobalReviewStats,
  type HomepageReviewItem,
  type VillaReviewPublic,
  type VillaReviewStats,
} from "@/app/services/villa-review.service";

/* ===============================================================
   🛡️ CACHE HELPERS — server-side memoization with tag-based
   invalidation. SSR cost'unu düşürmek için kullanılır.
   ===============================================================
   STRATEGY:
     - getSettings / getMenu: yüksek TTL (1 saat). Admin mutation
       sonrası revalidateTag ile invalidate.
     - getVillas: orta TTL (10 dakika). Villa create/edit/sort/
       toggle/delete sonrası invalidate.
     - villa_locations / villa_types: yüksek TTL (1 saat); rare
       mutations. Standalone invalidate yapılmaz (TTL bekler) —
       admin location/type ekleme rare ve UX-acceptable.

   DYNAMIC ROUTES (dokunulmuyor):
     - reservations / manual_reservations queries (availability)
     - /arama villa inline query (filter-dependent)
     - admin panel queries

   FALLBACK CHAIN (her cached helper aynı pattern):
     await getCached*()      → cache hit (DB hit yok)
       miss/expired          → underlying service çağrısı → cache fill
       service error         → catch downstream'de zaten var
   =============================================================== */

/** Settings — tek satır config (PUBLIC-SAFE). Tag: "settings".
 *  🛡️ getCachedSettings YALNIZ public/root sayfalardan kullanılır
 *  (app/layout, public layout, public pages). 042 admin-only RLS sonrası
 *  server-anon table-select kırılacağı için public-safe RPC path
 *  (getPublicSettings → get_public_settings) kullanır. Bonus: secret
 *  artık server data cache'inde de TUTULMAZ. Admin full settings için
 *  getSettings (authenticated) ayrı kullanılır; bu cache'i çağırmaz. */
export const getCachedSettings = unstable_cache(
  async () => getPublicSettings(),
  ["settings:get"],
  { tags: ["settings"], revalidate: 3600 }
);

/** Menu tree — dynamic 4-source resolver (manual/page/category/region).
    Tag: "menu". Page CRUD + menu CRUD invalidate eder. */
export const getCachedMenu = unstable_cache(
  async () => getMenu(),
  ["menu:get"],
  { tags: ["menu"], revalidate: 3600 }
);

/** Villa public listing — getVillas() (active + not-deleted, sort_order
    ASC). Tag: "villas". Villa CRUD/sort/visibility tüm mutations
    invalidate eder. TTL daha kısa (10 dk) çünkü daha dinamik domain.

    🛡️ FAZ 35 — `villa-reviews` tag eklendi. getVillas artık review
    stats merge eder (review_average / review_count); review CRUD
    (admin approve/delete/feature, public form submit) bu cache'i
    de invalidate etmeli ki card UI'ı taze stat'lerle render olsun.
    Mevcut "villas" semantic'i aynen; ek tag yalnız invalidate yolunu
    genişletir. */
export const getCachedVillas = unstable_cache(
  async () => getVillas(),
  ["villas:get"],
  { tags: ["villas", "villa-reviews"], revalidate: 600 }
);

/* ===============================================================
   🛡️ FAQ — Global Site Frequently Asked Questions (Faz 25)
   ===============================================================
   Homepage'de "Sık Sorulan Sorular" section render etmek için
   cached read. Admin replaceFaqs sonrası revalidateFaqs() tag'i
   invalidate eder.

   TTL: 1 saat — FAQ içeriği rare mutation (admin SSS'leri seyrek
   günceller); 1 saat TTL + tag invalidate (anlık güncellik için)
   premium denge.

   EMPTY STATE: tablo boş → [] döner; homepage caller `if (!faqs.length)`
   ile section'ı hiç render etmez. */
export const getCachedFaqs = unstable_cache(
  async () => getFaqs(),
  ["faqs:get"],
  { tags: ["faqs"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ VILLA REVIEWS (Faz 33) — guest reviews per villa
   ===============================================================
   Public villa detay sayfası için cached read. Yalnız approved
   review'lar dahil edilir; pending/spam yorumlar SEO + UI'a düşmez.

   PARAMETERIZED CACHE:
     unstable_cache argümanı (villaId) cache key'e otomatik dahil
     edilir → her villa için ayrı entry. Toplam admin yorum aktivitesi
     az → hash collision endişesi yok.

   TTL: 1 saat — yorum onayları seyrek; tag invalidate (revalidateTag
   "villa-reviews") admin moderation sonrası anlık güncellik sağlar.

   EMPTY STATE: [] döner; villa detay sayfası `reviews.length === 0`
   ise yorum section'ını HİÇ render etmez (caller guard).

   PARALLEL HELPER:
     `getCachedVillaReviewStats` (count + average) AggregateRating
     JSON-LD ve UI header'ı için. Aynı tag — admin onay flow tek
     invalidate ile her iki helper'ı temizler.
=============================================================== */
export const getCachedVillaReviews = unstable_cache(
  async (villaId: string): Promise<VillaReviewPublic[]> =>
    getApprovedVillaReviews(villaId),
  ["villa-reviews:get"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

export const getCachedVillaReviewStats = unstable_cache(
  async (villaId: string): Promise<VillaReviewStats> =>
    getVillaReviewStats(villaId),
  ["villa-reviews:stats"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ FAZ 34 — HOMEPAGE TESTIMONIALS (cached)
   ===============================================================
   Anasayfa "Misafir Deneyimleri" section'ı için.
   - approved-only, featured-first, newest fallback, max 6
   - Villa cover image + slug + title embedded
   - Aynı "villa-reviews" tag altında — admin moderation aksiyonu
     (approve / delete / feature) bu cache'i de invalidate eder.
   - TTL 1 saat (mevcut review cache TTL'i ile parity).

   EMPTY STATE:
     [] döner → homepage caller `reviews.length === 0` ise section'ı
     hiç render etmez (CLS yok). */
export const getCachedHomepageReviews = unstable_cache(
  async (): Promise<HomepageReviewItem[]> => getFeaturedHomepageReviews(),
  ["villa-reviews:homepage"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

/* 🛡️ FAZ 39F — Site-wide global aggregate (homepage hero floating
   card). Aynı "villa-reviews" tag altında — admin moderation invalidate
   akışı bu cache'i de tazeler. Empty dataset {0,0}; caller koşullu render. */
export const getCachedGlobalReviewStats = unstable_cache(
  async (): Promise<GlobalReviewStats> => getGlobalReviewStats(),
  ["villa-reviews:global-stats"],
  { tags: ["villa-reviews"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ HOMEPAGE COLLECTION (manuel curasyon, migration 012)
   ===============================================================
   Admin tarafından seçilmiş villaların VillaCard render'ı için
   hazır shape'i. Sadece is_active=true + villa.is_active=true +
   villa.deleted_at IS NULL kayıtlar dönüyor. sort_order ASC.

   Tek embedded JOIN ile villa + location + images + prices çekiyor
   (getVillas pattern'iyle paralel) → N+1 yok.

   Tag: "homepage". Admin homepage CRUD sonrası revalidateHomepage()
   invalidate eder. Villa CRUD homepage'i otomatik invalidate
   ETMEZ (intentional: villa field değişimi koleksiyon sıralamasını
   bozmasın; bir sonraki TTL cycle'da yenilenir).
=============================================================== */
export type HomepageCollectionVilla = {
  id: string;
  slug: string;
  title: string;
  /* custom_title varsa override edilmiş ad, yoksa villa.title */
  display_title: string;
  location: string;
  price: number | null;
  currency: string;
  badge: string | null;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  images: string[];
  /* Custom cover override URL (storage path resolve edilmiş) veya
     villa'nın kendi cover'ı varsa images[0]. */
  cover_override_path: string | null;
  /* 🛡️ FAZ 35 — Review aggregate (card UI). count === 0 ise opsiyonel
     alanlar undefined döner; VillaCard koşullu render eder. */
  review_average?: number;
  review_count?: number;
};

export const getCachedHomepageCollectionVillas = unstable_cache(
  async (): Promise<HomepageCollectionVilla[]> => {
    /* Tek query: homepage_collections + embedded villa + images.
       villa.is_active + deleted_at filter'ı JS-side (embedded query'de
       not-IS-NULL chain'i karmaşık; sonuç küçük olduğu için JS filter
       maliyetsiz). */
    /* 🛡️ Villa price/currency artık villa kolonu DEĞİL — villa_prices
       relation'ından gelir (legacy migration). villa.service.ts >
       getVillas + mapVilla pattern'iyle birebir aynı: ilk villa_prices
       satırı price/currency için kullanılır (firstPrice). */
    /* 🛡️ FAZ 35 — Review stats batch paralel fetch + merge.
       N+1 yok: tek SQL'de tüm villa review aggregate'i toplanır;
       villa listesi ile Promise.all içinde çalıştırılır → net latency
       max(collectionQuery, statsQuery). */
    const statsPromise = getVillaReviewStatsBatch();
    const { data, error } = await supabase
      .from("homepage_collections")
      .select(
        `
        id,
        sort_order,
        is_active,
        custom_title,
        custom_cover_image,
        villa:villa_id (
          id,
          slug,
          title,
          badge,
          bedrooms,
          bathrooms,
          guests,
          is_active,
          deleted_at,
          location:villa_locations(name),
          villa_images (
            image_url,
            is_cover,
            sort_order
          ),
          villa_prices (
            price,
            currency,
            start_date
          )
        )
      `
      )
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error(
        "[cache.homepageCollection] FAILED",
        error.message
      );
      return [];
    }

    type Row = {
      id: string;
      sort_order: number;
      is_active: boolean;
      custom_title: string | null;
      custom_cover_image: string | null;
      villa: {
        id: string;
        slug: string | null;
        title: string | null;
        badge: string | null;
        bedrooms: number | null;
        bathrooms: number | null;
        guests: number | null;
        is_active: boolean | null;
        deleted_at: string | null;
        location: { name: string } | null;
        villa_images: Array<{
          image_url: string | null;
          is_cover: boolean | null;
          sort_order: number | null;
        }> | null;
        villa_prices: Array<{
          price: number | null;
          currency: string | null;
          start_date: string | null;
        }> | null;
      } | null;
    };

    const rows = (data || []) as unknown as Row[];
    /* 🛡️ FAZ 35 — Stats batch await (paralel başlatılmıştı). */
    const statsMap = await statsPromise;

    const result: HomepageCollectionVilla[] = [];
    for (const r of rows) {
      const v = r.villa;
      if (!v || !v.id) continue;
      /* Public visibility: pasif veya silinmiş villayı homepage'de
         gösterme (admin koleksiyonda bıraksa bile defensive). */
      if (v.is_active === false || v.deleted_at != null) continue;

      const rawImages = Array.isArray(v.villa_images) ? v.villa_images : [];
      const sortedImages = [...rawImages].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      /* 🛡️ Aşama A + bucket-fix — resolveVillaImageUrl: image_url HEM
         FULL URL (legacy) HEM relative path (yeni) olabilir; relative
         path için doğru bucket (villa-images). */
      const images = sortedImages
        .map((i) => resolveVillaImageUrl(i?.image_url))
        .filter(
          (u): u is string =>
            typeof u === "string" && u.trim().length > 0
        );

      /* 🛡️ price/currency mapVilla pattern'i (villa.service.ts):
         villa_prices array'inin ilk satırı kullanılır. Boş ise
         price null, currency "TRY" fallback. */
      const rawPrices = Array.isArray(v.villa_prices) ? v.villa_prices : [];
      const firstPrice = rawPrices[0];

      /* 🛡️ FAZ 35 — Review aggregate inject; count===0 ise alanlar
         undefined kalır → VillaCard meta satırını render etmez. */
      const s = statsMap[v.id];
      const hasReviews = !!s && s.count > 0;

      result.push({
        id: v.id,
        slug: String(v.slug || ""),
        title: String(v.title || ""),
        display_title:
          (r.custom_title && r.custom_title.trim()) ||
          String(v.title || ""),
        location: v.location?.name || "",
        price:
          firstPrice && firstPrice.price !== null
            ? Number(firstPrice.price)
            : null,
        currency: firstPrice?.currency || "TRY",
        badge: v.badge,
        bedrooms: v.bedrooms ?? 1,
        bathrooms: v.bathrooms ?? 1,
        guests: v.guests ?? 2,
        images,
        cover_override_path: r.custom_cover_image,
        review_average: hasReviews ? s.average : undefined,
        review_count: hasReviews ? s.count : undefined,
      });
    }
    return result;
  },
  ["homepage-collection:get"],
  /* 🛡️ FAZ 35 — "villa-reviews" tag eklendi (getCachedVillas ile parity);
     admin review CRUD (approve/feature/delete) bu cache'i de invalidate
     etmeli ki card meta'sı taze stat'lerle render olsun. Mevcut
     "homepage" semantic'i aynen korunur. */
  { tags: ["homepage", "villa-reviews"], revalidate: 600 }
);

/** Villa locations — read-only taxonomy. Tag: "taxonomy". Admin
    location ekle/sil az sıklıkta; TTL ile kendiliğinden eskirme OK.
    🛡️ slug field (migration 009): SEO-friendly URL kontratı için
    hem id hem slug seçiyoruz. Eski kayıtlarda slug NULL olabilir
    (FE/URL layer slug NULL'sa UUID'ye düşer).
    🛡️ cover_image (migration 011): Supabase Storage bucket-relative
    path. Public URL runtime'da lib/storage.helpers >
    getLocationCoverPublicUrl ile üretilir. */
export const getCachedVillaLocations = unstable_cache(
  async () => {
    const { data, error } = await supabase
      .from("villa_locations")
      .select(
        "id, name, slug, cover_image, show_in_filter, filter_group_name"
      )
      .order("name", { ascending: true });
    if (error) {
      console.error("[cache.villaLocations] FAILED", error.message);
      return [];
    }
    return (data || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      /** Relative storage path (migration 011). NULL → görseli yok. */
      cover_image: string | null;
      /** Migration 050 — arama filtresinde görünsün mü? */
      show_in_filter?: boolean | null;
      /** Migration 050 — filtrede listeleneceği grup başlığı. */
      filter_group_name?: string | null;
    }>;
  },
  ["villa-locations:get"],
  { tags: ["taxonomy"], revalidate: 3600 }
);

/* ===============================================================
   🛡️ CATEGORY COVER MAP — homepage "Kategori Keşfet" section için
   ===============================================================
   Her villa type için: bir cover image + o type'taki aktif villa
   sayısı. TEK round-trip (villa_type_relations + villa + villa_images
   embedded join). N+1 yok.

   Caller (CategoryCollection):
     - getCachedVillaTypes() → kategoriler
     - getCachedCategoryCovers() → cover image + villa count
   İki cached helper paralel; toplam 2 round-trip SSR'da.

   Tags: ["villas", "taxonomy"] — herhangi bir villa CRUD veya type
   CRUD invalidate eder. TTL 10 dakika (villas tag'iyle aynı).

   Serialization: Map değil Record (JSON-safe). Caller Record →
   lookup via key access.
=============================================================== */
type CategoryCover = {
  coverImageUrl: string | null;
  villaCount: number;
};

export const getCachedCategoryCovers = unstable_cache(
  async (): Promise<Record<string, CategoryCover>> => {
    /* 🛡️ 2-STEP JOIN (embed yerine):
       Önceki implementasyon `villa:villa_id (...)` embedded join'i
       kullanıyordu. PostgREST FK auto-resolve villa_type_relations
       junction tablosundan resolve edemediği için her satırda
       `villa: null` dönüyordu → covers map kalıcı boş → kategori
       chips render edilmiyordu.

       Yeni pattern: getVillas ile aynı yaklaşım — 2 ayrı query,
       JS-side join. `.from("villa")` singular tablo zaten anasayfada
       çalışıyor; embed sürprizine bağımlı değiliz. */

    // 1) Tüm (type_id, villa_id) eşleşmeleri
    const { data: rels, error: relsErr } = await supabase
      .from("villa_type_relations")
      .select("type_id, villa_id");
    if (relsErr) {
      console.error("[cache.categoryCovers] rels FAILED", relsErr.message);
      return {};
    }
    if (!rels || rels.length === 0) return {};

    // 2) Aktif + silinmemiş villalar + image'leri (TEK round-trip)
    const villaIds = Array.from(
      new Set(
        (rels as Array<{ villa_id: string | null }>)
          .map((r) => r.villa_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );
    if (villaIds.length === 0) return {};

    const { data: villas, error: vErr } = await supabase
      .from("villa")
      .select(
        `
        id,
        villa_images (
          image_url,
          is_cover,
          sort_order
        )
      `
      )
      .in("id", villaIds)
      .eq("is_active", true)
      .is("deleted_at", null);
    if (vErr) {
      console.error("[cache.categoryCovers] villas FAILED", vErr.message);
      return {};
    }

    type VillaRow = {
      id: string;
      villa_images?: Array<{
        image_url?: string | null;
        is_cover?: boolean | null;
        sort_order?: number | null;
      }> | null;
    };
    const villaMap = new Map<string, VillaRow>();
    for (const v of (villas as VillaRow[]) || []) {
      if (v?.id) villaMap.set(String(v.id), v);
    }

    /* Type'a göre aggregate. Cover seçimi mapVilla ile aynı kural:
       is_cover önce → sort_order ASC fallback. İlk valid image URL'i
       kullan. Aynı type'a düşen sonraki villalar count'u artırır ama
       cover'ı override etmez (deterministik). */
    const result: Record<string, CategoryCover> = {};
    for (const rel of rels as Array<{
      type_id: string | null;
      villa_id: string | null;
    }>) {
      const typeId = rel?.type_id;
      const vid = rel?.villa_id;
      if (!typeId || !vid) continue;
      const v = villaMap.get(String(vid));
      if (!v) continue; // inactive or soft-deleted villa → atla

      const images = Array.isArray(v.villa_images) ? v.villa_images : [];
      const sorted = [...images].sort((a, b) => {
        if (a?.is_cover) return -1;
        if (b?.is_cover) return 1;
        return (a?.sort_order ?? 0) - (b?.sort_order ?? 0);
      });
      /* 🛡️ Aşama A + bucket-fix — resolveVillaImageUrl: image_url
         FULL URL/relative path dual-format desteği; villa-images bucket.
         coverImageUrl her zaman render-edilebilir URL string'i veya
         null. */
      const firstRaw = sorted.find(
        (i) => typeof i?.image_url === "string" && i.image_url.trim().length > 0
      )?.image_url as string | undefined;
      const firstUrl = resolveVillaImageUrl(firstRaw) ?? undefined;

      const key = String(typeId);
      const existing = result[key];
      if (!existing) {
        result[key] = {
          coverImageUrl: firstUrl ?? null,
          villaCount: 1,
        };
      } else {
        result[key] = {
          coverImageUrl: existing.coverImageUrl || firstUrl || null,
          villaCount: existing.villaCount + 1,
        };
      }
    }
    return result;
  },
  ["category-covers:get"],
  { tags: ["villas", "taxonomy"], revalidate: 600 }
);

/* ===============================================================
   🛡️ LOCATION VILLA COUNTS — homepage "Bölgeler" navigation için
   ===============================================================
   Her location_id için aktif villa sayısı. Tek SELECT:
     villa where is_active=true AND deleted_at IS NULL → location_id
   JS-side aggregate. Junction tablo yok (CategoryCovers'tan farklı).
   N+1 yok; tek round-trip.

   Tags: ["villas", "taxonomy"] — villa CRUD veya location CRUD
   invalidate eder. TTL 10 dakika (CategoryCovers ile aynı).

   Serialization: Record<locationId, count> (JSON-safe Map değil).
=============================================================== */
export const getCachedLocationVillaCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const { data, error } = await supabase
      .from("villa")
      .select("location_id")
      .eq("is_active", true)
      .is("deleted_at", null);

    if (error || !data) {
      if (error) {
        console.error(
          "[cache.locationVillaCounts] FAILED",
          error.message
        );
      }
      return {};
    }

    const result: Record<string, number> = {};
    for (const row of data as Array<{ location_id: string | null }>) {
      const lid = row?.location_id;
      if (!lid) continue;
      const key = String(lid);
      result[key] = (result[key] ?? 0) + 1;
    }
    return result;
  },
  ["location-villa-counts:get"],
  { tags: ["villas", "taxonomy"], revalidate: 600 }
);

/** Villa types — read-only taxonomy. Tag: "taxonomy".
 *  🛡️ slug field (migration 008): SEO-friendly URL kontratı için
 *  hem id hem slug seçiyoruz. Eski kayıtlarda slug NULL olabilir
 *  (FE/URL layer slug NULL'sa UUID'ye düşer). */
export const getCachedVillaTypes = unstable_cache(
  async () => {
    /* 🛡️ select("*") — migration 061 `show_on_homepage` kolonunu da getirir.
       DEPLOY-SAFE: kolon henüz yoksa (migration uygulanmadıysa) explicit
       select hata verirdi; "*" hata vermez, alan undefined gelir →
       CategoryCollection `!== false` ile undefined'ı görünür sayar →
       migration öncesi "hepsi görünür" davranışı korunur. */
    const { data, error } = await supabase
      .from("villa_types")
      .select("*")
      .order("name", { ascending: true });
    if (error) {
      console.error("[cache.villaTypes] FAILED", error.message);
      return [];
    }
    return (data || []) as Array<{
      id: string;
      name: string;
      slug: string | null;
      /** Relative storage path (migration 010). NULL → görseli yok.
       *  Public URL üretimi için: lib/storage.helpers > getCategoryCoverPublicUrl */
      cover_image: string | null;
      /** Migration 061 — homepage kategori slider gösterimi. Migration
       *  öncesi undefined olabilir (deploy-safe); `!== false` → görünür. */
      show_on_homepage?: boolean | null;
    }>;
  },
  ["villa-types:get"],
  { tags: ["taxonomy"], revalidate: 3600 }
);
