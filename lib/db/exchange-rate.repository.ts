import { db } from "@/lib/db";

/* ===============================================================
   🛡️ EXCHANGE RATES REPOSITORY (Phase 1 — repo consolidation)
   ===============================================================
   `exchange-rate.service.ts` içindeki inline `supabase.from(...)`
   read'lerinin BİREBİR taşınmış hali (single table: exchange_rates).
   Davranış değişmez:
     - `db` = supabaseDbProvider (anon, RLS aktif); `db.from` ≡
       `supabase.from` (bind) → byte-identical.
     - Method'lar ham native sonucu (`{ data, error }`) döner;
       map/aggregate/return/log SERVICE'te.

   NOT: Bu service yalnız READ. Refresh/upsert /api/exchange-rates
        route'unda; burada DOKUNULMADI.
   İki ayrı select projeksiyonu → iki method (merge YOK).
=============================================================== */

export const exchangeRateRepository = {
  /** select("*") — getExchangeRates. */
  async findAll() {
    return await db.from("exchange_rates").select("*");
  },

  /** select("code, rate, updated_at") — getExchangeRatesMap. */
  async findCodeRateUpdated() {
    return await db
      .from("exchange_rates")
      .select("code, rate, updated_at");
  },
};
