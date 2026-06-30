import "server-only";

import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ ADMIN ACTIVITY LOG — SERVER-ONLY WRITE REPOSITORY (service-role)
   ===============================================================
   `admin_activity_logs` INSERT'i RLS PHASE 2 (migration 038) sonrası
   service-role ile yapılır. `admin-activity-log.service.ts` içindeki
   inline `getSupabaseAdmin().from("admin_activity_logs").insert(...)`
   çağrısının BİREBİR taşınmış hali (Phase 1 repo consolidation).

   GÜVENLİK SINIRI (mail-log.repository.server.ts ile aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` (service-role, SUPABASE_SERVICE_ROLE_KEY) → RLS bypass.

   DAVRANIŞ:
     - INSERT payload shape DEĞİŞMEZ — sanitizeForAudit / boundJsonSize /
       slice / field mapping hepsi SERVICE'te kalır; bu repo yalnız
       hazır payload'ı insert eder.
     - Supabase native `{ data, error }` döner; throw YOK, log YOK
       (fail-safe try/catch + console.warn SERVICE'te).
=============================================================== */

export const adminActivityLogRepository = {
  async insert(payload: Record<string, unknown>) {
    return await dbAdmin.from("admin_activity_logs").insert(payload);
  },
};
