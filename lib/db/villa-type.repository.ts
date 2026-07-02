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

  /** GET — tümü, name ASC. cache.helpers > getCachedVillaTypes (taxonomy
   *  cache) için. `findAll`'dan TEK farkı sıralama (name ASC vs created_at
   *  DESC); select("*") AYNEN (migration 061 show_on_homepage deploy-safe).
   *  Mapping/cover_v timestamp caller (cache.helpers) tarafında kalır. */
  async findAllByName() {
    return await db
      .from("villa_types")
      .select("*")
      .order("name", { ascending: true });
  },

  /** GET — public taxonomy slim projeksiyon (id, name, slug); order YOK.
   *  app/api/public/taxonomies route için BİREBİR. `findAll`/`findAllByName`
   *  select("*") + order kullanır; bu public dropdown için slim + order-suz. */
  async findAllForPublicTaxonomy() {
    return await db.from("villa_types").select("id, name, slug");
  },

  /** GET — `select("*")` (order YOK). Admin villa edit page tip listesi.
   *  `findAll` (order created_at DESC) DEĞİL — bu order-suz. BİREBİR. */
  async findAllStarUnordered() {
    return await db.from("villa_types").select("*");
  },

  /** GET — villa'nın seçili type_id'leri (villa_type_relations). Admin
   *  villa edit page selected-types. `.select("type_id").eq("villa_id")`
   *  BİREBİR; map caller'da. */
  async findTypeIdsByVilla(villaId: string) {
    return await db
      .from("villa_type_relations")
      .select("type_id")
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_types").insert(payload);
  },

  /** UPDATE by id — name/slug, cover_image, show_on_homepage hepsi buradan. */
  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("villa_types").update(payload).eq("id", id);
  },

  /** GET — tüm (type_id, villa_id) eşleşmeleri. cache.helpers >
   *  getCachedCategoryCovers 2-step JS-join'inin 1. adımı. Select
   *  shape BİREBİR ("type_id, villa_id"); filter/order YOK. Aggregate
   *  (cover seçimi + count) caller'da KALIR. */
  async findAllRelations() {
    return await db
      .from("villa_type_relations")
      .select("type_id, villa_id");
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
