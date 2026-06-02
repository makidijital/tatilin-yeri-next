import type { ReservationCreateInput } from "../types";

/* ===============================================================
   🛡️ FAZ 2 — buildCreateReservationPayload (PURE)
   ===============================================================
   Eski `createReservation` içinde inline INSERT payload object'inin
   BYTE-IDENTICAL kopyası (line 263-361).

   ⚠️ KESIN KURAL:
     - Alan sırası alan-alan aynen.
     - Coercion: `Number(x) || 0`, `string || null`, `string || "TRY"`,
       `Number(...) || 1`, `!!flag`, `?? null` — aynen.
     - Conditional spread (`...(data.X !== undefined ? { X } : {})`)
       aynen.
     - Status hardcoded `"pending"` aynen (create flow her zaman
       pending; confirmed transition update flow'unda).
     - reservation_commission_amount input olarak gelir (helper
       commission rate fetch + calcCommissionAmount sonucunu
       orchestrator hesaplar).

   ⚠️ Caller orchestrator (`create.service.ts`):
     - Validation kendi yapar
     - Conflict check kendi yapar
     - Commission rate'i fetch eder, calcCommissionAmount sonucunu
       buraya `reservationCommissionAmount` olarak verir
     - Bu helper'dan dönen payload'u supabase.insert(...) ile
       gönderir
     - SQLSTATE 23P01 catch'i kendi yapar
=============================================================== */

export type BuildCreateReservationPayloadInput = {
  data: ReservationCreateInput;
  /** Orchestrator tarafında hesaplanan commission amount snapshot.
   *  Formula: total_price_try × (rate / 100); helper'da
   *  `calcCommissionAmount` ile üretilir. */
  reservationCommissionAmount: number;
};

/** INSERT payload — runtime'da `supabase.from("reservations").insert(...)`
 *  argümanına geçer. Excess property check'i Supabase JS aşırı
 *  geniştir; pratikte loose accept eder. Burada strict tutmuyoruz
 *  çünkü conditional spread'ler key'lerin opsiyonel varlığını
 *  şart koşar. */
export function buildCreateReservationPayload(
  input: BuildCreateReservationPayloadInput
): Record<string, unknown> {
  const { data, reservationCommissionAmount } = input;

  return {
    villa_id: data.villa_id,

    start_date: data.start_date,
    end_date: data.end_date,
    total_price: Number(data.total_price) || 0,

    original_price:
      Number(data.original_price) || 0,

    original_currency:
      data.original_currency || "TRY",

    exchange_rate:
      Number(data.exchange_rate) || 1,

    total_price_try:
      Number(data.total_price_try) || 0,

    original_cleaning_fee:
      Number(data.original_cleaning_fee) || 0,

    original_cleaning_currency:
      data.original_cleaning_currency || "TRY",

    cleaning_fee_try:
      Number(data.cleaning_fee_try) || 0,

    name: data.name,
    phone: data.phone,
    email: data.email || null,

    identity_number: data.identity_number || null,
    country: data.country || null,
    city: data.city || null,
    address: data.address || null,

    guests: Number(data.guests) || 1,

    guest_names: data.guest_names || [], // 🔥 BURASI

    note: data.note || null,

    status: "pending",

    payment_method_id: data.payment_method_id ?? null,

    // 🔥 FINANCIAL SNAPSHOT
    // Sadece tanımlı alanlar yazılır → eski rezervasyonlar bozulmaz
    ...(data.prepayment_amount !== undefined
      ? { prepayment_amount: Number(data.prepayment_amount) || 0 }
      : {}),

    ...(data.remaining_payment !== undefined
      ? { remaining_payment: Number(data.remaining_payment) || 0 }
      : {}),

    ...(data.paid_amount !== undefined
      ? { paid_amount: Number(data.paid_amount) || 0 }
      : { paid_amount: 0 }), // ilk kayıtta 0

    // 🔥 CUSTOM PRICE — sadece tanımlıysa yaz (eski rezervasyonlar bozulmaz)
    ...(data.custom_price !== undefined
      ? { custom_price: !!data.custom_price }
      : {}),

    ...(data.custom_price_note !== undefined
      ? { custom_price_note: data.custom_price_note || null }
      : {}),

    // 🔥 PAYMENT PREFERENCE — sadece tanımlıysa yaz
    // (eski rezervasyonlar bozulmaz; default DB tarafında "prepayment")
    ...(data.payment_preference !== undefined
      ? {
          payment_preference:
            data.payment_preference === "full_payment"
              ? "full_payment"
              : "prepayment",
        }
      : {}),

    // 🔥 DAMAGE DEPOSIT — villa.deposit snapshot
    // Sadece tanımlıysa yazılır; informational (accounting'e
    // dahil değil; ayrı kolon).
    ...(data.damage_deposit !== undefined
      ? { damage_deposit: Number(data.damage_deposit) || 0 }
      : {}),

    // 🛡️ COMMISSION AMOUNT — accounting snapshot
    // villa.commission_rate × total_price_try / 100
    // (her zaman total_price_try üzerinden — paid_amount/
    //  prepayment_amount/original_price ASLA değil).
    // Rate null/invalid/range dışı → 20 fallback (safeCommissionRate).
    // Bu field DB'de NOT NULL DEFAULT 0 olabilir veya nullable; her
    // iki durumda da snapshot değeri yazılır.
    reservation_commission_amount: reservationCommissionAmount,
  };
}
