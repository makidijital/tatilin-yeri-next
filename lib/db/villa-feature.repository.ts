import { db } from "@/lib/db";

/* ===============================================================
   🛡️ VILLA FEATURES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `villa-feature.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in
       kullandığı `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       embed-map / validation / return / log SERVICE'te.

   ⚠️ M:N — villa_feature_relations write/read'leri DISCRETE method:
       relation logic merge EDİLMEZ. Relation-delete-first ordering
       SERVICE'te korunur. Embedded select string AYNEN (byte-identical).
=============================================================== */

export const villaFeatureRepository = {
  /** Admin — tüm feature'lar (id, name), created_at DESC. */
  async findAll() {
    return await db
      .from("villa_features")
      .select("id, name")
      .order("created_at", { ascending: false });
  },

  /** GET — public taxonomy slim projeksiyon (id, name); order YOK.
   *  app/api/public/taxonomies route için BİREBİR. `findAll`'dan farkı:
   *  order YOK (public form dropdown; sıra caller/DB natural). */
  async findAllForPublicTaxonomy() {
    return await db.from("villa_features").select("id, name");
  },

  /** GET — `select("*")` (order YOK). Admin villa edit page olanak listesi.
   *  `findAll` (id,name + order created_at DESC) DEĞİL — bu `*` order-suz.
   *  BİREBİR. */
  async findAllStar() {
    return await db.from("villa_features").select("*");
  },

  /** GET — villa'nın seçili feature_id'leri (villa_feature_relations).
   *  Admin villa edit page selected-features. `.select("feature_id")
   *  .eq("villa_id")` BİREBİR; map caller'da. */
  async findFeatureIdsByVilla(villaId: string) {
    return await db
      .from("villa_feature_relations")
      .select("feature_id")
      .eq("villa_id", villaId);
  },

  /** Front — villaya ait feature'lar (villa_feature_relations embed). */
  async findFeaturesByVilla(villaId: string) {
    return await db
      .from("villa_feature_relations")
      .select(`
      villa_features (
        id,
        name
      )
    `)
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("villa_features").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("villa_features").update(payload).eq("id", id);
  },

  /** M:N — feature'a bağlı tüm relation'ları sil (feature_id ile). */
  async deleteRelationsByFeatureId(id: string) {
    return await db
      .from("villa_feature_relations")
      .delete()
      .eq("feature_id", id);
  },

  async deleteById(id: string) {
    return await db.from("villa_features").delete().eq("id", id);
  },
};
