import type { SupabaseClient } from "@supabase/supabase-js";

import { db } from "@/lib/db";

/* ===============================================================
   🛡️ OFFER REQUESTS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `offer-request.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali (single table: offer_requests).
   Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif); `db.from` ≡
       `supabase.from` (bind) → byte-identical.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       sanitize / validation / echo-diff / return / log SERVICE'te.

   ⚠️ CLIENT INJECTION KORUNDU — `createOfferRequest(input, { client })`
      public route (api/public/offer-requests) RLS context'i için kendi
      client'ını geçer. `create(payload, client?)`: client verilirse o,
      yoksa `db` (eski `?? supabase` davranışıyla aynı). select("...")
      echo projeksiyonu ve `.single()` AYNEN.
=============================================================== */

export const offerRequestRepository = {
  /** Public insert + canonical echo SELECT (.single()). client opsiyonel. */
  async create(
    payload: Record<string, unknown>,
    client?: Pick<SupabaseClient, "from">
  ) {
    return await (client ?? db)
      .from("offer_requests")
      .insert(payload)
      .select(
        "id, adults, children, region_tokens, villa_type_tokens, feature_tokens, budget_min, budget_max"
      )
      .single();
  },

  /** Admin listing — tümü, created_at DESC. */
  async findAll() {
    return await db
      .from("offer_requests")
      .select("*")
      .order("created_at", { ascending: false });
  },

  async findById(id: string) {
    return await db
      .from("offer_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
  },

  async updateById(id: string, payload: Record<string, unknown>) {
    return await db.from("offer_requests").update(payload).eq("id", id);
  },

  async deleteById(id: string) {
    return await db.from("offer_requests").delete().eq("id", id);
  },
};
