import "server-only";

import { reservationRepository } from "@/lib/db/reservation.repository";
import {
  calculateGrandTotal,
  calculateNights,
  calculatePrepayment,
  accommodationBase,
} from "@/lib/price.engine";
import { normalizePriceRanges } from "@/lib/villa-row.types";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getExchangeRatesMap } from "@/app/services/exchange-rate.service";
import { getPublicSettings } from "@/app/services/settings.service";
import type { ReservationCreateInput } from "../types";
/* 🛡️ HAVUZ ISITMA — 6. adım. Server-authoritative pool heating snapshot
   — SAF helper (server-only İŞARETİ YOK, bkz. dosyanın kendi doc-comment'i).
   Client'ın gönderdiği pool heating total'a GÜVENMEZ; villanın gerçek
   pool_heating_fee/currency + burada hesaplanan nights ile YENİDEN üretir. */
import { computeAuthoritativePoolHeatingSnapshot } from "./pool-heating-verify";

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
  // 🛡️ HAVUZ ISITMA — 6. adım. Server-authoritative snapshot (villanın
  // gerçek pool_heating_fee/currency + server nights ile hesaplanmış;
  // client'ın gönderdiği değerlere bağımlı DEĞİL).
  poolHeatingSelected: boolean;
  originalPoolHeatingTotal: number;
  originalPoolHeatingCurrency: string;
  poolHeatingTotalTry: number;
};

export async function recomputePublicReservationPrice(input: {
  villa_id: string;
  start_date: string;
  end_date: string;
  // 🛡️ HAVUZ ISITMA — 6. adım. Client'ın "seçtim/seçmedim" tercihi —
  // BU alan güvenilir (bir tercih, bir tutar değil); tutar HER ZAMAN
  // sunucuda villanın gerçek fee'sinden yeniden üretilir.
  pool_heating_selected?: boolean;
}): Promise<ServerPriceResult | null> {
  const { villa_id, start_date, end_date, pool_heating_selected } = input;
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

  /* 🛡️ HAVUZ ISITMA — 6. adım. `calculateGrandTotal` çağrısı YUKARIDA
     BİLEREK pool heating parametreleri OLMADAN bırakıldı (risk minimizasyonu
     — mevcut snapshot semantiği/davranışı hiç dokunulmadan korunuyor).
     Pool heating totali AYRI, saf helper (`computeAuthoritativePoolHeatingSnapshot`)
     ile hesaplanır ve additive olarak totale eklenir — server KURALI
     (selected=false → 0; fee NULL/<=0 → 0; aksi halde nights×fee) birebir
     bu helper içinde uygulanıyor (bkz. pool-heating-verify.ts). */
  const nights = calculateNights(start_date, end_date);

  const poolHeatingSnapshot = computeAuthoritativePoolHeatingSnapshot({
    nights,
    poolHeatingSelected: !!pool_heating_selected,
    villaPoolHeatingFee: villaRow?.pool_heating_fee as
      | number
      | null
      | undefined,
    villaPoolHeatingCurrency: villaRow?.pool_heating_currency as
      | string
      | null
      | undefined,
    rates,
  });

  const cleaningFeeTry = snapshot.cleaning || 0;
  const totalPriceTry =
    (snapshot.total || 0) + poolHeatingSnapshot.pool_heating_total_try;
  const prepaymentAmount = calculatePrepayment(
    accommodationBase(
      totalPriceTry,
      cleaningFeeTry,
      poolHeatingSnapshot.pool_heating_total_try
    ),
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
    poolHeatingSelected: poolHeatingSnapshot.pool_heating_selected,
    originalPoolHeatingTotal: poolHeatingSnapshot.original_pool_heating_total,
    originalPoolHeatingCurrency:
      poolHeatingSnapshot.original_pool_heating_currency,
    poolHeatingTotalTry: poolHeatingSnapshot.pool_heating_total_try,
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
    // 🛡️ HAVUZ ISITMA — 6. adım. Log-only karşılaştırma (enforcement YOK —
    // mevcut fail-open felsefe aynen).
    [
      "pool_heating_total_try",
      Number(payload.pool_heating_total_try) || 0,
      server.poolHeatingTotalTry,
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

/* 🛡️ HAVUZ ISITMA — 6. adım. Route'un (`api/public/reservations/route.ts`)
   `body`'deki 4 pool heating snapshot alanını server-authoritative
   değerlerle override edebilmesi için — `verifyPublicReservationPrice`'ın
   tek caller'ı bu route; return değeri ÖNCEDEN tamamen ignore ediliyordu
   (grep ile doğrulandı), bu yüzden shape genişletmek güvenli. */
export type PublicReservationPoolHeatingSnapshot = {
  pool_heating_selected: boolean;
  original_pool_heating_total: number;
  original_pool_heating_currency: string;
  pool_heating_total_try: number;
};

export type PublicReservationServerVerification = {
  comparison: PriceComparison | null;
  /* null → recompute başarısız (fail-open); route bu durumda client'ın
     ORİJİNAL gönderdiği pool heating alanlarını DEĞİŞTİRMEDEN bırakır. */
  poolHeating: PublicReservationPoolHeatingSnapshot | null;
};

/* ---------------------------------------------------------------
   🔥 verifyPublicReservationPrice — orchestrator (COMPARE/LOG +
   HAVUZ ISITMA server-authoritative snapshot)
   ---------------------------------------------------------------
   Route'tan çağrılır. Recompute + compare + structured log yapar.
   Fiyat karşılaştırması (total/cleaning/prepayment/remaining) HÂLÂ
   yalnız COMPARE/LOG (enforcement YOK, fail-open, mevcut felsefe aynen).
   Pool heating snapshot'ı AYRI: route bunu (varsa) `body` üzerine
   YAZAR — çünkü kullanıcı KURALI (server bu 4 alanı ASLA client'tan
   güvenmemeli) yalnız bu 4 kolon için EXPLICIT enforcement istiyor;
   diğer finansal alanlar (total_price_try vb.) bu adımın kapsamı
   dışında client-trusted kalmaya devam ediyor (bkz. final rapor,
   Risk/uyarı bölümü).
=============================================================== */
export async function verifyPublicReservationPrice(
  payload: ReservationCreateInput
): Promise<PublicReservationServerVerification> {
  try {
    const server = await recomputePublicReservationPrice({
      villa_id: payload.villa_id,
      start_date: payload.start_date,
      end_date: payload.end_date,
      pool_heating_selected: payload.pool_heating_selected,
    });
    if (!server) return { comparison: null, poolHeating: null };

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
    return {
      comparison: cmp,
      poolHeating: {
        pool_heating_selected: server.poolHeatingSelected,
        original_pool_heating_total: server.originalPoolHeatingTotal,
        original_pool_heating_currency: server.originalPoolHeatingCurrency,
        pool_heating_total_try: server.poolHeatingTotalTry,
      },
    };
  } catch (err) {
    /* FAIL-OPEN: recompute patlasa bile booking sürer; pool heating
       snapshot'ı da override EDİLMEZ (route client değerini korur). */
    console.error(
      "[price-verify] recompute FAILED (fail-open, booking sürüyor):",
      err instanceof Error ? err.message : err
    );
    return { comparison: null, poolHeating: null };
  }
}
