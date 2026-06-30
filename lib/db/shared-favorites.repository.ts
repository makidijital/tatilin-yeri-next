import { db } from "@/lib/db";

/* ===============================================================
   🛡️ SHARED FAVORITES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `shared-favorites.service.ts` içindeki inline `supabase.from(...)`
   çağrılarının BİREBİR taşınmış hali (single table:
   shared_favorite_lists). Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif); `db.from` ≡
       `supabase.from` (bind) → byte-identical.
     - Method'lar ham native sonucu (`{ data, error }` / maybeSingle) döner.

   TOKEN / EXPIRY KORUNUR:
     - token üretimi (~48-bit), collision retry (23505 kontrolü),
       expires_at ISO hesabı, expiry guard — hepsi SERVICE'te kalır.
     - revoked_at YOK (bu tabloda kolon yok); guard eklenmez.
     - cleanup pg_cron (migration 057) tarafında.
   SELECT projeksiyonu, `.eq("token", ...)`, `.maybeSingle()` AYNEN.
=============================================================== */

export const sharedFavoritesRepository = {
  async create(payload: Record<string, unknown>) {
    return await db.from("shared_favorite_lists").insert(payload);
  },

  async findByToken(token: string) {
    return await db
      .from("shared_favorite_lists")
      .select("token, villa_ids, created_at, expires_at")
      .eq("token", token)
      .maybeSingle();
  },
};
