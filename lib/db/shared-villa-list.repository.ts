import { db } from "@/lib/db";

/* ===============================================================
   🛡️ SHARED VILLA LISTS REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `shared-villa-list.service.ts` içindeki inline
   `supabase.from("shared_villa_lists")...` çağrılarının BİREBİR
   taşınmış hali. Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif) → service'in
       kullandığı `@/lib/supabase` ile aynı PostgrestQueryBuilder.
     - Method'lar ham query sonucunu (`{ data, error }`) döner.

   TOKEN / EXPIRY KORUNUR:
     - token üretimi, ~48-bit entropy, collision retry (23505 kontrolü),
       expires_at ISO hesabı, allow-list TTL — hepsi SERVICE'te kalır.
     - Bu repo yalnız hazır payload'ı insert eder ve token ile select
       yapar. `expires_at` payload'ın parçası; expiry guard SERVICE'te.
     - cleanup (`expires_at < now()`) pg_cron (migration 036) tarafında;
       bu dosyada YOK → repo'ya eklenmedi.

   SELECT projeksiyonu, `.eq("token", ...)`, `.maybeSingle()` AYNEN.
=============================================================== */

export const sharedVillaListRepository = {
  async create(payload: Record<string, unknown>) {
    return await db.from("shared_villa_lists").insert(payload);
  },

  async findByToken(token: string) {
    return await db
      .from("shared_villa_lists")
      .select(
        "token, villa_ids, search_params, title, note, created_at, expires_at, revoked_at"
      )
      .eq("token", token)
      .maybeSingle();
  },
};
