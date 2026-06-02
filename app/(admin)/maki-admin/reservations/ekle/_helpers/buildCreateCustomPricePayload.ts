import {
  getPaymentDisplayValues,
  normalizePaymentPreference,
} from "@/lib/payment.helper";

import type {
  ReservationCreateData,
  SelectedVillaCreate,
} from "../_types/reservation-create-data";

/* ===============================================================
   🛡️ FAZ 3 — buildCreateCustomPricePayload (PURE)
   ===============================================================
   Eski page.tsx `handleCreate` içindeki **custom_price branch**
   INSERT payload inşası — birebir kopya. Pure, deterministic,
   zero-side-effect.

   ⚠️ KESIN KURAL: payload shape ve coercion BYTE-IDENTICAL.
   Alan sırası ve isimleri eski inline pattern'le aynı; DB write
   diff'i yok.

   PAIRED HELPERS:
     - normalizePaymentPreference (lib/payment.helper) — single
       source-of-truth payment_preference normalize.
     - getPaymentDisplayValues   (lib/payment.helper) — single
       source-of-truth prepayment/remaining derivation.

   FARK ([id] helper'ı ile):
     - INSERT semantic'i (UPDATE değil) — status literal "pending".
     - `paid_amount` yazılmaz (DB default 0; tahsilat detail page'de).
     - `damage_deposit` informational snapshot (villa.deposit'tan).
     - reservation_no DB tarafında generate edilir; payload'da yok.
   =============================================================== */

export type ReservationCreatePayloadShape = {
  name: string;
  phone: string;
  email: string;
  identity_number: string;
  city: string;
  country: string;
  address: string;
  villa_id: string;
  guests: number;
  guest_names: string[];
  note: string;
  status: "pending";
  start_date: string;
  end_date: string;

  /* PARA — TRY snapshot */
  total_price: number;
  total_price_try: number;

  /* MULTI CURRENCY */
  original_price: number;
  original_currency: string;
  original_cleaning_fee: number;
  original_cleaning_currency: string;
  cleaning_fee_try: number;
  exchange_rate: number;

  /* FINANCIAL SNAPSHOT */
  prepayment_amount: number;
  remaining_payment: number;

  /* CUSTOM FLAGS */
  custom_price: boolean;
  custom_price_note: string | null;

  /* PAYMENT */
  payment_preference: "prepayment" | "full_payment";
  payment_method_id: string | null;

  /* DAMAGE DEPOSIT (informational) */
  damage_deposit: number;
};

export type BuildCreateCustomPricePayloadInput = {
  data: ReservationCreateData;
  guestNames: string[];
  startDate: Date;
  endDate: Date;
  prepaymentRate: number;
  selectedVilla: SelectedVillaCreate;
  /* startDate/endDate'i ISO string'e çevirme caller sorumluluğunda
     (formatLocalDate). Helper saf string alır → testability yüksek. */
  startISO: string;
  endISO: string;
};

export function buildCreateCustomPricePayload(
  input: BuildCreateCustomPricePayloadInput
): ReservationCreatePayloadShape {
  const { data, guestNames, prepaymentRate, selectedVilla, startISO, endISO } = input;

  const customTotal =
    Number(data.total_price_try) ||
    Number(data.total_price) ||
    0;

  /* 🔥 DB SNAPSHOT — payment_preference'a göre helper türetir
       full_payment  → prepayment_amount=total, remaining_payment=0
       prepayment    → prepayment_amount=raw,   remaining_payment=total−raw
     Tek source-of-truth: getPaymentDisplayValues. */
  const customRawPrepayment = Math.round((customTotal * prepaymentRate) / 100);
  const customWritePayment = getPaymentDisplayValues({
    total_price_try: customTotal,
    prepayment_amount: customRawPrepayment,
    payment_preference: data.payment_preference,
  });
  const customPrepayment = customWritePayment.payNow;
  const customRemaining = customWritePayment.remainingOnArrival;

  return {
    name: data.name,
    phone: data.phone,
    email: data.email,
    identity_number: data.identity_number,
    city: data.city,
    country: data.country,
    address: data.address,
    villa_id: data.villa_id,
    guests: data.guests,
    /* Diğer misafirlerin isimleri (boşlar filtrelenir). */
    guest_names: guestNames
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
    note: data.note,
    /* Yeni rezervasyon her zaman "pending" — confirmed geçişi
       sadece detail page "Ödemeyi Onayla" akışıyla yapılır. */
    status: "pending",
    start_date: startISO,
    end_date: endISO,

    /* 🔥 CUSTOM SNAPSHOT */
    total_price: customTotal,
    total_price_try: customTotal,

    /* multi-currency alanlar nötrlenir */
    original_price: 0,
    original_currency: "TRY",
    original_cleaning_fee: 0,
    original_cleaning_currency: "TRY",
    cleaning_fee_try: 0,
    exchange_rate: 1,

    /* 🔥 FINANCIAL SNAPSHOT (paid_amount create'te yazılmaz;
       DB default 0; tahsilat detail page'de yönetilir) */
    prepayment_amount: customPrepayment,
    remaining_payment: customRemaining,

    /* 🔥 CUSTOM FLAGS */
    custom_price: true,
    custom_price_note: data.custom_price_note || null,

    /* 🔥 PAYMENT PREFERENCE */
    payment_preference: normalizePaymentPreference(data.payment_preference),

    /* 🔥 PAYMENT METHOD */
    payment_method_id: data.payment_method_id || null,

    /* 🔥 DAMAGE DEPOSIT — villa.deposit snapshot
       (informational; accounting'e dahil değil) */
    damage_deposit: Number(selectedVilla?.deposit) || 0,
  };
}
