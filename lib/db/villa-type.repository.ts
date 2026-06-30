import { db } from "@/lib/db";

/* ===============================================================
   🛡️ VILLA TYPES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa-type.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in
       kullandığı `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - Method'lar ham native sonucu (`{ data, error }`) döner.
     - slug üretimi (slugifyTr), validation, return/log SERVICE'te.
     - `updateById` generic'tir: updateVillaType / setVillaTypeCover /
       setVillaTypeHomepage HEPSİ `villa_types.update(payload).eq("id")`
       AYNI query shape'idir → tek thin method (payload'lar service'te
       ayrı kurulur; logic merge YOK).
=============================================================== */

export const villaTypeRepository = {
  /** GET — tümü, created_at DESC. */
  async findAll() {
    return await db
      .from("villa_types")
      .select("*")
      .order("created_at", { ascending: false });
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_types").insert(payload);
  },

  /** UPDATE by id — name/slug, cover_image, show_on_homepage hepsi buradan. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("villa_types").update(payload).eq("id", id);
  },

  /** DELETE — villa_type_relations (type_id ile) önce temizlenir. */
  async deleteRelationsByTypeId(id: string) {
    return await db
      .from("villa_type_relations")
      .delete()
      .eq("type_id", id);
  },

  async deleteById(id: string) {
    return await db.from("villa_types").delete().eq("id", id);
  },
};
