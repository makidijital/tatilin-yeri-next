import { db } from "@/lib/db";

/* ===============================================================
   🛡️ FAZ 40 — SETTINGS REPOSITORY
   ===============================================================
   `settings` tablosu — global site ayarları singleton row.
   Service `getSettings`/`updateSettings` business orchestration
   tutar; repository sadece raw DB I/O.

   ⚠️ KESIN KURAL:
     - .maybeSingle() resolver (boş tablo → data: null).
     - .select("*") projection.
     - Service "row yoksa false" kontrolü + console tag service'te.
=============================================================== */

export const settingsRepository = {
  /** Singleton settings row (FULL — `*`); server/admin tarafı için.
   *  ⚠️ resend_api_key DAHİL; YALNIZ server (mail getMailConfig) ve
   *  authenticated admin (settings edit) bağlamında çağrılmalı.
   *  042 admin-only RLS sonrası: authenticated-admin + service_role
   *  okur; anon REDDEDİLİR (kasıtlı). */
  async findSingleton() {
    return await db.from("settings").select("*").maybeSingle();
  },

  /** Singleton settings row (PUBLIC-SAFE) — SECURITY DEFINER RPC
   *  `get_public_settings` (migration 041). resend_api_key/mail_from*
   *  ÇIKTIDA YOK; 042 admin-only RLS sonrası anon için de çalışır
   *  (definer tablo sahibi yetkisiyle okur). Public/client tüm
   *  okumaları (getPublicSettings → getCachedSettings dahil) bunu
   *  kullanır → secret browser'a/anon'a sızmaz. Dönen jsonb obje
   *  (row yoksa null) Supabase native `{ data, error }` içinde. */
  async findPublicViaRpc() {
    return await db.rpc("get_public_settings");
  },

  /** Row ID üzerinden update; .eq("id", id) predicate aynen. */
  async updateById(id: string, values: Record<string, unknown>) {
    return await db
      .from("settings")
      .update(values)
      .eq("id", id);
  },
};
