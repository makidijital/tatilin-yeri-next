import "server-only";

import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ MANUAL RESERVATION — SERVER-ONLY READ REPOSITORY (service-role)
   ===============================================================
   manual_reservations PHASE 3 (migration 040) sonrası admin-only
   RLS: `FOR ALL TO authenticated USING (public.is_active_admin())`.
   Anon SELECT REDDEDILIR. Bu durumda, Next.js Server Component
   (RSC) içinden anon `db` (lib/db/index.ts → @/lib/supabase) ile
   yapılan SELECT'ler **session cookie/JWT taşımaz** → RLS DENY →
   liste sessizce boş döner (`{ data: [], error: ... }`).

   Bu repository RSC + admin-only RLS kombosunda RLS'i bypass
   etmek için service-role path'i sağlar. Kullanım yalnız admin
   route handler'lardadır; `authorizeAdminCaller` arkasında çağrılır.

   GÜVENLİK SINIRI (reservation.repository.server.ts /
   mail-log.repository.server / payment-account.server konvansiyonu):
     • `import "server-only"` — client bundle'a sızarsa build HATA.
     • getSupabaseAdmin() SUPABASE_SERVICE_ROLE_KEY okur (NEXT_PUBLIC_
       prefix YOK) → yalnız server runtime.

   DAVRANIŞ — BYTE-IDENTICAL anon repo `findList()`:
     - SELECT shape (`SELECT_MANUAL_LIST_WITH_VILLA`) aynen.
     - `.order("created_at", { ascending: false })` aynen.
     - Return shape Supabase native `{ data, error }`. Repository
       sessiz; throw / console / log YOK. Caller (route handler)
       error → 500, başarı → `{ ok: true, manual_reservations }`.

   ⚠️ KAPSAM:
     Bu dosya sadece **READ list** içerir. Diğer manual flow'lar
     (form / detail / create / update / delete) admin browser
     session JWT taşır (CLIENT-side anon supabase), `is_active_admin()`
     true → RLS allow → çalışmaya devam eder; bu yüzden onlar
     `lib/db/manual-reservation.repository.ts` (anon) altında kalır.
     RSC veya server-side helper'dan çağrılan tek path liste idi;
     yalnız o path service-role'a alındı.

   CALLER:
     • app/api/admin/manual-reservations/route.ts → GET handler.
   =============================================================== */

/* ---------------------------------------------------------------
   🛡️ SELECT shape SINGLE SOURCE-OF-TRUTH
   ---------------------------------------------------------------
   Anon repository'deki `SELECT_MANUAL_LIST_WITH_VILLA` ile
   BYTE-IDENTICAL. Drift olmasın diye iki dosyada da literal kopya
   tutulur (cross-domain import yok — repository sahipliği boundary).
=============================================================== */
const SELECT_MANUAL_LIST_WITH_VILLA = `id, start_date, end_date, note, created_at, villa:villa_id ( title )`;

/* Anon repo'daki `SELECT_MANUAL_DETAIL` literal'ı ile BYTE-IDENTICAL.
   Edit form hidrate yolu — alan set + sıra korunur (drift olmasın
   diye iki dosyada da literal kopya tutulur). */
const SELECT_MANUAL_DETAIL = `id, villa_id, start_date, end_date, note, source, status, created_at`;

export const manualReservationServerRepository = {
  /* ===============================================================
     READ — LIST (`/api/admin/manual-reservations` GET delege)
     ===============================================================
     Orijinal pattern (lib/db/manual-reservation.repository.ts > findList):
       db
         .from("manual_reservations")
         .select(SELECT_MANUAL_LIST_WITH_VILLA)
         .order("created_at", { ascending: false });

     ⚠️ Tek fark: `db` → `dbAdmin` (RLS bypass). Query AYNEN.
  =============================================================== */
  async findList() {
    return await dbAdmin
      .from("manual_reservations")
      .select(SELECT_MANUAL_LIST_WITH_VILLA)
      .order("created_at", { ascending: false });
  },

  /* ===============================================================
     READ — DETAIL (`/api/admin/manual-reservations/[id]` GET delege)
     ===============================================================
     Orijinal pattern (lib/db/manual-reservation.repository.ts > findById):
       db
         .from("manual_reservations")
         .select(SELECT_MANUAL_DETAIL)
         .eq("id", id)
         .maybeSingle();

     ⚠️ Tek fark: `db` → `dbAdmin` (RLS bypass). Query AYNEN.

     Edit page (RSC) önce `getManualReservationById` → anon `db` ile
     çalışıyordu; mig 040 admin-only RLS DENY → `data: null` →
     `notFound()` → **Next page 404**. Bu metod, route arkasında
     service-role ile aynı row'u çeker.
  =============================================================== */
  async findById(id: string) {
    return await dbAdmin
      .from("manual_reservations")
      .select(SELECT_MANUAL_DETAIL)
      .eq("id", id)
      .maybeSingle();
  },
};
