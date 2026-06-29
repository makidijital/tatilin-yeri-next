"use server";

import { revalidateTag } from "next/cache";

/* ===============================================================
   🛡️ REVALIDATE ACTIONS — admin mutation sonrası cache invalidation
   ===============================================================
   Admin client component'lerinden çağrılan server action'lar.
   "use server" directive ile tüm export'lar RPC haline gelir.

   ⚠️ API: `revalidateTag(tag)` KULLANILIR.
     lib/cache.helpers.ts'teki cached helper'lar `unstable_cache(...,
     { tags: [...] })` ile kuruluyor. `unstable_cache` tag'leri YALNIZ
     `revalidateTag` ile invalidate olur. `updateTag` yeni "use cache"/
     cacheTag sistemi içindir ve unstable_cache kayıtlarına DOKUNMAZ →
     kullanılırsa admin mutation public cache'i temizlemez (stale, TTL
     dolana kadar admin değişikliği frontend'e yansımaz).

   TAGS ↔ CACHED HELPERS (lib/cache.helpers.ts):
     "settings"  → getCachedSettings
     "menu"      → getCachedMenu (CMS page değişikliği de etkiler;
                   menu auto-include pages)
     "villas"    → getCachedVillas
     "taxonomy"  → getCachedVillaLocations / getCachedVillaTypes
     "homepage"  → getCachedHomepageCollectionVillas (migration 012)

   Bu action'lar idempotent. Birden fazla çağrı side-effect üretmez.
   =============================================================== */

export async function revalidateSettings(): Promise<void> {
  revalidateTag("settings", "max");
}

export async function revalidateMenu(): Promise<void> {
  revalidateTag("menu", "max");
}

export async function revalidateVillas(): Promise<void> {
  revalidateTag("villas", "max");
}

export async function revalidateTaxonomy(): Promise<void> {
  revalidateTag("taxonomy", "max");
}

/* 🛡️ Anasayfa manuel koleksiyon (migration 012).
   Admin homepage_collections CRUD sonrası çağrılır. VillaList
   bu tag'i kullanır. "villas" tag'inden AYRI çünkü villa CRUD
   homepage curasyonunu invalidate etmesin (admin sıra değişmemiş
   ama bir villa edit'lendi → koleksiyon cache'i gereksizyere
   temizlenmesin). */
export async function revalidateHomepage(): Promise<void> {
  revalidateTag("homepage", "max");
}

/* 🛡️ Global SSS (Faz 25). Admin /maki-admin/faqs sayfasında
   replaceFaqs sonrası çağrılır. Homepage FAQ section'ı bu tag'i
   kullanan getCachedFaqs ile beslenir. */
export async function revalidateFaqs(): Promise<void> {
  revalidateTag("faqs", "max");
}

/* 🛡️ Villa Reviews (Faz 33). Admin /maki-admin/reviews ekranında
   approve / unapprove / delete / toggleFeatured sonrası ve public
   tarafında createVillaReview sonrası çağrılır.
   Tag: "villa-reviews" — getCachedVillaReviews + getCachedVillaReviewStats
   her iki helper bu tag altında — tek invalidate her ikisini temizler. */
export async function revalidateVillaReviews(): Promise<void> {
  revalidateTag("villa-reviews", "max");
}
