import { db } from "@/lib/db";

/* ===============================================================
   🛡️ VILLA IMAGES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa-image.service.ts` içindeki inline `supabase.from("villa_images")`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in kullandığı
       `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - HER orijinal query için TEK method (merge YOK) → service'in
       multi-step orchestration'ı (cover check→insert, clear→set cover,
       max+1 sort, Promise.all reorder, DB-first delete) AYNEN korunur.
     - Method'lar ham native sonucu (`{ data, error }` / maybeSingle) döner.

   ⚠️ STORAGE LOGIC BURADA DEĞİL — parseVillaStorageUrl /
      removeVillaImageByUrl / removeVillaStorageFiles / bucket SERVICE'te.
      Bu repo yalnız `villa_images` satırlarına dokunur.
=============================================================== */

export const villaImageRepository = {
  /** #1 — gallery read, sort_order ASC. */
  async findByVillaIdOrdered(villaId: string) {
    return await db
      .from("villa_images")
      .select("*")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: true });
  },

  /** #2 — max sort_order (limit 1, DESC, maybeSingle). */
  async findMaxSortOrder(villaId: string) {
    return await db
      .from("villa_images")
      .select("sort_order")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** #3 — mevcut cover var mı (id, is_cover=true, maybeSingle). */
  async findCoverId(villaId: string) {
    return await db
      .from("villa_images")
      .select("id")
      .eq("villa_id", villaId)
      .eq("is_cover", true)
      .maybeSingle();
  },

  /** #4 — image insert (payload service'te kurulur). */
  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_images").insert(payload);
  },

  /** #5 — tek satır sort_order update (service Promise.all map'ler). */
  async updateSortOrderById(id: string, sortOrder: number) {
    return await db
      .from("villa_images")
      .update({ sort_order: sortOrder })
      .eq("id", id);
  },

  /** #6 — villa'daki tüm cover'ları temizle (clear adımı). */
  async clearCoverByVilla(villaId: string) {
    return await db
      .from("villa_images")
      .update({ is_cover: false })
      .eq("villa_id", villaId);
  },

  /** #7 — seçileni cover yap (set adımı). */
  async setCoverById(id: string) {
    return await db
      .from("villa_images")
      .update({ is_cover: true })
      .eq("id", id);
  },

  /** #8 — delete öncesi image_url fetch (storage cleanup için). */
  async findImageUrlById(id: string) {
    return await db
      .from("villa_images")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();
  },

  /** #9 — tekil DB delete. */
  async deleteById(id: string) {
    return await db.from("villa_images").delete().eq("id", id);
  },

  /** #10 — bulk delete öncesi tüm image_url'ler. */
  async findImageUrlsByVilla(villaId: string) {
    return await db
      .from("villa_images")
      .select("image_url")
      .eq("villa_id", villaId);
  },

  /** #11 — villa-scoped batch DB delete. */
  async deleteByVilla(villaId: string) {
    return await db.from("villa_images").delete().eq("villa_id", villaId);
  },
};
