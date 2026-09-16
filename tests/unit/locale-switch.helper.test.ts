/* ===============================================================
   🛡️ PHASE 10C — LOCALE SWITCH HELPER: TESTLER
   ===============================================================
   Hedef: lib/i18n/locale-switch.helper.ts (hasLocaleRoute,
   getLocaleSwitchTargets). Kullanıcının audit onayında verdiği tüm
   örnek senaryolar (ana sayfa, villa detay, rezervasyon, locale
   karşılığı olmayan route'lar için fallback) burada birebir
   doğrulanır. Saf fonksiyonlar — DB/network/React'e dokunulmaz.
   =============================================================== */

import { describe, it, expect } from "vitest";

import {
  hasLocaleRoute,
  getLocaleSwitchTargets,
} from "@/lib/i18n/locale-switch.helper";

describe("hasLocaleRoute", () => {
  it("1) '/' (ana sayfa) → true (Phase 10C stub route'ları var)", () => {
    expect(hasLocaleRoute("/")).toBe(true);
  });

  it("2) '/arama' → true", () => {
    expect(hasLocaleRoute("/arama")).toBe(true);
  });

  it("3) '/kiralik-villalar' → true", () => {
    expect(hasLocaleRoute("/kiralik-villalar")).toBe(true);
  });

  it("4) '/kiralik-villa/test-villa' (slug'lı) → true", () => {
    expect(hasLocaleRoute("/kiralik-villa/test-villa")).toBe(true);
  });

  it("5) '/rezervasyon/test-villa' (slug'lı) → true", () => {
    expect(hasLocaleRoute("/rezervasyon/test-villa")).toBe(true);
  });

  it("6) '/kiralik-villa/' (slug'sız, bare prefix) → false", () => {
    expect(hasLocaleRoute("/kiralik-villa/")).toBe(false);
  });

  it("7) '/kiralik-villa' (trailing slash yok, slug yok) → false", () => {
    expect(hasLocaleRoute("/kiralik-villa")).toBe(false);
  });

  it("8) '/teklif-al' → false (locale karşılığı yok)", () => {
    expect(hasLocaleRoute("/teklif-al")).toBe(false);
  });

  it("9) '/blog' → false", () => {
    expect(hasLocaleRoute("/blog")).toBe(false);
  });

  it("10) '/favoriler' → false", () => {
    expect(hasLocaleRoute("/favoriler")).toBe(false);
  });

  it("11) '/iletisim' → false", () => {
    expect(hasLocaleRoute("/iletisim")).toBe(false);
  });

  it("12) '/liste' → false", () => {
    expect(hasLocaleRoute("/liste")).toBe(false);
  });

  it("13) '/rezervasyon-kontrol' → false (prefix eşleşmesi YANLIŞLIKLA olmaz)", () => {
    expect(hasLocaleRoute("/rezervasyon-kontrol")).toBe(false);
  });

  it("14) '/v/abc123' → false", () => {
    expect(hasLocaleRoute("/v/abc123")).toBe(false);
  });

  it("15) '/p/some-slug' → false", () => {
    expect(hasLocaleRoute("/p/some-slug")).toBe(false);
  });

  it("16) '/kisa-sureli-tarihler' → false", () => {
    expect(hasLocaleRoute("/kisa-sureli-tarihler")).toBe(false);
  });
});

describe("getLocaleSwitchTargets", () => {
  it("1) '/' → tr:'/', en:'/en', de:'/de'", () => {
    expect(getLocaleSwitchTargets("/")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("2) null pathname → '/' ile aynı davranır", () => {
    expect(getLocaleSwitchTargets(null)).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("3) undefined pathname → '/' ile aynı davranır", () => {
    expect(getLocaleSwitchTargets(undefined)).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("4) '/en' (EN ana sayfa) → tr:'/', en:'/en', de:'/de'", () => {
    expect(getLocaleSwitchTargets("/en")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("5) '/de' (DE ana sayfa) → tr:'/', en:'/en', de:'/de'", () => {
    expect(getLocaleSwitchTargets("/de")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("6) '/kiralik-villalar' → 3 locale varyantı (gerçek route)", () => {
    expect(getLocaleSwitchTargets("/kiralik-villalar")).toEqual({
      tr: "/kiralik-villalar",
      en: "/en/kiralik-villalar",
      de: "/de/kiralik-villalar",
    });
  });

  it("7) '/kiralik-villa/test-villa' → 3 locale varyantı", () => {
    expect(getLocaleSwitchTargets("/kiralik-villa/test-villa")).toEqual({
      tr: "/kiralik-villa/test-villa",
      en: "/en/kiralik-villa/test-villa",
      de: "/de/kiralik-villa/test-villa",
    });
  });

  it("8) '/en/kiralik-villa/test-villa' (zaten EN prefixli) → aynı 3 varyant", () => {
    expect(getLocaleSwitchTargets("/en/kiralik-villa/test-villa")).toEqual({
      tr: "/kiralik-villa/test-villa",
      en: "/en/kiralik-villa/test-villa",
      de: "/de/kiralik-villa/test-villa",
    });
  });

  it("9) '/de/kiralik-villa/test-villa' (zaten DE prefixli) → aynı 3 varyant", () => {
    expect(getLocaleSwitchTargets("/de/kiralik-villa/test-villa")).toEqual({
      tr: "/kiralik-villa/test-villa",
      en: "/en/kiralik-villa/test-villa",
      de: "/de/kiralik-villa/test-villa",
    });
  });

  it("10) '/rezervasyon/test-villa' → 3 locale varyantı", () => {
    expect(getLocaleSwitchTargets("/rezervasyon/test-villa")).toEqual({
      tr: "/rezervasyon/test-villa",
      en: "/en/rezervasyon/test-villa",
      de: "/de/rezervasyon/test-villa",
    });
  });

  it("11) '/teklif-al' (locale karşılığı yok) → fallback: tr:'/', en:'/en', de:'/de'", () => {
    expect(getLocaleSwitchTargets("/teklif-al")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("12) '/en/teklif-al' → fallback (kullanıcı örneği: TR seçilince '/' döner)", () => {
    const targets = getLocaleSwitchTargets("/en/teklif-al");
    expect(targets.tr).toBe("/");
    expect(targets.en).toBe("/en");
    expect(targets.de).toBe("/de");
  });

  it("13) '/de/blog' → fallback (kullanıcı örneği: EN seçilince '/en' döner)", () => {
    const targets = getLocaleSwitchTargets("/de/blog");
    expect(targets.en).toBe("/en");
  });

  it("14) '/rezervasyon-kontrol' → fallback (prefix ile YANLIŞLIKLA eşleşmez)", () => {
    expect(getLocaleSwitchTargets("/rezervasyon-kontrol")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("15) '/favoriler' → fallback", () => {
    expect(getLocaleSwitchTargets("/favoriler")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });

  it("16) '/v/abc123' → fallback", () => {
    expect(getLocaleSwitchTargets("/v/abc123")).toEqual({
      tr: "/",
      en: "/en",
      de: "/de",
    });
  });
});
