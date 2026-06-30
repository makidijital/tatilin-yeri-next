import { db } from "@/lib/db";

/* ===============================================================
   🛡️ RULE ITEMS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `rule-item.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in
       kullandığı `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       embed-map / trim-validation / return / log SERVICE'te.

   ⚠️ DB kolonu "title" (name DEĞİL).
   ⚠️ M:N — villa_rule_relations read/write'ları DISCRETE method;
       relation logic merge EDİLMEZ; relation-delete-first ordering
       SERVICE'te. Embedded select string AYNEN (byte-identical).
=============================================================== */

export const ruleItemRepository = {
  /** Admin — tüm kurallar (id, title), created_at DESC. */
  async findAll() {
    return await db
      .from("rule_items")
      .select("id, title")
      .order("created_at", { ascending: false });
  },

  /** Front — villaya ait kurallar (villa_rule_relations embed). */
  async findRulesByVilla(villaId: string) {
    return await db
      .from("villa_rule_relations")
      .select(`
      rule_items (
        id,
        title
      )
    `)
      .eq("villa_id", villaId);
  },

  async insert(payload: Record<string, unknown>) {
    return await db.from("rule_items").insert(payload);
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("rule_items").update(payload).eq("id", id);
  },

  /** M:N — kurala bağlı tüm relation'ları sil (rule_id ile). */
  async deleteRelationsByRuleId(id: string) {
    return await db
      .from("villa_rule_relations")
      .delete()
      .eq("rule_id", id);
  },

  async deleteById(id: string) {
    return await db.from("rule_items").delete().eq("id", id);
  },
};
