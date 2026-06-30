import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FINANCE REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `finance.service.ts` içindeki inline `supabase.from("reservations")`
   read'inin BİREBİR taşınmış hali (read-only KPI aggregate kaynağı).
   Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif → authenticated admin
       session ile is_active_admin policy match); `db.from` ≡
       `supabase.from` (bind) → byte-identical.
     - Method ham native sonucu (`{ data, error }`) döner; tüm finans
       aggregation/sum/count/gate SERVICE'te.

   DAVRANIŞ:
     - SELECT "status, total_price_try, reservation_commission_amount"
       + `.in("status", ...)` AYNEN.
     - status allow-list (FINANCE_BLOCKING_STATUSES) ve `since` date math
       SERVICE'te → parametre olarak gelir (drift yok).
     - Koşullu `.gte("created_at", sinceISO)` chain'i AYNEN (sinceISO
       undefined → "all" preset → filter uygulanmaz).
=============================================================== */

export const financeRepository = {
  async findReservationsForKpi(
    statuses: readonly string[],
    sinceISO?: string
  ) {
    let query = db
      .from("reservations")
      .select("status, total_price_try, reservation_commission_amount")
      .in("status", statuses);

    if (sinceISO) {
      /* Aynı query üzerinde koşullu filter; duplicate query oluşmaz. */
      query = query.gte("created_at", sinceISO);
    }

    return await query;
  },
};
