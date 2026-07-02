import "server-only";

import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ SHORT GAPS — SERVER-ONLY REPOSITORY (service-role)
   ===============================================================
   Kısa süreli tarih fırsatları (short-gap) domain'inin service-role
   I/O'su. `/api/cron/short-gaps-refresh` (Coolify scheduled task) bu
   repo üzerinden `refresh_villa_short_gaps()` SECURITY DEFINER
   fonksiyonunu tetikler. Anon repository (`short-gaps.repository.ts`)
   public read'i (`get_short_gap_counts`) AYNEN sürdürür — bu server
   repo ONUN DUPLİKASYONU DEĞİL, service-role karşılığıdır.

   ⚠️ AUTH PATH:
     `dbAdmin.rpc` ≡ `getSupabaseAdmin().rpc` (dbAdmin wrapper) →
     cron route'unun eski inline çağrısıyla BYTE-IDENTICAL. Anon `db`'ye
     düşürmek execution path'i değiştirir; ASLA yapılmaz.

   GÜVENLİK SINIRI (pages/menu/blog .server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → service-role (SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_
       prefix yok) → yalnız server runtime.

   DAVRANIŞ:
     - Native Supabase `{ data, error }` döner; repo sessiz. count
       normalize + error-mapping + log caller (route) tarafında.
   =============================================================== */

export const shortGapsServerRepository = {
  /** Refresh — `refresh_villa_short_gaps()` (arg YOK); villa_short_gaps
   *  precompute tablosunu tazeler, ufku bir gün ileri kaydırır. Dönüş
   *  integer (yazılan satır sayısı). */
  async refreshVillaShortGaps() {
    return await dbAdmin.rpc("refresh_villa_short_gaps");
  },
};
