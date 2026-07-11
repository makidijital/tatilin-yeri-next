import type { SupabaseClient } from "@supabase/supabase-js";

import { db } from "@/lib/db";

/* ===============================================================
   🛡️ VILLA IMAGES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa_images` satır erişimi. Davranış değişmez:
     - `db` = anon (RLS aktif); tüm method'lar tek query, ham sonuç döner.

   ⚠️ OPSİYONEL `client` (geriye uyumlu, default `db`):
     Verilmezse anon `db` (mevcut davranış birebir). Server bağlamında
     session-aware bir client geçilebilir (admin write RLS session'ı
     server tarafında da taşınsın). PricingCalendarCanvas'taki DI
     deseniyle aynı.

   ⚠️ STORAGE LOGIC BURADA DEĞİL — parseVillaStorageUrl /
      removeVillaImageByUrl / removeVillaStorageFiles SERVICE'te.
=============================================================== */

type FromClient = Pick<SupabaseClient, "from">;

export const villaImageRepository = {
  /** #1 — gallery read, sort_order ASC. */
  async findByVillaIdOrdered(villaId: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .select("*")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: true });
  },

  /** #2 — max sort_order (limit 1, DESC, maybeSingle). */
  async findMaxSortOrder(villaId: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .select("sort_order")
      .eq("villa_id", villaId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
  },

  /** #3 — mevcut cover var mı (id, is_cover=true, maybeSingle). */
  async findCoverId(villaId: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .select("id")
      .eq("villa_id", villaId)
      .eq("is_cover", true)
      .maybeSingle();
  },

  /** #4 — image insert (payload service'te kurulur). */
  async insert(payload: Record<string, unknown>, client: FromClient = db) {
    return await client.from("villa_images").insert(payload);
  },

  /** #5 — tek satır sort_order update (service Promise.all map'ler). */
  async updateSortOrderById(
    id: string,
    sortOrder: number,
    client: FromClient = db
  ) {
    return await client
      .from("villa_images")
      .update({ sort_order: sortOrder })
      .eq("id", id);
  },

  /** #6 — villa'daki tüm cover'ları temizle (clear adımı). */
  async clearCoverByVilla(villaId: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .update({ is_cover: false })
      .eq("villa_id", villaId);
  },

  /** #7 — seçileni cover yap (set adımı). */
  async setCoverById(id: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .update({ is_cover: true })
      .eq("id", id);
  },

  /** #8 — delete öncesi image_url fetch (storage cleanup için). */
  async findImageUrlById(id: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .select("image_url")
      .eq("id", id)
      .maybeSingle();
  },

  /** #9 — tekil DB delete. */
  async deleteById(id: string, client: FromClient = db) {
    return await client.from("villa_images").delete().eq("id", id);
  },

  /** #10 — bulk delete öncesi tüm image_url'ler. */
  async findImageUrlsByVilla(villaId: string, client: FromClient = db) {
    return await client
      .from("villa_images")
      .select("image_url")
      .eq("villa_id", villaId);
  },

  /** #11 — villa-scoped batch DB delete. */
  async deleteByVilla(villaId: string, client: FromClient = db) {
    return await client.from("villa_images").delete().eq("villa_id", villaId);
  },
};
