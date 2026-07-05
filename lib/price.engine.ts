import { convertPrice } from "@/lib/currency";
import { parseLocalDate } from "@/lib/date-format";
import type { PriceRange } from "@/lib/villa-row.types";

/* ===============================================================
   🛡️ FAZ 9 TS HARDENING — `prices: any[]` → `PriceRange[]`
   ===============================================================
   Tüm engine fonksiyonları artık şu shape ile çağrılıyor:
     { start_date: string; end_date: string; price: number; currency: string }
   Caller'lar (services/villa-price, BookingSidebar, VillaCard,
   ReservationForm, /arama, /kiralik-villa) zaten bu shape'i sağlıyordu;
   yalnız tip katmanı `any` idi → autocomplete + sessiz drift riski.

   Runtime davranışı BYTE-IDENTICAL. Hiçbir alan default'u değişmedi.
   =============================================================== */

/* ===============================================================
   🔥 PRICING DATE SEMANTIC — TEK KURAL
   ===============================================================
   Bu modülde tüm "YYYY-MM-DD" string'leri parseLocalDate ile
   LOCAL midnight Date'e çevrilir. `new Date(YYYY-MM-DD)` UTC parse
   yaptığı için (örn. UTC+3'te 03:00 TR'ye düşer) drift kaynağıydı;
   normalizeDate sonrasında bile getFullYear/Month/Date ile birlikte
   farklı günü gösterebiliyordu. parseLocalDate doğrudan LOCAL
   alanlardan kurar; günler sadık kalır.
   Davranış: gece sayısı, fiyat aralığı eşleşmesi, döngü sınırı —
   hepsi BİREBİR aynı. Yalnız parse adımı tek source-of-truth'a
   bağlandı.
   =============================================================== */

// 🔥 TARİH NORMALIZE — LOCAL midnight (year/month/day)
export const normalizeDate = (
  date: Date
) => {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  );
};

/* ===============================================================
   🔥 STARTING PRICE — listing card fallback (date search YOK iken)
   ===============================================================
   Bir villa için "X / gece'den başlayan" gösterimi: villa_prices
   içindeki en düşük positive nightly price + currency.

   KULLANIM:
     - Yalnız listing kartları (arama / koleksiyon) için fallback
       price prop hesabı.
     - Date search varsa caller `calculateGrandTotal()` ile total
       hesaplar; bu helper devreye GİRMEZ. İki akış birbirinden
       bağımsız ve zero-impact.

   DAVRANIŞ:
     - Boş array / hepsi null/0/invalid → null. Caller'lar null'a
       göre eski fallback'i (UI'de "—" veya "Fiyat sorunuz") seçebilir.
     - Currency belirsiz veya eksik → "TRY" default.
     - Conversion YAPILMAZ — orijinal currency aynen döner; VillaCard
       seviyesinde convertPrice ile user currency'ye çevrilir.
=============================================================== */
export type StartingPriceInput = ReadonlyArray<{
  price?: number | null;
  currency?: string | null;
}>;

export function getStartingPrice(
  prices: StartingPriceInput
): { price: number; currency: string } | null {
  if (!Array.isArray(prices) || prices.length === 0) return null;
  let best: { price: number; currency: string } | null = null;
  for (const p of prices) {
    const v = Number(p?.price);
    if (!Number.isFinite(v) || v <= 0) continue;
    if (best === null || v < best.price) {
      best = { price: v, currency: p?.currency || "TRY" };
    }
  }
  return best;
}

// 🔥 GECE HESAPLA
export const calculateNights = (
  start: string,
  end: string
) => {
  if (!start || !end) {
    return 0;
  }

  // parseLocalDate → LOCAL midnight; UTC drift YOK
  const s = parseLocalDate(start);
  const e = parseLocalDate(end);

  return Math.ceil(
    (e.getTime() - s.getTime()) /
    (1000 * 60 * 60 * 24)
  );
};

// 🔥 GÜNLÜK FİYAT BUL
export const getDailyPrice = (
  date: Date,
  prices: PriceRange[],
  currency: string,
  rates: Record<string, number>
) => {
  const d = normalizeDate(date);

  const found = prices.find((p) => {
    // parseLocalDate → "YYYY-MM-DD" LOCAL midnight.
    // normalizeDate gereksizleşti çünkü parseLocalDate zaten saatsiz
    // local Date üretir; davranış birebir aynı.
    const s = parseLocalDate(p.start_date);
    const e = parseLocalDate(p.end_date);

    return d >= s && d <= e;
  });

  if (!found) {
    return {
      converted: 0,
      original: 0,
      original_currency: "TRY",
    };
  }

  const original = Number(found.price || 0);

  const original_currency =
    found.currency || "TRY";

  const converted = convertPrice(
    original,
    original_currency,
    currency,
    rates
  );

  return {
    converted,
    original,
    original_currency,
  };
};

// 🔥 KONAKLAMA TOPLAMI
export const calculateStayTotal = (
  start: string,
  end: string,
  prices: PriceRange[],
  currency: string,
  rates: Record<string, number>
) => {
  if (!start || !end) {
    return {
      stay: 0,
      original_stay: 0,
      original_currency: "TRY",
    };
  }

  let stay = 0;

  let original_stay = 0;

  let original_currency = "TRY";

  // parseLocalDate → "YYYY-MM-DD" LOCAL midnight; while-loop ve
  // setDate(+1) LOCAL zincirde ilerler. UTC parse (önceki davranış)
  // TR+3 saatinde "03:00 UTC" üretip getDate()/setDate() üzerinde
  // implicit drift yaratıyordu; bu drift kaldırıldı.
  let current = parseLocalDate(start);
  const endD = parseLocalDate(end);

  while (current < endD) {

    const daily = getDailyPrice(
      current,
      prices,
      currency,
      rates
    );

    stay += daily.converted;

    original_stay += daily.original;

    original_currency =
      daily.original_currency;

    current.setDate(
      current.getDate() + 1
    );
  }

  // fallback
  if (stay === 0 && prices?.length) {

    const original =
      Number(prices[0].price || 0);

    const originalCurrency =
      prices[0].currency || "TRY";

    return {
      stay: convertPrice(
        original,
        originalCurrency,
        currency,
        rates
      ),

      original_stay: original,

      original_currency:
        originalCurrency,
    };
  }

  return {
    stay,
    original_stay,
    original_currency,
  };
};

// 🔥 TEMİZLİK KURALI
export const calculateCleaningFee = (
  nights: number,
  cleaning_fee: number,
  cleaning_limit?: number
) => {
  if (!cleaning_fee) {
    return 0;
  }

  if (
    !cleaning_limit ||
    cleaning_limit === 0
  ) {
    return cleaning_fee;
  }

  return nights < cleaning_limit
    ? cleaning_fee
    : 0;
};

// 🔥 GENEL TOPLAM
export const calculateGrandTotal = ({
  start,
  end,
  prices,
  currency,
  rates,
  cleaning_fee = 0,
  cleaning_currency = "TRY",
  cleaning_limit = 0,
}: {
  start: string;

  end: string;

  prices: PriceRange[];

  currency: string;

  rates: Record<string, number>;

  cleaning_fee?: number;

  cleaning_currency?: string;

  cleaning_limit?: number;
}) => {

  const nights = calculateNights(
    start,
    end
  );

  const stayResult =
    calculateStayTotal(
      start,
      end,
      prices,
      currency,
      rates
    );

  const stay =
    stayResult.stay;

  const original_stay =
    stayResult.original_stay;

  const original_currency =
    stayResult.original_currency;

  const rawCleaning =
    calculateCleaningFee(
      nights,
      cleaning_fee,
      cleaning_limit
    );

  // kullanıcı currency’sine çevrilen
  const cleaning = convertPrice(
    rawCleaning,
    cleaning_currency || "TRY",
    currency,
    rates
  );

  // ORJİNAL cleaning
  const original_cleaning =
    rawCleaning;

  const original_cleaning_currency =
    cleaning_currency || "TRY";

  // toplam (kullanıcının gördüğü)
  const total =
    stay + cleaning;


  return {
    nights,

    stay,

    cleaning,

    total,

    original_stay,

    original_cleaning,

    original_currency,

    original_cleaning_currency,

    currency,
  };
};

/* 🔥 KONAKLAMA BEDELİ (prepayment base) — CANONICAL.
   Ön ödeme YALNIZ konaklama bedelinden hesaplanır. Grand total
   (`total = stay + cleaning`) içinden temizlik ÇIKARILIR; hasar
   depozitosu zaten total'e dahil değildir (yalnız snapshot).
   accommodationBase(total, cleaning) = max(total - cleaning, 0)
   ⚠️ total ve cleaning AYNI para biriminde olmalı (ikisi de display
   currency ya da ikisi de TRY snapshot). */
export const accommodationBase = (
  total: number,
  cleaningFee: number
) =>
  Math.max(
    (Number(total) || 0) - (Number(cleaningFee) || 0),
    0
  );

// 🔥 ÖN ÖDEME — base * rate/100. Base DAİMA konaklama bedeli olmalı
// (accommodationBase ile üretilir); grand total GEÇİLMEZ.
export const calculatePrepayment = (
  total: number,
  rate: number
) => {
  if (!total || !rate) {
    return 0;
  }

  return Math.round(
    (total * rate) / 100
  );
};