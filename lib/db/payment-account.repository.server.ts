import "server-only";

import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ PAYMENT ACCOUNT — SERVER-ONLY READ REPOSITORY (service-role)
   ===============================================================
   `payment-account.server.ts` içindeki inline
   `getSupabaseAdmin().from("payment_accounts")...` read'inin BİREBİR
   taşınmış hali (western-union-account.repository.server.ts ile aynı
   pattern). Davranış değişmez:
     - `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     - `dbAdmin` (service-role, SUPABASE_SERVICE_ROLE_KEY) → RLS bypass
       (migration 034: payment_accounts anon erişim sıfır).
     - select / eq / order / limit / maybeSingle AYNEN.
     - Supabase native cevabı OLDUĞU GİBİ döner: `{ data, error, status,
       ... }`. `status` DROP EDİLMEZ — caller log'unda kullanılıyor.
     - throw YOK, log YOK; fail-safe try/catch + logging SERVICE'te.
=============================================================== */

export const paymentAccountRepository = {
  async findActive() {
    return await dbAdmin
      .from("payment_accounts")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  },
};
