import "server-only";

import { reservationRepository } from "@/lib/db/reservation.repository";
import {
  calculateGrandTotal,
  calculatePrepayment,
  accommodationBase,
} from "@/lib/price.engine";
import { normalizePriceRanges } from "@/lib/villa-row.types";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getExchangeRatesMap } from "@/app/services/exchange-rate.service";
import { getPublicSettings } from "@/app/services/settings.service";
import type { ReservationCreateInput } from "../types";

/* ===============================================================
   🛡️ PUBLIC RESERVATION — SERVER-SIDE PRICE VERIFY (COMPARE/LOG)
   ===============================================================
   AMAÇ:
     Public booking create'te client'ın gönderdiği finansal alanlara
     (total_price_try / cleaning_fee_try / prepayment_amount /
     remaining_payment) kör güvenmeyi bırakmak. Bu helper, MEVCUT
     price engine'i (lib/price.engine) SUNUCUDA yeniden çalıştırıp
     client değerleriyle karşılaştırır.

   ⚠️ BU FAZ = COMPARE/LOG ONLY (enforcement YOK):
     - Hiçbir şeyi reject etmez, throw etmez, stored value değiştirmez.
     - Drift bulursa structured console.warn loglar; booking AYNEN sürer.
     - Production hesaplaması BİREBİR korunur (yeni engine YAZILMADI;
       calculateGrandTotal + calculatePrepayment reuse edildi).

   GİRDİ EŞLEME (client snapshot ile birebir — ReservationForm):
     snapshot = calculateGrandTotal({ start, end, prices, currency:"TRY",
       rates, cleaning_fee, cleaning_currency, cleaning_limit })
     prepaymentRate = villa.custom_prepayment_rate ?? settings.prepayment_rate ?? 20
     prepayment = calculatePrepayment(total, prepaymentRate)   // Math.round
     remaining  = max(total - prepayment, 0)

   SERVER GİRDİ KAYNAKLARI (hepsi public-read, server-side anon OK):
     - villa_prices  → getVillaPrices(villa_id)
     - exchange rates → getExchangeRatesMap()
     - villa cleaning_* + custom_prepayment_rate → villa row (public)
     - settings.prepayment_rate → getPublicSettings() (RPC)

   FAIL-OPEN: herhangi bir fetch/parse hatası → null döner; route
   loglar ve booking'i ASLA bloklamaz.

   server-only: client bundle'a sızmaz.
   =============================================================== */

/* Rounding/drift toleransları — false-positive (rounding + meşru
   exchange-rate/price drift) gürültüsünü azaltır. Compare/log fazında
   yalnız bu eşiği AŞAN farklar "drift" sayılır. */
const TOLERANCE_TRY = 1; // ±1 TRY mutlak (float/round)
const TOLERANCE_PCT = 0.01; // ±%1 oransal (exchange/price drift)

export type ServerPriceResult = {
  totalPriceTry: number;
  cleaningFeeTry: number;
  prepaymentAmount: number;
  remainingPayment: number;
  prepaymentRate: number;
};

export async function recomputePublicReservationPrice(input: {
  villa_id: string;
  start_date: string;
  end_date: string;
}): Promise<ServerPriceResult | null> {
  const { villa_id, start_date, end_date } = input;
  if (!villa_id || !start_date || !end_date) return null;

  const [prices, ratesMap, settings, villaRes] = await Promise.all([
    getVillaPrices(villa_id),
    getExchangeRatesMap(),
    getPublicSettings(),
    reservationRepository.findVillaCleaningConfig(villa_id),
  ]);

  const villaRow =
    (villaRes.data as Record<string, unknown> | null) || null;

  /* Engine `rates: Record<string, number>` bekler; getExchangeRatesMap
     `Partial<Record<"USD"|"EUR"|"GBP", number>>` döner — yapı uyumlu. */
  const rates = (ratesMap?.rates || {}) as Record<string, number>;

  const snapshot = calculateGrandTotal({
    start: start_date,
    end: end_date,
    prices: normalizePriceRanges(prices),
    currency: "TRY",
    rates,
    cleaning_fee: Number(villaRow?.cleaning_fee) || 0,
    cleaning_currency:
      (villaRow?.cleaning_currency as string) || "TRY",
    cleaning_limit: Number(villaRow?.cleaning_limit) || 0,
  });

  /* prepayment rate precedence — ReservationForm ile BİREBİR:
     custom_prepayment_rate (null/undefined/"" değilse) → onu kullan,
     yoksa settings.prepayment_rate (truthy ise), yoksa 20. */
  const override = villaRow?.custom_prepayment_rate;
  let prepaymentRate = 20;
  if (override !== null && override !== undefined && override !== "") {
    prepaymentRate = Number(override);
  } else if (settings?.prepayment_rate) {
    prepaymentRate = Number(settings.prepayment_rate);
  }

  const totalPriceTry = snapshot.total || 0;
  const cleaningFeeTry = snapshot.cleaning || 0;
  const prepaymentAmount = calculatePrepayment(
    accommodationBase(totalPriceTry, cleaningFeeTry),
    prepaymentRate
  );
  const remainingPayment = Math.max(
    totalPriceTry - prepaymentAmount,
    0
  );

  return {
    totalPriceTry,
    cleaningFeeTry,
    prepaymentAmount,
    remainingPayment,
    prepaymentRate,
  };
}

function withinTolerance(client: number, server: number): boolean {
  const diff = Math.abs(client - server);
  if (diff <= TOLERANCE_TRY) return true;
  if (server > 0 && diff / server <= TOLERANCE_PCT) return true;
  return false;
}

export type PriceComparison = {
  match: boolean;
  deltas: Record<
    string,
    { client: number; server: number; diff: number }
  >;
};

export function comparePublicReservationPrice(
  payload: ReservationCreateInput,
  server: ServerPriceResult
): PriceComparison {
  const fields: Array<[string, number, number]> = [
    [
      "total_price_try",
      Number(payload.total_price_try) || 0,
      server.totalPriceTry,
    ],
    [
      "cleaning_fee_try",
      Number(payload.cleaning_fee_try) || 0,
      server.cleaningFeeTry,
    ],
    [
      "prepayment_amount",
      Number(payload.prepayment_amount) || 0,
      server.prepaymentAmount,
    ],
    [
      "remaining_payment",
      Number(payload.remaining_payment) || 0,
      server.remainingPayment,
    ],
  ];

  const deltas: PriceComparison["deltas"] = {};
  let match = true;
  for (const [name, client, srv] of fields) {
    if (!withinTolerance(client, srv)) {
      match = false;
      deltas[name] = { client, server: srv, diff: client - srv };
    }
  }
  return { match, deltas };
}

/* ---------------------------------------------------------------
   🔥 verifyPublicReservationPrice — orchestrator (COMPARE/LOG)
   ---------------------------------------------------------------
   Route'tan çağrılır. Recompute + compare + structured log yapar.
   ASLA throw etmez; booking'i bloklamaz (fail-open). Enforcement
   fazına geçildiğinde return değeri (match/deltas) karar için
   kullanılabilir; şimdilik yalnız gözlemlenir.
=============================================================== */
export async function verifyPublicReservationPrice(
  payload: ReservationCreateInput
): Promise<PriceComparison | null> {
  try {
    const server = await recomputePublicReservationPrice({
      villa_id: payload.villa_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
    });
    if (!server) return null;

    const cmp = comparePublicReservationPrice(payload, server);

    if (!cmp.match) {
      console.warn(
        "[price-verify] CLIENT/SERVER DRIFT (LOG-MODE — enforce edilmiyor)",
        {
          villa_id: payload.villa_id,
          start_date: payload.start_date,
          end_date: payload.end_date,
          prepaymentRate: server.prepaymentRate,
          deltas: cmp.deltas,
        }
      );
    } else {
      console.log("[price-verify] OK (client == server, tolerans içinde)", {
        villa_id: payload.villa_id,
      });
    }
    return cmp;
  } catch (err) {
    /* FAIL-OPEN: recompute patlasa bile booking sürer. */
    console.error(
      "[price-verify] recompute FAILED (fail-open, booking sürüyor):",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
