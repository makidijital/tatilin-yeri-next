import { db } from "@/lib/db";

/* ===============================================================
   🛡️ VILLA LOCATIONS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa_locations` tablosu — read-side taxonomy. cache.helpers >
   getCachedVillaLocations'ın inline `supabase.from("villa_locations")`
   sorgusunun BİREBİR taşınmış hali.

   ⚠️ NEDEN AYRI REPO:
     Mevcut `menu.repository.ts > findAllVillaLocations` FARKLI bir
     projeksiyon kullanır (`id, name, slug, filter_group_name`); bu
     taxonomy cache zengin projeksiyon (`+ cover_image, show_in_filter`)
     ve `name ASC` order ister. Reuse byte-identical OLMAZDI → ayrı
     dedicated repo (villa_locations için ilk repo).

   DAVRANIŞ (villa-type.repository konvansiyonu):
     - `db` = supabaseDbProvider (anon, RLS) → cache.helpers'ın kullandığı
       `@/lib/supabase` ile aynı PostgrestQueryBuilder → byte-identical.
     - Native `{ data, error }` döner; repo sessiz.
     - cover_v cache-bust timestamp + mapping cache.helpers'ta KALIR.
=============================================================== */

export const villaLocationRepository = {
  /** GET — taxonomy projeksiyon, name ASC. cache.helpers >
   *  getCachedVillaLocations için BİREBİR (select + order). */
  async findAllForTaxonomy() {
    return await db
      .from("villa_locations")
      .select(
        "id, name, slug, cover_image, show_in_filter, filter_group_name"
      )
      .order("name", { ascending: true });
  },
};
