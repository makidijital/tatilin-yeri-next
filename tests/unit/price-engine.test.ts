/* ===============================================================
   🛡️ FAZ 51 — PRICE ENGINE TESTS
   ===============================================================
   Hedef: lib/price.engine.ts saf fonksiyonları.
     • calculateNights
     • calculateCleaningFee
     • calculateGrandTotal
     • normalizeDate
     • calculatePoolHeatingFee (Havuz Isıtma — 2. adım)
     • accommodationBase (Havuz Isıtma — 2. adım genişletmesi)
   Hiçbir DB / Supabase mock'u yok — pure math + date.
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  calculateNights,
  calculateCleaningFee,
  calculateGrandTotal,
  calculatePrepayment,
  calculatePoolHeatingFee,
  accommodationBase,
  normalizeDate,
  isPoolHeatingActiveForRange,
  calculateStayTotal,
  getActiveDiscount,
  applyDiscountToDailyPrice,
} from "@/lib/price.engine";
import type { PriceRange } from "@/lib/villa-row.types";
import type { DiscountRange } from "@/lib/price.engine";

describe("calculateNights", () => {
  it("returns 1 night for consecutive days", () => {
    expect(calculateNights("2026-06-01", "2026-06-02")).toBe(1);
  });

  it("returns 7 nights for a week", () => {
    expect(calculateNights("2026-06-01", "2026-06-08")).toBe(7);
  });

  it("returns 0 when start and end are the same day (zero-night range)", () => {
    expect(calculateNights("2026-06-05", "2026-06-05")).toBe(0);
  });

  it("returns 0 for empty inputs", () => {
    expect(calculateNights("", "2026-06-02")).toBe(0);
    expect(calculateNights("2026-06-01", "")).toBe(0);
    expect(calculateNights("", "")).toBe(0);
  });

  it("is timezone-stable across DST boundaries (TR has no DST since 2016 but parseLocalDate must hold)", () => {
    /* Mart-sonu / Ekim-sonu UTC DST geçişlerinde 23/25 saatlik gün
       riski parseLocalDate ile elimine edilir. Calc ceil olduğu için
       saatlik drift olmadığı sürece tam gün döner. */
    expect(calculateNights("2026-03-28", "2026-03-30")).toBe(2);
    expect(calculateNights("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("counts a long range correctly", () => {
    expect(calculateNights("2026-01-01", "2026-12-31")).toBe(364);
  });
});

describe("calculateCleaningFee", () => {
  it("returns 0 when fee is 0", () => {
    expect(calculateCleaningFee(5, 0)).toBe(0);
  });

  it("returns full fee when no limit set", () => {
    expect(calculateCleaningFee(2, 500)).toBe(500);
    expect(calculateCleaningFee(2, 500, 0)).toBe(500);
  });

  it("returns full fee when nights are below the limit", () => {
    /* limit=7 → 7 geceden AZ ise temizlik ücreti alınır */
    expect(calculateCleaningFee(3, 500, 7)).toBe(500);
    expect(calculateCleaningFee(6, 500, 7)).toBe(500);
  });

  it("waives the fee when nights >= limit", () => {
    expect(calculateCleaningFee(7, 500, 7)).toBe(0);
    expect(calculateCleaningFee(14, 500, 7)).toBe(0);
  });
});

describe("calculatePrepayment", () => {
  it("rounds to the nearest integer", () => {
    expect(calculatePrepayment(1000, 30)).toBe(300);
    expect(calculatePrepayment(1000, 33)).toBe(330);
  });

  it("returns 0 for zero total or rate", () => {
    expect(calculatePrepayment(0, 30)).toBe(0);
    expect(calculatePrepayment(1000, 0)).toBe(0);
  });
});

describe("normalizeDate", () => {
  it("strips time-of-day to local midnight", () => {
    const original = new Date(2026, 5, 15, 14, 33, 7); // 15 June 2026 14:33:07
    const normalized = normalizeDate(original);
    expect(normalized.getFullYear()).toBe(2026);
    expect(normalized.getMonth()).toBe(5);
    expect(normalized.getDate()).toBe(15);
    expect(normalized.getHours()).toBe(0);
    expect(normalized.getMinutes()).toBe(0);
    expect(normalized.getSeconds()).toBe(0);
  });
});

describe("calculateGrandTotal", () => {
  const prices: PriceRange[] = [
    { start_date: "2026-06-01", end_date: "2026-08-31", price: 1000, currency: "TRY" },
  ];
  const rates = { USD: 30, EUR: 33, GBP: 38 };

  it("computes nights + stay + cleaning + total in same currency", () => {
    const res = calculateGrandTotal({
      start: "2026-06-01",
      end: "2026-06-04", // 3 nights
      prices,
      currency: "TRY",
      rates,
      cleaning_fee: 500,
      cleaning_currency: "TRY",
      cleaning_limit: 7, // 3 < 7 → fee applies
    });
    expect(res.nights).toBe(3);
    expect(res.stay).toBe(3000);
    expect(res.cleaning).toBe(500);
    expect(res.total).toBe(3500);
    expect(res.currency).toBe("TRY");
    expect(res.original_currency).toBe("TRY");
  });

  it("waives cleaning when nights meet the limit", () => {
    const res = calculateGrandTotal({
      start: "2026-06-01",
      end: "2026-06-08", // 7 nights
      prices,
      currency: "TRY",
      rates,
      cleaning_fee: 500,
      cleaning_currency: "TRY",
      cleaning_limit: 7,
    });
    expect(res.nights).toBe(7);
    expect(res.cleaning).toBe(0);
    expect(res.total).toBe(7000);
  });

  it("converts stay + cleaning into target currency", () => {
    const res = calculateGrandTotal({
      start: "2026-06-01",
      end: "2026-06-03", // 2 nights × 1000 TRY = 2000 TRY
      prices,
      currency: "USD",
      rates, // 1 USD = 30 TRY
      cleaning_fee: 300, // 300 TRY = 10 USD
      cleaning_currency: "TRY",
      cleaning_limit: 7,
    });
    /* 2000 TRY → USD: 2000/30 = 66.67; 300/30 = 10 → total ≈ 76.67 */
    expect(res.stay).toBeCloseTo(66.67, 1);
    expect(res.cleaning).toBeCloseTo(10, 2);
    expect(res.total).toBeCloseTo(76.67, 1);
    expect(res.original_stay).toBe(2000);
    expect(res.original_cleaning).toBe(300);
    expect(res.original_currency).toBe("TRY");
    expect(res.currency).toBe("USD");
  });

  it("returns nights=0 and zero costs for empty range", () => {
    const res = calculateGrandTotal({
      start: "",
      end: "",
      prices,
      currency: "TRY",
      rates,
    });
    expect(res.nights).toBe(0);
    expect(res.stay).toBe(0);
    expect(res.cleaning).toBe(0);
    expect(res.total).toBe(0);
  });

  it("uses price[0] fallback when range falls outside defined seasons", () => {
    /* Range 2027 yılında, prices 2026 yazına ait → loop hiçbir günde
       getDailyPrice'a hit etmez → fallback: prices[0] tek gece
       fiyatına düşer (mevcut davranış, byte-identical). */
    const res = calculateGrandTotal({
      start: "2027-01-01",
      end: "2027-01-08",
      prices,
      currency: "TRY",
      rates,
    });
    expect(res.nights).toBe(7);
    expect(res.stay).toBe(1000); // fallback single price
    expect(res.original_stay).toBe(1000);
  });
});

/* ===============================================================
   🛡️ HAVUZ ISITMA — 2. adım (calculatePoolHeatingFee — pure fonksiyon)
   =============================================================== */
describe("calculatePoolHeatingFee", () => {
  it("returns 0 when not selected", () => {
    expect(calculatePoolHeatingFee(5, 1000, false)).toBe(0);
  });

  it("returns 0 when fee is null/undefined/0", () => {
    expect(calculatePoolHeatingFee(5, 0, true)).toBe(0);
    expect(calculatePoolHeatingFee(5, null, true)).toBe(0);
    expect(calculatePoolHeatingFee(5, undefined, true)).toBe(0);
  });

  it("returns 0 when nights <= 0", () => {
    expect(calculatePoolHeatingFee(0, 1000, true)).toBe(0);
    expect(calculatePoolHeatingFee(-1, 1000, true)).toBe(0);
  });

  it("returns nights × fee when selected and fee > 0 (5 Ekim → 10 Ekim, 5 gece × 1.000 TL)", () => {
    expect(calculateNights("2026-10-05", "2026-10-10")).toBe(5);
    expect(calculatePoolHeatingFee(5, 1000, true)).toBe(5000);
  });
});

/* ===============================================================
   🛡️ HAVUZ ISITMA — 2. adım (calculateGrandTotal genişletmesi)
   ===============================================================
   Örnek senaryo (kullanıcı spesifikasyonu ile birebir):
     5 gece × 4.000 TL/gece konaklama = 20.000 TL (stayTotal)
     Temizlik (cleaning): 3.500 TL
     Havuz ısıtma: 1.000 TL/gece × 5 gece = 5.000 TL (poolHeatingTotal)
     Grand total: 20.000 + 3.500 + 5.000 = 28.500 TL
     Prepayment base (havuz ısıtma + temizlik HARİÇ): 20.000 TL
     Prepayment %20 → 4.000 TL · Remaining → 24.500 TL
=============================================================== */
describe("calculateGrandTotal — pool heating (2. adım)", () => {
  const stayPrices: PriceRange[] = [
    { start_date: "2026-10-01", end_date: "2026-12-31", price: 4000, currency: "TRY" },
  ];
  const rates = { USD: 30, EUR: 33, GBP: 38 };
  const baseArgs = {
    start: "2026-10-05",
    end: "2026-10-10", // 5 nights
    prices: stayPrices,
    currency: "TRY",
    rates,
    cleaning_fee: 3500,
    cleaning_currency: "TRY",
    cleaning_limit: 0, // her zaman uygulanır
  };

  it("1) pool heating seçili değil → poolHeating=0, grand total=23.500, prepayment base=20.000", () => {
    const res = calculateGrandTotal(baseArgs);
    expect(res.nights).toBe(5);
    expect(res.stay).toBe(20000);
    expect(res.cleaning).toBe(3500);
    expect(res.poolHeating).toBe(0);
    expect(res.total).toBe(23500);
    expect(accommodationBase(res.total, res.cleaning, res.poolHeating)).toBe(20000);
  });

  it("2) pool heating seçili (1.000 TL/gece × 5 gece) → poolHeatingTotal=5.000, grand total=28.500, prepayment base=20.000", () => {
    const res = calculateGrandTotal({
      ...baseArgs,
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
    });
    expect(res.nights).toBe(5);
    expect(res.stay).toBe(20000);
    expect(res.cleaning).toBe(3500);
    expect(res.poolHeating).toBe(5000);
    expect(res.total).toBe(28500);
    expect(accommodationBase(res.total, res.cleaning, res.poolHeating)).toBe(20000);

    // Kritik iş kuralı — örnek doğrulaması: prepayment %20 → 4.000, remaining → 24.500
    const prepayment = calculatePrepayment(
      accommodationBase(res.total, res.cleaning, res.poolHeating),
      20
    );
    expect(prepayment).toBe(4000);
    expect(res.total - prepayment).toBe(24500);
  });

  it("3) pool heating fee NULL/0 (seçili olsa dahi) → poolHeatingTotal=0", () => {
    const resNull = calculateGrandTotal({
      ...baseArgs,
      pool_heating_selected: true,
      // pool_heating_fee verilmedi → engine default 0 uygular
    });
    expect(resNull.poolHeating).toBe(0);
    expect(resNull.total).toBe(23500);

    const resZero = calculateGrandTotal({
      ...baseArgs,
      pool_heating_fee: 0,
      pool_heating_selected: true,
    });
    expect(resZero.poolHeating).toBe(0);
    expect(resZero.total).toBe(23500);
  });

  it("4) pool heating seçili ama fee 0 → poolHeatingTotal=0 (senaryo 3 ile aynı davranış, ayrıca doğrulama)", () => {
    const res = calculateGrandTotal({
      ...baseArgs,
      pool_heating_fee: 0,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
    });
    expect(res.poolHeating).toBe(0);
    expect(res.original_pool_heating).toBe(0);
    expect(res.total).toBe(23500);
  });

  it("5) eski çağrılar (pool heating parametreleri verilmeden) BUGÜNKÜ hesaplamayla birebir aynı sonucu verir", () => {
    const res = calculateGrandTotal(baseArgs); // pool_heating_* hiç geçilmedi
    expect(res.poolHeating).toBe(0);
    expect(res.original_pool_heating).toBe(0);
    expect(res.original_pool_heating_currency).toBe("TRY");
    expect(res.total).toBe(res.stay + res.cleaning); // mevcut (pre-existing) formül
    expect(res.total).toBe(23500);
    // accommodationBase da 2-parametreli eski çağrılarla BYTE-IDENTICAL:
    expect(accommodationBase(res.total, res.cleaning)).toBe(20000);
  });

  it("6) 5 Ekim → 10 Ekim: nights=5, 1.000 TL/gece → pool heating 5.000 TL", () => {
    const res = calculateGrandTotal({
      ...baseArgs,
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
    });
    expect(res.nights).toBe(5);
    expect(res.poolHeating).toBe(5000);
    expect(res.original_pool_heating).toBe(5000);
  });

  it("USD hedef currency'de pool heating de cleaning gibi convertPrice ile çevrilir", () => {
    const res = calculateGrandTotal({
      ...baseArgs,
      currency: "USD", // 1 USD = 30 TRY
      pool_heating_fee: 300, // 300 TRY/gece × 5 = 1500 TRY → 50 USD
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
    });
    expect(res.original_pool_heating).toBe(1500);
    expect(res.original_pool_heating_currency).toBe("TRY");
    expect(res.poolHeating).toBeCloseTo(50, 2);
    expect(res.currency).toBe("USD");
  });
});

/* ===============================================================
   🛡️ HAVUZ ISITMA — 2. adım (accommodationBase genişletmesi)
   =============================================================== */
describe("accommodationBase", () => {
  it("2-parametreli eski çağrılar BYTE-IDENTICAL kalır (poolHeatingFee default 0)", () => {
    expect(accommodationBase(3500, 500)).toBe(3000);
    expect(accommodationBase(23500, 3500)).toBe(20000);
  });

  it("3. parametre (poolHeatingFee) verildiğinde grand total'dan hem cleaning hem pool heating çıkarılır", () => {
    expect(accommodationBase(28500, 3500, 5000)).toBe(20000);
  });

  it("negatife düşmez (Math.max ile 0'da clamp)", () => {
    expect(accommodationBase(100, 60, 60)).toBe(0);
  });
});


/* ===============================================================
   🛡️ Migration 076 — SEZONLUK AY KISITI (isPoolHeatingActiveForRange)
   ===============================================================
   Aktif ay kümesi örneklerde kullanıcı spesifikasyonuyla birebir:
     Ocak-Mayıs + Eylül-Aralık aktif (Haziran/Temmuz/Ağustos pasif) →
     [1, 2, 3, 4, 5, 9, 10, 11, 12]
   Kural: rezervasyonun kapsadığı TÜM geceler (check-in dahil,
   check-out hariç) aktif ay kümesinde olmalı; tek bir gece bile
   dışarıdaysa false.
=============================================================== */
describe("isPoolHeatingActiveForRange", () => {
  const JAN_MAY_SEP_DEC = [1, 2, 3, 4, 5, 9, 10, 11, 12];

  it("NULL activeMonths → true (kısıtlama yok, geriye dönük uyumluluk)", () => {
    expect(
      isPoolHeatingActiveForRange("2026-07-10", "2026-07-15", null)
    ).toBe(true);
  });

  it("undefined activeMonths → true (kısıtlama yok)", () => {
    expect(
      isPoolHeatingActiveForRange("2026-07-10", "2026-07-15", undefined)
    ).toBe(true);
  });

  it("tüm 12 ay explicit aktifse → true", () => {
    const allMonths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(
      isPoolHeatingActiveForRange("2026-07-10", "2026-07-15", allMonths)
    ).toBe(true);
  });

  it("boş dizi [] → false (hiçbir ay aktif değil)", () => {
    expect(
      isPoolHeatingActiveForRange("2026-10-10", "2026-10-15", [])
    ).toBe(false);
  });

  it("10 Temmuz → 15 Temmuz: yalnız Temmuz (pasif) → false", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-07-10",
        "2026-07-15",
        JAN_MAY_SEP_DEC
      )
    ).toBe(false);
  });

  it("10 Ekim → 15 Ekim: yalnız Ekim (aktif) → true", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-10-10",
        "2026-10-15",
        JAN_MAY_SEP_DEC
      )
    ).toBe(true);
  });

  it("28 Mayıs → 3 Haziran: Mayıs (aktif) + Haziran (pasif) → false", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-05-28",
        "2026-06-03",
        JAN_MAY_SEP_DEC
      )
    ).toBe(false);
  });

  it("30 Haziran → 5 Temmuz: Haziran (pasif) + Temmuz (pasif) → false", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-06-30",
        "2026-07-05",
        JAN_MAY_SEP_DEC
      )
    ).toBe(false);
  });

  it("28 Ağustos → 3 Eylül: Ağustos (pasif) + Eylül (aktif) → false", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-08-28",
        "2026-09-03",
        JAN_MAY_SEP_DEC
      )
    ).toBe(false);
  });

  it("30 Aralık → 3 Ocak: Aralık (aktif) + Ocak (aktif) → true (yıl sınırı doğru geçiliyor)", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-12-30",
        "2027-01-03",
        JAN_MAY_SEP_DEC
      )
    ).toBe(true);
  });

  it("tek gecelik rezervasyon, aktif ayda → true", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-10-10",
        "2026-10-11",
        JAN_MAY_SEP_DEC
      )
    ).toBe(true);
  });

  it("tek gecelik rezervasyon, pasif ayda → false", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-07-10",
        "2026-07-11",
        JAN_MAY_SEP_DEC
      )
    ).toBe(false);
  });

  it("start === end (0 gece) → true (calculatePoolHeatingFee zaten nights<=0 için 0 döner, sonuç etkilenmez)", () => {
    expect(
      isPoolHeatingActiveForRange(
        "2026-07-10",
        "2026-07-10",
        JAN_MAY_SEP_DEC
      )
    ).toBe(true);
  });

  it("boş start/end → true (calculateNights ile aynı 'geçersiz input' güvenli varsayılanı)", () => {
    expect(
      isPoolHeatingActiveForRange("", "2026-07-15", JAN_MAY_SEP_DEC)
    ).toBe(true);
    expect(
      isPoolHeatingActiveForRange("2026-07-10", "", JAN_MAY_SEP_DEC)
    ).toBe(true);
  });
});

/* ===============================================================
   🛡️ Migration 076 — calculateGrandTotal ENTEGRASYONU
   ===============================================================
   pool_heating_months parametresi calculatePoolHeatingFee'ye
   giden "selected" değerini AND'ler — imza/hesap formülü DEĞİŞMEDİ.
=============================================================== */
describe("calculateGrandTotal — sezonluk ay kısıtı (Migration 076)", () => {
  const stayPrices: PriceRange[] = [
    {
      start_date: "2026-10-01",
      end_date: "2026-10-31",
      price: 4000,
      currency: "TRY",
    },
    {
      start_date: "2026-07-01",
      end_date: "2026-07-31",
      price: 4000,
      currency: "TRY",
    },
  ];

  it("pool_heating_months verilmezse (undefined) davranış BYTE-IDENTICAL (eski çağrılar bozulmaz)", () => {
    const result = calculateGrandTotal({
      start: "2026-10-05",
      end: "2026-10-10",
      prices: stayPrices,
      currency: "TRY",
      rates: {},
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
    });
    expect(result.poolHeating).toBe(5000);
  });

  it("aktif ayda (Ekim) selected=true, months=[1..5,9..12] → tutar hesaplanır", () => {
    const result = calculateGrandTotal({
      start: "2026-10-05",
      end: "2026-10-10",
      prices: stayPrices,
      currency: "TRY",
      rates: {},
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
      pool_heating_months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    });
    expect(result.poolHeating).toBe(5000);
  });

  it("pasif ayda (Temmuz) selected=true olsa bile tutar 0 (server/UI ortak kural)", () => {
    const result = calculateGrandTotal({
      start: "2026-07-05",
      end: "2026-07-10",
      prices: stayPrices,
      currency: "TRY",
      rates: {},
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
      pool_heating_months: [1, 2, 3, 4, 5, 9, 10, 11, 12],
    });
    expect(result.poolHeating).toBe(0);
    // stay hâlâ hesaplanır — yalnız pool heating etkilenir.
    expect(result.total).toBe(result.stay);
  });

  it("NULL pool_heating_months → her ayda aktif (geriye dönük uyumluluk)", () => {
    const result = calculateGrandTotal({
      start: "2026-07-05",
      end: "2026-07-10",
      prices: stayPrices,
      currency: "TRY",
      rates: {},
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
      pool_heating_months: null,
    });
    expect(result.poolHeating).toBe(5000);
  });
});


/* ===============================================================
   🛡️ ADIM 2 — VILLA_DISCOUNTS KATMANI (price.engine entegrasyonu)
   ===============================================================
   Kapsam: getActiveDiscount (tarih eşleşmesi, villa_prices ile birebir
   aynı kapalı interval) + applyDiscountToDailyPrice (percent/fixed
   formül + currency + negative-clamp) + calculateStayTotal/
   calculateGrandTotal'a opsiyonel `discounts` parametresi entegrasyonu.
   villa_prices/getDailyPrice HİÇ değişmedi — bu testler yalnız YENİ,
   AYRI katmanı doğrular.
=============================================================== */
describe("getActiveDiscount", () => {
  const discount: DiscountRange = {
    start_date: "2026-06-10",
    end_date: "2026-06-20",
    discount_type: "percent",
    discount_value: 20,
  };

  it("kapalı interval — start_date DAHİL", () => {
    expect(getActiveDiscount(new Date(2026, 5, 10), [discount])).toEqual(discount);
  });

  it("kapalı interval — end_date DAHİL (villa_prices ile birebir aynı semantik)", () => {
    expect(getActiveDiscount(new Date(2026, 5, 20), [discount])).toEqual(discount);
  });

  it("start_date'den 1 gün önce → null (aralık dışı)", () => {
    expect(getActiveDiscount(new Date(2026, 5, 9), [discount])).toBeNull();
  });

  it("end_date'den 1 gün sonra → null (aralık dışı)", () => {
    expect(getActiveDiscount(new Date(2026, 5, 21), [discount])).toBeNull();
  });

  it("discounts boş/undefined/null → null", () => {
    expect(getActiveDiscount(new Date(2026, 5, 15), [])).toBeNull();
    expect(getActiveDiscount(new Date(2026, 5, 15), undefined)).toBeNull();
    expect(getActiveDiscount(new Date(2026, 5, 15), null)).toBeNull();
  });

  it("birden fazla (beklenmedik) kayıt gelse bile yalnız İLKİ kullanılır — toplanmaz/üst üste uygulanmaz", () => {
    const first: DiscountRange = {
      start_date: "2026-06-01",
      end_date: "2026-06-30",
      discount_type: "percent",
      discount_value: 10,
    };
    const second: DiscountRange = {
      start_date: "2026-06-01",
      end_date: "2026-06-30",
      discount_type: "percent",
      discount_value: 50,
    };
    // DB'de bu durum EXCLUDE constraint (villa_discounts_no_overlap,
    // migration 079) ile zaten engelleniyor; burada uygulama
    // katmanının GÜVENLİ davrandığını (yalnız ilkini alıp
    // toplamadığını) doğruluyoruz.
    expect(getActiveDiscount(new Date(2026, 5, 15), [first, second])).toEqual(first);
  });
});

describe("applyDiscountToDailyPrice", () => {
  const daily = (original: number, original_currency = "TRY") => ({
    converted: original,
    original,
    original_currency,
  });

  it("discount null → daily AYNEN döner (BYTE-IDENTICAL)", () => {
    const d = daily(10000);
    expect(applyDiscountToDailyPrice(d, null, "TRY", {})).toEqual(d);
  });

  it("%20 percent discount → 10.000 → 8.000", () => {
    const res = applyDiscountToDailyPrice(
      daily(10000),
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "percent", discount_value: 20 },
      "TRY",
      {}
    );
    expect(res.original).toBe(8000);
    expect(res.converted).toBe(8000);
  });

  it("%20 percent discount → 12.000 → 9.600", () => {
    const res = applyDiscountToDailyPrice(
      daily(12000),
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "percent", discount_value: 20 },
      "TRY",
      {}
    );
    expect(res.original).toBe(9600);
  });

  it("fixed 1.000 → 10.000 → 9.000 (aynı currency)", () => {
    const res = applyDiscountToDailyPrice(
      daily(10000, "TRY"),
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "fixed", discount_value: 1000, currency: "TRY" },
      "TRY",
      {}
    );
    expect(res.original).toBe(9000);
  });

  it("indirim sonrası negatif olacaksa 0'da clamp edilir (Math.max(0, ...))", () => {
    const res = applyDiscountToDailyPrice(
      daily(500, "TRY"),
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "fixed", discount_value: 1000, currency: "TRY" },
      "TRY",
      {}
    );
    expect(res.original).toBe(0);
    expect(res.converted).toBe(0);
  });

  it("percent discount currency bağımsızdır (discount.currency olmasa da uygulanır)", () => {
    const res = applyDiscountToDailyPrice(
      daily(10000, "USD"),
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "percent", discount_value: 10 },
      "USD",
      {}
    );
    expect(res.original).toBe(9000);
  });

  it("fixed discount farklı currency'de ise convertPrice ile villa'nın orijinal currency'sine çevrilir", () => {
    // Villa gecelik fiyatı TRY, discount 10 USD sabit. rates: 1 USD = 30 TRY
    // → 10 USD = 300 TRY düşülür → 10000 - 300 = 9700 TRY.
    const res = applyDiscountToDailyPrice(
      daily(10000, "TRY"),
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "fixed", discount_value: 10, currency: "USD" },
      "TRY",
      { USD: 30 }
    );
    expect(res.original).toBe(9700);
  });

  it("0 (veya negatif) normal fiyat üzerinde indirim uygulanmaz — daily aynen döner", () => {
    const d = daily(0);
    const res = applyDiscountToDailyPrice(
      d,
      { start_date: "2026-06-10", end_date: "2026-06-20", discount_type: "percent", discount_value: 50 },
      "TRY",
      {}
    );
    expect(res).toEqual(d);
  });
});

/* ===============================================================
   🛡️ ADIM 2 — calculateStayTotal ENTEGRASYONU
   ===============================================================
   Kullanıcı örneği ile birebir:
     10 Haziran normal fiyat: 10.000 TL, 11 Haziran: 12.000 TL, %20 discount
     → 10 Haziran 8.000 + 11 Haziran 9.600 = 17.600 TL
=============================================================== */
describe("calculateStayTotal — villa_discounts entegrasyonu (Adım 2)", () => {
  const rates = { USD: 30, EUR: 33, GBP: 38 };

  it("1) discount yok (discounts hiç verilmez / boş dizi) → mevcut fiyat DEĞİŞMEZ", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 1000, currency: "TRY" },
    ];
    const withoutParam = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates);
    const withEmptyArray = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates, []);
    expect(withoutParam.original_stay).toBe(2000);
    expect(withEmptyArray.original_stay).toBe(2000);
    expect(withoutParam).toEqual(withEmptyArray);
  });

  it("6) farklı gecelerde farklı normal fiyat + aynı %20 discount → her gece AYRI hesaplanır (kullanıcı örneği)", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-10", end_date: "2026-06-10", price: 10000, currency: "TRY" },
      { start_date: "2026-06-11", end_date: "2026-06-11", price: 12000, currency: "TRY" },
    ];
    const discounts: DiscountRange[] = [
      { start_date: "2026-06-10", end_date: "2026-06-11", discount_type: "percent", discount_value: 20 },
    ];
    const res = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates, discounts);
    // 10 Haziran: 10.000 × 0.8 = 8.000 · 11 Haziran: 12.000 × 0.8 = 9.600 · toplam 17.600
    expect(res.original_stay).toBe(17600);
  });

  it("5) discount tarih aralığı DIŞINDA → o gece normal fiyat aynen kullanılır", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 10000, currency: "TRY" },
    ];
    const discounts: DiscountRange[] = [
      { start_date: "2026-07-01", end_date: "2026-07-31", discount_type: "percent", discount_value: 50 },
    ];
    const res = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates, discounts);
    expect(res.original_stay).toBe(20000); // 2 gece × 10.000, indirim hiç etkilemedi
  });

  it("4) fixed 1.000 discount, 2 gece × 10.000 → her gece 9.000, toplam 18.000", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 10000, currency: "TRY" },
    ];
    const discounts: DiscountRange[] = [
      { start_date: "2026-06-10", end_date: "2026-06-11", discount_type: "fixed", discount_value: 1000, currency: "TRY" },
    ];
    const res = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates, discounts);
    expect(res.original_stay).toBe(18000);
  });

  it("7) indirim sonrası negatif olacaksa gece başına 0'da clamp edilir (toplam negatif OLMAZ)", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 500, currency: "TRY" },
    ];
    const discounts: DiscountRange[] = [
      { start_date: "2026-06-10", end_date: "2026-06-11", discount_type: "fixed", discount_value: 1000, currency: "TRY" },
    ];
    const res = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates, discounts);
    expect(res.original_stay).toBe(0);
  });

  it("10) villa_prices ile aynı kapalı interval — discount end_date'in TAM SON GECESİNDE de uygulanır, sonraki gece uygulanmaz", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 10000, currency: "TRY" },
    ];
    // checkin 10, checkout 13 → geceler: 10, 11, 12 (check-out hariç).
    // discount end_date=11 (kapalı) → yalnız 10 ve 11 indirimli, 12 indirimsiz.
    const discounts: DiscountRange[] = [
      { start_date: "2026-06-10", end_date: "2026-06-11", discount_type: "percent", discount_value: 20 },
    ];
    const res = calculateStayTotal("2026-06-10", "2026-06-13", prices, "TRY", rates, discounts);
    // 10: 8000, 11: 8000, 12: 10000 (indirimsiz) → toplam 26.000
    expect(res.original_stay).toBe(26000);
  });

  it("11) %100 percent discount (discount_type: \"percent\", discount_value: 100) → normal fiyat 0 TL olur, fallback normal fiyatı GERİ GETİRMEZ", () => {
    const prices: PriceRange[] = [
      { start_date: "2026-06-01", end_date: "2026-06-30", price: 10000, currency: "TRY" },
    ];
    const discounts: DiscountRange[] = [
      { start_date: "2026-06-10", end_date: "2026-06-11", discount_type: "percent", discount_value: 100 },
    ];
    // 2 gece (10, 11), ikisi de %100 indirimli → her gece 10.000 × (1 - 100/100) = 0.
    // Önceki bir turda tespit edilip düzeltilen bug: stay===0 olunca devreye giren
    // "fallback" bloğu bunu yanlışlıkla prices[0]'ın normal fiyatına (10.000×2=20.000)
    // geri döndürüyordu. hadMatchingPrice guard'ı bunu artık engelliyor.
    const res = calculateStayTotal("2026-06-10", "2026-06-12", prices, "TRY", rates, discounts);
    expect(res.original_stay).toBe(0);
    expect(res.stay).toBe(0);
  });
});

/* ===============================================================
   🛡️ ADIM 2 — calculateGrandTotal: cleaning/pool heating izolasyonu
   =============================================================== */
describe("calculateGrandTotal — villa_discounts (Adım 2) cleaning/pool heating izolasyonu", () => {
  const rates = { USD: 30, EUR: 33, GBP: 38 };
  const prices: PriceRange[] = [
    { start_date: "2026-06-01", end_date: "2026-06-30", price: 10000, currency: "TRY" },
  ];
  const discounts: DiscountRange[] = [
    { start_date: "2026-06-10", end_date: "2026-06-11", discount_type: "percent", discount_value: 20 },
  ];

  it("8) cleaning/short-stay fee discount'tan ETKİLENMEZ — yalnız stay değişir", () => {
    const withoutDiscount = calculateGrandTotal({
      start: "2026-06-10",
      end: "2026-06-12",
      prices,
      currency: "TRY",
      rates,
      cleaning_fee: 500,
      cleaning_currency: "TRY",
      cleaning_limit: 7,
    });
    const withDiscount = calculateGrandTotal({
      start: "2026-06-10",
      end: "2026-06-12",
      prices,
      currency: "TRY",
      rates,
      cleaning_fee: 500,
      cleaning_currency: "TRY",
      cleaning_limit: 7,
      discounts,
    });
    expect(withDiscount.cleaning).toBe(withoutDiscount.cleaning);
    expect(withDiscount.cleaning).toBe(500);
    expect(withDiscount.stay).toBeLessThan(withoutDiscount.stay); // yalnız stay etkilendi
    expect(withDiscount.stay).toBe(16000); // 2 gece × 10.000 × 0.8
  });

  it("9) pool heating discount'tan ETKİLENMEZ — yalnız stay değişir", () => {
    const withoutDiscount = calculateGrandTotal({
      start: "2026-06-10",
      end: "2026-06-12",
      prices,
      currency: "TRY",
      rates,
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
    });
    const withDiscount = calculateGrandTotal({
      start: "2026-06-10",
      end: "2026-06-12",
      prices,
      currency: "TRY",
      rates,
      pool_heating_fee: 1000,
      pool_heating_currency: "TRY",
      pool_heating_selected: true,
      discounts,
    });
    expect(withDiscount.poolHeating).toBe(withoutDiscount.poolHeating);
    expect(withDiscount.poolHeating).toBe(2000); // 2 gece × 1.000, indirimden bağımsız
    expect(withDiscount.stay).toBe(16000);
    expect(withDiscount.total).toBe(withDiscount.stay + withDiscount.poolHeating);
  });

  it("discounts hiç verilmeyen eski çağrılar BYTE-IDENTICAL kalır (geriye dönük uyumluluk)", () => {
    const res = calculateGrandTotal({
      start: "2026-06-10",
      end: "2026-06-12",
      prices,
      currency: "TRY",
      rates,
      cleaning_fee: 500,
      cleaning_currency: "TRY",
      cleaning_limit: 7,
    });
    expect(res.stay).toBe(20000); // indirim yok, mevcut davranış
    expect(res.total).toBe(20500);
  });
});
