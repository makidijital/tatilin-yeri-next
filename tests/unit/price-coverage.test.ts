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
  isValidCheckoutDay,
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

describe("takvim: check-in kapalılığı ≠ checkout uygunluğu", () => {
  it("2/13) gün KENDİ gecesi fiyatsızsa kapalı — önceki gecenin fiyatı AÇMAZ", () => {
    expect(isDayClosedForPrice(d("2030-10-10"), PRICES)).toBe(false);
    expect(isDayClosedForPrice(d("2030-10-11"), PRICES)).toBe(true); // sezon sonrası ilk gün
    expect(isDayClosedForPrice(d("2030-10-12"), PRICES)).toBe(true); // 0
    expect(isDayClosedForPrice(d("2030-10-14"), PRICES)).toBe(true); // null
    expect(isDayClosedForPrice(d("2030-10-15"), PRICES)).toBe(false);
    expect(isDayClosedForPrice(d("2030-10-21"), PRICES)).toBe(true);
  });
  it("7/14) sezonun son gecesinden sonraki gün CHECKOUT olarak geçerli", () => {
    expect(isValidCheckoutDay(d("2030-10-10"), d("2030-10-11"), PRICES)).toBe(true);
    expect(isValidCheckoutDay(d("2030-10-05"), d("2030-10-11"), PRICES)).toBe(true);
    expect(isValidCheckoutDay(d("2030-10-20"), d("2030-10-21"), PRICES)).toBe(true);
  });
  it("arada fiyatsız gece varsa checkout geçersiz; check-in'den önce/aynı gün geçersiz", () => {
    expect(isValidCheckoutDay(d("2030-10-10"), d("2030-10-12"), PRICES)).toBe(false);
    expect(isValidCheckoutDay(d("2030-10-11"), d("2030-10-12"), PRICES)).toBe(false);
    expect(isValidCheckoutDay(d("2030-10-10"), d("2030-10-10"), PRICES)).toBe(false);
    expect(isValidCheckoutDay(d("2030-10-10"), d("2030-10-09"), PRICES)).toBe(false);
  });
});

/* Kullanıcı örneği: 30 Kasım fiyatlı · 1 Aralık fiyatsız · 2 Aralık fiyatlı */
describe("referans örnek — 30 Kas / 1 Ara / 2 Ara", () => {
  const P = [
    { start_date: "2030-11-01", end_date: "2030-11-30", price: 7000, currency: "TRY" },
    { start_date: "2030-12-02", end_date: "2030-12-31", price: 9000, currency: "TRY" },
  ];
  it("1/6) 30 Kas ve 2 Ara check-in açık; 1 Ara kapalı", () => {
    expect(isDayClosedForPrice(d("2030-11-30"), P)).toBe(false);
    expect(isDayClosedForPrice(d("2030-12-01"), P)).toBe(true);
    expect(isDayClosedForPrice(d("2030-12-02"), P)).toBe(false);
  });
  it("3) 30 Kas → 1 Ara geçerli; 4/5) 1 Ara → 2 Ara ve 1 Ara → 3 Ara geçersiz", () => {
    expect(rangeHasUnpricedNight(d("2030-11-30"), d("2030-12-01"), P)).toBe(false);
    expect(isValidCheckoutDay(d("2030-11-30"), d("2030-12-01"), P)).toBe(true);
    expect(rangeHasUnpricedNight(d("2030-12-01"), d("2030-12-02"), P)).toBe(true);
    expect(rangeHasUnpricedNight(d("2030-12-01"), d("2030-12-03"), P)).toBe(true);
    /* 30 Kas → 2 Ara: 1 Ara gecesi arada → geçersiz */
    expect(isValidCheckoutDay(d("2030-11-30"), d("2030-12-02"), P)).toBe(false);
  });
  it("6/8) 30 Kas → 1 Ara toplamı YALNIZ 30 Kas gecesi (checkout günü fiyatlanmaz)", () => {
    const r = calculateStayTotal("2030-11-30", "2030-12-01", P as never, "TRY", { TRY: 1 });
    expect(r.uncoveredNights).toBe(0);
    expect(r.stay).toBe(7000);
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
    expect(isDayClosedForPrice(d("2030-10-15"), PRICES)).toBe(false);
  });
});
