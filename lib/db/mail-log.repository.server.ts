import "server-only";

import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ MAIL LOG — SERVER-ONLY WRITE REPOSITORY (service-role)
   ===============================================================
   `mail_logs` tablosu RLS PHASE 2 (migration 038) sonrası admin-only:
   anon ve normal authenticated INSERT REDDEDILIR. mail_logs INSERT'i
   PUBLIC mail flow'larından (auth YOK: reservation-request / -approved /
   -cancelled) tetiklendiği için bu yazımlar SERVICE ROLE ile yapılmak
   zorunda — service_role RLS'i bypass eder.

   GÜVENLİK SINIRI (lib/payment-account.server.ts ile aynı konvansiyon):
     • `import "server-only"` — bu dosya CLIENT bundle'a sızarsa Next.js
       BUILD HATA verir. Net defansif guard.
     • `getSupabaseAdmin()` SUPABASE_SERVICE_ROLE_KEY okur (NEXT_PUBLIC_
       prefix YOK) → yalnız server runtime. Client bundle'da expose YOK.

   NEDEN AYRI DOSYA (read repo'dan ayrıştırma):
     `lib/db/mail-log.repository.ts` READ (findRecent) için anon client
     kullanır ve admin `system-logs` CLIENT component'inden import edilir.
     Service-role insert'i aynı dosyaya koymak getSupabaseAdmin import'unu
     client bundle'a sokardı (attack surface). Split → write yalnız bu
     server dosyasında.

   CALLER:
     • app/services/mail-log.write.server.ts → insertMailLog (server)
       └─ app/lib/mail/send.ts (mail pipeline, route handler'lardan)

   DAVRANIŞ:
     - INSERT payload shape DEĞİŞMEZ (caller mapping aynen).
     - Supabase native `{ data, error }` döner; throw YOK, log YOK
       (üst katman insertMailLog console tag + boolean döner).
=============================================================== */

export const mailLogServerRepository = {
  async insert(payload: Record<string, unknown>) {
    return await dbAdmin.from("mail_logs").insert(payload);
  },
};
