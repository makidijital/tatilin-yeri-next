/* ===============================================================
   🛡️ FAZ 51 — PRICE ENGINE TESTS
   ===============================================================
   Hedef: lib/price.engine.ts saf fonksiyonları.
     • calculateNights
     • calculateCleaningFee
     • calculateGrandTotal
     • normalizeDate
   Hiçbir DB / Supabase mock'u yok — pure math + date.
=============================================================== */

import { describe, it, expect } from "vitest";
import {
  calculateNights,
  calculateCleaningFee,
  calculateGrandTotal,
  calculatePrepayment,
  normalizeDate,
} from "@/lib/price.engine";
import type { PriceRange } from "@/lib/villa-row.types";

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
