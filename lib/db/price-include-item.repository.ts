import { db } from "@/lib/db";

/* ===============================================================
   🛡️ PRICE INCLUDE ITEMS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `price-include-item.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in
       kullandığı `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       embed-map / trim-validation / return / log SERVICE'te.

   ⚠️ DB kolonu "title"; relation kolonu "include_id".
   ⚠️ M:N — villa_price_include_relations read/write'ları DISCRETE
       method; relation logic merge EDİLMEZ. NOT: relation-delete
       hatasında SERVICE `return false` yapar (feature/rule'dan farklı)
       — bu karar SERVICE'te kalır. Embedded select string AYNEN.
=============================================================== */

export const priceIncludeItemRepository = {
  /** Admin — tüm price include'lar (id, title), created_at DESC. */
  async findAll() {
    return await db
      .from("price_include_items")
      .select("id, title")
      .order("created_at", { ascending: false });
  },

  /** Front — villaya ait price includes (relation embed). */
  async findIncludesByVilla(villaId: string) {
    return await db
      .from("villa_price_include_relations")
      .select(`
      price_include_items (
        id,
        title
      )
    `)
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("price_include_items").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("price_include_items").update(payload).eq("id", id);
  },

  /** M:N — include'a bağlı tüm relation'ları sil (include_id ile). */
  async deleteRelationsByIncludeId(id: string) {
    return await db
      .from("villa_price_include_relations")
      .delete()
      .eq("include_id", id);
  },

  async deleteById(id: string) {
    return await db.from("price_include_items").delete().eq("id", id);
  },
};
