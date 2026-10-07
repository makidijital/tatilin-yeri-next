/* ===============================================================
   🛡️ FİYAT KAPSAMI — ORTAK KURAL (lib/price-coverage.ts)
   ===============================================================
   Yeni bir fiyat tanımı DEĞİL: fiyat motorunun (`getDailyPrice` +
   `calculateStayTotal`) mevcut semantiğiyle BİREBİR aynı olmalı.
   Parite, motorun `uncoveredNights` çıktısıyla kilitlenir.
=============================================================== */
import { describe, it, expect } from "vitest";
import {
  isNightPriced,
  isDayClosedForPrice,
  rangeHasUnpricedNight,
} from "@/lib/price-coverage";
import { calculateStayTotal } from "@/lib/price.engine";

const d = (s: string) => {
  const [y, m, day] = s.split("-").map(Number);
  return new Date(y, m - 1, day);
};

/* Ekim 2030:
     01–10 fiyatlı (end_date DAHİL)
     11    satır yok
     12–13 fiyat 0
     14    fiyat null
     15–20 fiyatlı   */
const PRICES = [
  { start_date: "2030-10-01", end_date: "2030-10-10", price: 5000, currency: "TRY" },
  { start_date: "2030-10-12", end_date: "2030-10-13", price: 0, currency: "TRY" },
  { start_date: "2030-10-14", end_date: "2030-10-14", price: null, currency: "TRY" },
  { start_date: "2030-10-15", end_date: "2030-10-20", price: 6000, currency: "TRY" },
];

describe("isNightPriced — motor semantiği", () => {
  it("2) fiyatlı gece; end_date DAHİL", () => {
    expect(isNightPriced(d("2030-10-01"), PRICES)).toBe(true);
    expect(isNightPriced(d("2030-10-10"), PRICES)).toBe(true);
  });
  it("1/7) satırı olmayan gece (sezon boşluğu) fiyatsız", () => {
    expect(isNightPriced(d("2030-10-11"), PRICES)).toBe(false);
  });
  it("5) fiyat 0 → fiyatsız", () => {
    expect(isNightPriced(d("2030-10-12"), PRICES)).toBe(false);
  });
  it("6) fiyat null / liste boş / undefined → fiyatsız", () => {
    expect(isNightPriced(d("2030-10-14"), PRICES)).toBe(false);
    expect(isNightPriced(d("2030-10-05"), [])).toBe(false);
    expect(isNightPriced(d("2030-10-05"), null)).toBe(false);
  });
});

describe("isDayClosedForPrice — çıkış günü korunur", () => {
  it("8) sezonun ertesi günü (11) ÇIKIŞ için açık; 12–14 kapalı; 15 açık", () => {
    expect(isDayClosedForPrice(d("2030-10-10"), PRICES)).toBe(false);
    expect(isDayClosedForPrice(d("2030-10-11"), PRICES)).toBe(false);
    expect(isDayClosedForPrice(d("2030-10-12"), PRICES)).toBe(true);
    expect(isDayClosedForPrice(d("2030-10-13"), PRICES)).toBe(true);
    expect(isDayClosedForPrice(d("2030-10-14"), PRICES)).toBe(true);
    expect(isDayClosedForPrice(d("2030-10-15"), PRICES)).toBe(false);
    /* sezon sonu 20 → 21 çıkış için açık, 22 kapalı */
    expect(isDayClosedForPrice(d("2030-10-21"), PRICES)).toBe(false);
    expect(isDayClosedForPrice(d("2030-10-22"), PRICES)).toBe(true);
  });
});

describe("rangeHasUnpricedNight — [giriş, çıkış)", () => {
  it("4) tamamı fiyatlı aralık → geçerli; çıkış günü fiyatsız olabilir (8)", () => {
    expect(rangeHasUnpricedNight(d("2030-10-05"), d("2030-10-10"), PRICES)).toBe(false);
    expect(rangeHasUnpricedNight(d("2030-10-09"), d("2030-10-11"), PRICES)).toBe(false);
    expect(rangeHasUnpricedNight(d("2030-10-15"), d("2030-10-21"), PRICES)).toBe(false);
  });
  it("3/9) arada / başta fiyatsız gece → reddedilir", () => {
    expect(rangeHasUnpricedNight(d("2030-10-09"), d("2030-10-17"), PRICES)).toBe(true);
    expect(rangeHasUnpricedNight(d("2030-10-11"), d("2030-10-12"), PRICES)).toBe(true);
    expect(rangeHasUnpricedNight(d("2030-10-14"), d("2030-10-16"), PRICES)).toBe(true);
  });
  it("0 gecelik aralık → geçersiz sayılmaz (seçim tamamlanmamış)", () => {
    expect(rangeHasUnpricedNight(d("2030-10-11"), d("2030-10-11"), PRICES)).toBe(false);
  });
  it("muaf geceler (admin düzenleme — kendi geceleri) kontrol dışı", () => {
    const exempt = (n: Date) => n.getDate() === 11;
    expect(rangeHasUnpricedNight(d("2030-10-10"), d("2030-10-12"), PRICES, exempt)).toBe(false);
  });
});

describe("motor paritesi — calculateStayTotal.uncoveredNights", () => {
  it("1–31 Ekim tüm aralıklar: helper ⇔ motor AYNI karar", () => {
    let checked = 0;
    for (let a = 1; a <= 25; a++) {
      for (let b = a + 1; b <= 26; b++) {
        const s = `2030-10-${String(a).padStart(2, "0")}`;
        const e = `2030-10-${String(b).padStart(2, "0")}`;
        const engine = calculateStayTotal(s, e, PRICES as never, "TRY", { TRY: 1 });
        expect(rangeHasUnpricedNight(d(s), d(e), PRICES), `${s}→${e}`).toBe(
          engine.uncoveredNights > 0
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(300);
  });

  it("10) %100 indirimli gerçek fiyat → fiyatlı (motor da geçerli sayar)", () => {
    const discounts = [
      {
        start_date: "2030-10-15",
        end_date: "2030-10-17",
        discount_type: "percent",
        discount_value: 100,
        currency: null,
      },
    ];
    const engine = calculateStayTotal(
      "2030-10-15",
      "2030-10-17",
      PRICES as never,
      "TRY",
      { TRY: 1 },
      discounts as never
    );
    expect(engine.uncoveredNights).toBe(0);
    expect(engine.stay).toBe(0);
    expect(rangeHasUnpricedNight(d("2030-10-15"), d("2030-10-17"), PRICES)).toBe(false);
    expect(isDayClosedForPrice(d("2030-10-16"), PRICES)).toBe(false);
  });
});
