"use server";

import { updateTag } from "next/cache";

/* ===============================================================
   🛡️ REVALIDATE ACTIONS — admin mutation sonrası cache invalidation
   ===============================================================
   Admin client component'lerinden çağrılan server action'lar.
   "use server" directive ile tüm export'lar RPC haline gelir.

   API SEÇİMİ (Next.js 16):
     `updateTag(tag)` — server action'lar için tercih edilen API
     (read-your-own-writes semantic'i, single-arg).
     `revalidateTag(tag, profile)` — route handler'lar için, iki-arg.
     Bu dosya "use server" olduğu için updateTag kullanılır.

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
  updateTag("settings");
}

export async function revalidateMenu(): Promise<void> {
  updateTag("menu");
}

export async function revalidateVillas(): Promise<void> {
  updateTag("villas");
}

export async function revalidateTaxonomy(): Promise<void> {
  updateTag("taxonomy");
}

/* 🛡️ Anasayfa manuel koleksiyon (migration 012).
   Admin homepage_collections CRUD sonrası çağrılır. VillaList
   bu tag'i kullanır. "villas" tag'inden AYRI çünkü villa CRUD
   homepage curasyonunu invalidate etmesin (admin sıra değişmemiş
   ama bir villa edit'lendi → koleksiyon cache'i gereksizyere
   temizlenmesin). */
export async function revalidateHomepage(): Promise<void> {
  updateTag("homepage");
}

/* 🛡️ Global SSS (Faz 25). Admin /maki-admin/faqs sayfasında
   replaceFaqs sonrası çağrılır. Homepage FAQ section'ı bu tag'i
   kullanan getCachedFaqs ile beslenir. */
export async function revalidateFaqs(): Promise<void> {
  updateTag("faqs");
}

/* 🛡️ Villa Reviews (Faz 33). Admin /maki-admin/reviews ekranında
   approve / unapprove / delete / toggleFeatured sonrası ve public
   tarafında createVillaReview sonrası çağrılır.
   Tag: "villa-reviews" — getCachedVillaReviews + getCachedVillaReviewStats
   her iki helper bu tag altında — tek invalidate her ikisini temizler. */
export async function revalidateVillaReviews(): Promise<void> {
  updateTag("villa-reviews");
}
