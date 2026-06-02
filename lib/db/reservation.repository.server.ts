import "server-only";

import { dbAdmin } from "@/lib/db/server";

import {
  SELECT_RESERVATION_DETAIL,
} from "@/app/services/reservation/_helpers/select-shapes";

/* ===============================================================
   🛡️ RESERVATION — SERVER-ONLY WRITE REPOSITORY (service-role)
   ===============================================================
   reservations PHASE 3 (migration 040) sonrası admin-only RLS:
   anon INSERT REDDEDILIR. Public booking CREATE bir auth'suz
   ziyaretçi tarafından tetiklendiği için INSERT'in SERVICE ROLE
   ile yapılması zorunlu (RLS bypass). Ayrıca service_role,
   `.insert().select().single()` RETURNING representation'ını
   görebildiği için RLS altında da inserted row caller'a döner
   (anon olsaydı RETURNING RLS'e takılır, .single() boş/err olurdu).

   GÜVENLİK SINIRI (mail-log.repository.server / payment-account.server
   ile aynı konvansiyon):
     • `import "server-only"` — client bundle'a sızarsa build HATA.
     • getSupabaseAdmin() SUPABASE_SERVICE_ROLE_KEY okur (NEXT_PUBLIC_
       prefix YOK) → yalnız server runtime.

   DAVRANIŞ:
     - INSERT chain `.insert(payload).select().single()` —
       reservation.repository.ts (anon) INSERT'i ile BYTE-IDENTICAL.
     - Supabase native `{ data, error }` döner; error.code (SQLSTATE
       23P01 = exclusion_violation) korunur → caller `mapInsertError`
       ile "Bu tarihler dolu"a map eder. Double-booking EXCLUDE
       constraint garantisi aynen.

   CALLER:
     • app/api/public/reservations/route.ts → createReservation(data,
       { insertRepository: reservationServerRepository })
   =============================================================== */

export const reservationServerRepository = {
  async insert(payload: Record<string, unknown>) {
    return await dbAdmin
      .from("reservations")
      .insert(payload)
      .select()
      .single();
  },

  /* ===============================================================
     READ — DETAIL (service-role) — admin detail route için
     ===============================================================
     Anon repo `findById` ile BYTE-IDENTICAL chain:
       .from("reservations").select(SELECT_RESERVATION_DETAIL)
       .eq("id", id).single()
     Tek fark: `db` → `dbAdmin` (RLS bypass).

     `.single()` resolver KORUNDU — orchestrator (read.service) bu
     resolver davranışına bağlıdır: missing row → error.code "PGRST116" →
     "Rezervasyon getirilemedi" throw. Mig 040 admin-only RLS altında
     anon SELECT 0 row → PGRST116 silent fail; service-role bypass ile
     gerçek row dönüyor.
  =============================================================== */
  async findById(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(SELECT_RESERVATION_DETAIL)
      .eq("id", id)
      .single();
  },

  /* ===============================================================
     UPDATE BY ID (service-role) — payment mail + admin update/status/note
     ===============================================================
     payment-link / payment-confirmed / bank-transfer route'ları
     reservation'ı server-side günceller (payment_link, paid_amount,
     payment_link_status vb.). 040 admin-only RLS sonrası anon UPDATE
     reddedilir → service_role ile.

     Admin update/status/note route'ları aynı server-side bağlamda
     çalışır (anon `db` JWT taşımaz → mig 040 DENY → UPDATE 0 row
     etkiler, Supabase silent başarı döner; data değişmez). Bu metod
     dependency injection ile services'e geçer → byte-identical
     UPDATE artık service-role ile yapılır.
  =============================================================== */
  async updateById(id: string, partial: Record<string, unknown>) {
    return await dbAdmin
      .from("reservations")
      .update(partial)
      .eq("id", id);
  },

  /* ===============================================================
     DELETE BY ID (service-role) — admin delete route için
     ===============================================================
     Anon repo `deleteById` ile BYTE-IDENTICAL chain:
       .from("reservations").delete().eq("id", id)
     Tek fark: `db` → `dbAdmin` (RLS bypass).

     Hard delete; 040 admin-only RLS altında anon DELETE 0 row etkiler
     (silent fail) → service-role bypass.
  =============================================================== */
  async deleteById(id: string) {
    return await dbAdmin
      .from("reservations")
      .delete()
      .eq("id", id);
  },

  /* ===============================================================
     READ — PAID AMOUNT (service-role) — assertCanConfirm fallback
     ===============================================================
     Anon repo `findPaidAmount` ile BYTE-IDENTICAL chain:
       .from("reservations").select("paid_amount").eq("id", id).maybeSingle()
     Tek fark: `db` → `dbAdmin` (RLS bypass).

     `assertCanConfirm` (status guard) tarafından kullanılır. Mig 040
     altında anon maybeSingle null → existing?.paid_amount === undefined
     → canConfirmReservation(undefined) === false → guard yanlışlıkla
     throw eder. Service-role ile gerçek paid_amount okunur.
  =============================================================== */
  async findPaidAmount(id: string) {
    return await dbAdmin
      .from("reservations")
      .select("paid_amount")
      .eq("id", id)
      .maybeSingle();
  },

  /* ===============================================================
     MAIL SNAPSHOT READS (service-role) — .maybeSingle resolver
     ===============================================================
     SELECT shape'leri anon repository'deki orijinallerle BYTE-IDENTICAL
     (route-spesifik exact projection). 040 admin-only RLS sonrası bu
     server-side okumalar service_role ile çalışır; PII server'da kalır.
  =============================================================== */
  async findByIdForPaymentLinkMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         name, email,
         start_date, end_date,
         total_price, total_price_try,
         prepayment_amount, paid_amount,
         payment_preference,
         payment_link,
         damage_deposit,
         villa:villa_id ( title )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  async findByIdForPaymentConfirmedMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, name, email,
         start_date, end_date,
         total_price, total_price_try,
         prepayment_amount, paid_amount,
         payment_preference,
         payment_link_status,
         damage_deposit,
         villa:villa_id ( title )`
      )
      .eq("id", id)
      .maybeSingle();
  },

  async findByIdForBankTransferMail(id: string) {
    return await dbAdmin
      .from("reservations")
      .select(
        `id, reservation_no,
         name, email,
         start_date, end_date,
         total_price, total_price_try,
         prepayment_amount, paid_amount,
         payment_preference,
         damage_deposit,
         villa:villa_id ( title )`
      )
      .eq("id", id)
      .maybeSingle();
  },
};
