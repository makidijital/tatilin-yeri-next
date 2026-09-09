import { describe, it, expect } from "vitest";

import { computeAuthoritativePoolHeatingSnapshot } from "@/app/services/reservation/_helpers/pool-heating-verify";

/* ===============================================================
   🛡️ HAVUZ ISITMA — 6. adım (public reservation create, SERVER RULE)
   ===============================================================
   `computeAuthoritativePoolHeatingSnapshot` — SAF helper (server-only
   İŞARETİ YOK → doğrudan test edilebilir; price-verify.ts'in tersine).
   SERVER KURALI (kullanıcı spesifikasyonu, verbatim):
     - selected=false                        → total=0
     - selected=true, villa fee NULL/<=0     → total=0
     - selected=true, fee>0                  → nights × fee
   Client'ın gönderdiği bir "total" YOK — bu fonksiyonun imzasında
   böyle bir parametre hiç bulunmuyor (client total'a güvenmeme
   kuralı, tip seviyesinde garanti).
=============================================================== */

const RATES = { USD: 30, EUR: 33, GBP: 38 };

describe("computeAuthoritativePoolHeatingSnapshot — server kuralı", () => {
  it("1) selected=false → total=0 (fee>0 olsa dahi)", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: false,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.pool_heating_selected).toBe(false);
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("2) selected=true, fee=1000 TRY, 5 gece → 5.000 TL", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.pool_heating_selected).toBe(true);
    expect(snap.original_pool_heating_total).toBe(5000);
    expect(snap.original_pool_heating_currency).toBe("TRY");
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("3) selected=true, villa fee NULL → total=0", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: null,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("4) selected=true, villa fee=0 → total=0", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 0,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.original_pool_heating_total).toBe(0);
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("5) gece sayısı 5→6 değişince total 5.000→6.000 olur", () => {
    const snap5 = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    const snap6 = computeAuthoritativePoolHeatingSnapshot({
      nights: 6,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap5.pool_heating_total_try).toBe(5000);
    expect(snap6.pool_heating_total_try).toBe(6000);
  });

  it("7) client 'yanlış' bir total göndermiş olsa dahi — bu fonksiyonun imzasında client total parametresi YOK; yalnız villa gerçek fee'sinden üretir", () => {
    // Fonksiyon imzasında client total'a yer YOK — bu test tip-seviyesinde
    // "client total'a güvenilmiyor" garantisini dokümante eder.
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    // Villa gerçek fee'si (1000/gece × 5 gece) her zaman 5000 üretir —
    // client ne gönderirse göndersin (parametre olarak alınmadığı için
    // etkileyemez).
    expect(snap.pool_heating_total_try).toBe(5000);
  });

  it("nights=0 → total=0 (selected+fee>0 olsa dahi)", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 0,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: "TRY",
      rates: RATES,
    });
    expect(snap.pool_heating_total_try).toBe(0);
  });

  it("döviz (EUR) villa fee → pool_heating_total_try convertPrice ile TRY'ye çevrilir", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 100, // 100 EUR/gece
      villaPoolHeatingCurrency: "EUR",
      rates: RATES, // EUR: 33
    });
    // raw: 5 gece × 100 EUR = 500 EUR (original currency, orijinal alan)
    expect(snap.original_pool_heating_total).toBe(500);
    expect(snap.original_pool_heating_currency).toBe("EUR");
    // TRY karşılığı: 500 × 33 = 16.500
    expect(snap.pool_heating_total_try).toBe(16500);
  });

  it("villaPoolHeatingCurrency eksik → 'TRY' fallback", () => {
    const snap = computeAuthoritativePoolHeatingSnapshot({
      nights: 5,
      poolHeatingSelected: true,
      villaPoolHeatingFee: 1000,
      villaPoolHeatingCurrency: null,
      rates: RATES,
    });
    expect(snap.original_pool_heating_currency).toBe("TRY");
    expect(snap.pool_heating_total_try).toBe(5000);
  });
});
