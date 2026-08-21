import "server-only";

import { reservationShareRepository } from "@/lib/db/reservation-share.repository.server";
import { hashShareToken } from "@/lib/reservation-share.helper";

/* ===============================================================
   🛡️ RESERVATION SHARE — TOKEN RESOLVE (server-only)
   ===============================================================
   `/rezervasyon-kontrol?token=...` server component'i çağırır. Akış:
     raw token → sha256 hash → resolve RPC (revoked/expired filtre) →
     reservation_id → güvenli reservation read → SANITIZED DTO.
   Client'a ASLA ham row / PII / token gitmez.

   ÖDEME (KAFADAN HESAP YOK): tutarlar rezervasyonun kayıtlı TRY
   snapshot'ından okunur (total_price_try / paid_amount / remaining_
   payment / prepayment_amount — hepsi TRY; buildPublicReservationPayload
   + payment.helper ile teyitli). Price engine ÇALIŞTIRILMAZ → rezervasyon
   sonrası villa fiyatı değişse bile tutar sabit.

   Durumlar:
     - invalid : token yok / geçersiz / expired / revoked / bulunamadı
                 (generic; enumeration sızıntısı yok)
     - cancelled : rezervasyon iptal/reddedilmiş
     - ok : sanitized DTO
   =============================================================== */

export type ReservationShareStatusKey =
  | "pending"
  | "prepayment"
  | "confirmed";

export type ReservationShareDTO = {
  reservationNo: string;
  villaTitle: string;
  startDate: string | null;
  endDate: string | null;
  nights: number | null;
  guests: number | null;
  statusKey: ReservationShareStatusKey;
  /** Ödeme özeti — TRY (rezervasyon accounting currency). */
  total: number | null;
  paid: number | null;
  remaining: number | null;
  prepaymentPct: number | null;
  remainingPct: number | null;
};

export type ReservationShareResult =
  | { kind: "invalid" }
  | { kind: "cancelled" }
  | { kind: "ok"; data: ReservationShareDTO };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** UTC-safe gece sayısı (yalnız tarih farkı; price engine DEĞİL). */
function nightsBetween(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  if (!start || !end) return null;
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(start);
  const b = /^(\d{4})-(\d{2})-(\d{2})/.exec(end);
  if (!a || !b) return null;
  const da = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const db = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  const diff = Math.round((db - da) / 86400000);
  return diff > 0 ? diff : null;
}

export async function resolveReservationShare(
  rawToken: string | null | undefined
): Promise<ReservationShareResult> {
  const token = (rawToken || "").toString().trim();
  if (!token) return { kind: "invalid" };

  /* 1) Hash → RPC (revoked/expired → null). */
  let reservationId: string | null = null;
  try {
    const tokenHash = hashShareToken(token);
    const { data, error } =
      await reservationShareRepository.resolveByTokenHash(tokenHash);
    if (error) {
      console.error("[reservation-share] resolve RPC error:", error.message);
      return { kind: "invalid" };
    }
    reservationId =
      typeof data === "string" && data ? data : null;
  } catch (e) {
    console.error("[reservation-share] resolve exception:", e);
    return { kind: "invalid" };
  }
  if (!reservationId) return { kind: "invalid" };

  /* 2) Güvenli reservation read. */
  const { data: rows, error: readErr } =
    await reservationShareRepository.findReservationForShare(reservationId);
  if (readErr) {
    console.error("[reservation-share] read error:", readErr.message);
    return { kind: "invalid" };
  }
  const row =
    Array.isArray(rows) && rows.length > 0
      ? (rows[0] as {
          reservation_no: string | null;
          status: string | null;
          payment_link_status: string | null;
          start_date: string | null;
          end_date: string | null;
          guests: number | null;
          total_price: number | null;
          total_price_try: number | null;
          paid_amount: number | null;
          prepayment_amount: number | null;
          remaining_payment: number | null;
          original_currency: string | null;
          villa: { title: string | null } | null;
        })
      : null;
  if (!row) return { kind: "invalid" };

  /* 3) İptal/red → özel ekran. */
  const status = (row.status ?? "").toString().trim().toLowerCase();
  if (status === "cancelled" || status === "rejected") {
    return { kind: "cancelled" };
  }

  /* statusKey — lookup API `deriveStatusKey` ile aynı mantık. */
  const pls = (row.payment_link_status ?? "").toString().trim().toLowerCase();
  const statusKey: ReservationShareStatusKey =
    status === "confirmed"
      ? "confirmed"
      : pls === "sent"
        ? "prepayment"
        : "pending";

  /* Ödeme — TRY snapshot (kafadan hesap yok). */
  const total = num(row.total_price_try) || num(row.total_price) || 0;
  const paid = num(row.paid_amount);
  const prepay = num(row.prepayment_amount);
  const remaining = num(row.remaining_payment);

  const prepaymentPct =
    total > 0 && prepay > 0 ? Math.round((prepay / total) * 100) : null;
  const remainingPct =
    prepaymentPct !== null ? Math.max(0, 100 - prepaymentPct) : null;

  return {
    kind: "ok",
    data: {
      reservationNo: (row.reservation_no || "").toString(),
      villaTitle: (row.villa?.title || "Villa").toString(),
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      nights: nightsBetween(row.start_date, row.end_date),
      guests: Number(row.guests) || null,
      statusKey,
      total: total > 0 ? total : null,
      paid: paid > 0 ? paid : 0,
      remaining: remaining > 0 ? remaining : null,
      prepaymentPct,
      remainingPct,
    },
  };
}
