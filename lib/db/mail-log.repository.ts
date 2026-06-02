import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FAZ 40 — MAIL LOG REPOSITORY (READ-ONLY, anon)
   ===============================================================
   `mail_logs` tablosu — mail audit paginated read.

   ⚠️ READ yalnız: List = created_at DESC + limit. Bu repository admin
   `system-logs` CLIENT component'inden (anon client + authenticated admin
   session) çağrılır; RLS PHASE 2 (migration 038) sonrası okuma
   is_active_admin() policy'si ile authenticated admin olarak çalışır.

   ⚠️ INSERT BURADA YOK (migration 038 sonrası anon yazma RLS ile
   reddedilir). mail_logs INSERT'i SERVICE-ROLE ile server-only yapılır:
     → lib/db/mail-log.repository.server.ts (mailLogServerRepository.insert)
     → app/services/mail-log.write.server.ts (insertMailLog)
=============================================================== */

export const mailLogRepository = {
  async findRecent(limit: number) {
    return await db
      .from("mail_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
  },
};
