import "server-only";

import { dbAdminNative as dbAdmin } from "@/lib/db/native";

/* ===============================================================
   🛡️ SETTINGS — SERVER-ONLY READ REPOSITORY (service-role)
   ===============================================================
   `settings` tablosu PHASE 4 (migration 042) sonrası admin-only RLS:
     `settings_admin_only` FOR ALL TO authenticated USING (is_active_admin())
   Anon erişim REDDEDİLİR; authenticated-non-admin REDDEDİLİR.

   Mail pipeline (`/app/lib/mail/client.ts > getMailConfig`) route
   handler bağlamında çalışır — anon Supabase client (`@/lib/supabase`)
   sunucu fetch'lerine session cookie/JWT iliştirmez → RLS DENY →
   `findSingleton` `{ data: null, error: null }` döndürür. Sonuçta
   `apiKey = settings.resend_api_key || env || null`. ENV de yoksa
   `apiKey: null` → `sendMail` precheck "Resend API key yok" → mail
   HİÇ gönderilmez (silent fail; mail_logs status="failed").

   Bu repository, mail pipeline gibi server-only path'lerin settings
   row'unu RLS bypass ile (service-role) okuyabilmesi için sağlanır.
   Anon repository (`lib/db/settings.repository.ts`) admin browser
   client flow'ları (settings edit pages) için aynen kalır — orada
   browser session JWT taşır, `is_active_admin()` true → RLS allow.

   GÜVENLİK SINIRI (reservation.repository.server.ts /
   mail-log.repository.server / payment-account.server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     • `dbAdmin` → `getSupabaseAdmin()` (SUPABASE_SERVICE_ROLE_KEY,
       NEXT_PUBLIC_ prefix yok) → yalnız server runtime.

   DAVRANIŞ — BYTE-IDENTICAL anon repo `findSingleton()`:
     - `.from("settings").select("*").maybeSingle()` AST aynen.
     - Tek fark: `db` → `dbAdmin` (RLS bypass).
     - Return shape Supabase native `{ data, error }`. Repository
       sessiz; throw / console / log YOK. Caller (mail/client.ts)
       error → null fallback; başarı → FULL row (resend_api_key dahil).

   ⚠️ RLS POLİTİKASI DEĞİŞMEDİ:
     Migration 042'nin `settings_admin_only` policy'sine HİÇ
     dokunulmadı. Anon yine reddedilir; service-role yine bypass.
     Mevcut authenticated admin (browser) path'i de anon repo
     üzerinden çalışmaya devam eder.

   CALLER:
     • app/lib/mail/client.ts → getMailConfig (mail pipeline)
   =============================================================== */

export const settingsServerRepository = {
  /** Singleton settings row (FULL — `*`); server-only, service-role.
   *  Anon repo `findSingleton` ile BYTE-IDENTICAL — tek fark dbAdmin. */
  async findSingleton() {
    return await dbAdmin
      .from("settings")
      .select("*")
      .maybeSingle();
  },

  /** ZIP filename için slim projeksiyon (site_name, company_legal_name),
   *  .maybeSingle(). /api/villa-zip/[token] delege. BİREBİR select. */
  async findZipNameFields() {
    return await dbAdmin
      .from("settings")
      .select("site_name, company_legal_name")
      .maybeSingle();
  },

  /** Singleton settings row (FULL `*`) — `.single()` resolver. /api/admin/
   *  settings GET delege. ⚠️ `findSingleton`'dan FARKLI: `.single()`
   *  (maybeSingle DEĞİL) → satır yoksa error (PGRST116) → caller 500.
   *  Bu davranış BİREBİR korunmalı. */
  async findSingletonStrict() {
    return await dbAdmin
      .from("settings")
      .select("*")
      .single();
  },
};
