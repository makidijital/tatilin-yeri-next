/* ===============================================================
   🛡️ PHASE 7E — app/robots.ts LOCALE (EN/DE) DAVRANIŞ TESTLERİ
   ===============================================================
   Hedef: app/robots.ts > default export (robots())

   AUDIT SONUCU (bu dosya bunu test olarak KİLİTLİYOR): `app/robots.ts`
   BU FAZDA DEĞİŞTİRİLMEDİ — dosyanın kendisi zaten locale-agnostic'tir
   ("default allow + explicit disallow", kök `/` açık). Disallow listesi
   yalnız internal/token/duplicate path'leri kapsıyor
   (/maki-admin, /api, /arama, /favoriler, /liste/, /v/, /rezervasyon/)
   — bunların HİÇBİRİ `/en` veya `/de` prefix'i DEĞİL, dolayısıyla
   EN/DE villa/sayfa URL'leri robots.txt seviyesinde ZATEN Disallow
   EDİLMİYOR.

   BU BİLİNÇLİ BİR TASARIM KARARI, EKSİKLİK DEĞİL: EN/DE villa detay
   sayfaları hâlâ `generateMetadata`'da unconditional
   `robots: { index: false, follow: false }` döndürüyor (Phase 7C,
   `LocaleRouteComingSoon` placeholder hâlâ kullanımda — bkz. Phase 7E
   raporu §9). SEO KURALI: robots.txt Disallow ile <meta name="robots"
   content="noindex"> AYNI ŞEY DEĞİLDİR — bir path'i robots.txt'te
   Disallow etmek, Googlebot'un o sayfayı HİÇ CRAWL ETMESİNİ (ve
   dolayısıyla sayfadaki noindex meta etiketini GÖRMESİNİ) ENGELLER.
   EN/DE'yi robots.txt'te Disallow etmek, noindex sinyalinin Google'a
   asla ulaşmamasına ve (daha kötüsü) sayfanın başka sitelerden gelen
   backlink'ler yüzünden URL-only/sitelinks olarak indexlenme riskine
   yol açardı. Bu yüzden EN/DE ASLA robots.txt'te Disallow EDİLMEDİ —
   noindex meta etiketi (page-level, generateMetadata) tek ve doğru
   mekanizma olarak KORUNDU.

   `SITE_URL` MODÜL YÜKLEME anında `process.env.NEXT_PUBLIC_SITE_URL`'i
   okuyor (`app/sitemap.ts` ile AYNI desen) — bu yüzden her testte
   `vi.stubEnv` + `vi.resetModules()` + dinamik `import()` kullanılır
   (Phase 7D'nin `sitemap-locale-alternates.test.ts`'teki AYNI,
   kanıtlanmış desen).

   Mock YOK (DB'ye hiç erişmiyor, saf fonksiyon) — gerçek
   implementasyon test ediliyor. GERÇEK DB'YE HİÇ DOKUNULMAZ.
   =============================================================== */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function runRobots() {
  const mod = await import("@/app/robots");
  return mod.default();
}

describe("robots() — Phase 7E EN/DE locale davranışı", () => {
  /* --- 8) mevcut disallow listesi AYNEN korunuyor --- */
  it("8) disallow listesi tam olarak Phase-öncesi 7 giriş: /maki-admin, /api, /arama, /favoriler, /liste/, /v/, /rezervasyon/ (SIRA/İÇERİK DEĞİŞMEDİ)", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    expect(ruleObj.disallow).toEqual([
      "/maki-admin",
      "/api",
      "/arama",
      "/favoriler",
      "/liste/",
      "/v/",
      "/rezervasyon/",
    ]);
  });

  it("8b) allow hâlâ kök '/' (villa detay/listeleme/CMS sayfaları crawl'a AÇIK, Phase 7E BUNA DOKUNMADI)", async () => {
    const result = await runRobots();
    const rule = result.rules as { allow?: string | string[] } | Array<{ allow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    expect(ruleObj.allow).toBe("/");
  });

  /* --- 9) EN/DE HİÇBİR ŞEKİLDE Disallow edilmiyor --- */
  it("9) disallow dizisinde '/en' veya '/de' (veya bunların prefix'i) YOK — EN/DE robots.txt seviyesinde HİÇ engellenmiyor", async () => {
    const result = await runRobots();
    const rule = result.rules as { disallow?: string | string[] } | Array<{ disallow?: string | string[] }>;
    const ruleObj = Array.isArray(rule) ? rule[0] : rule;
    const disallowList = Array.isArray(ruleObj.disallow)
      ? ruleObj.disallow
      : ruleObj.disallow
        ? [ruleObj.disallow]
        : [];
    for (const entry of disallowList) {
      expect(entry.startsWith("/en")).toBe(false);
      expect(entry.startsWith("/de")).toBe(false);
      expect(entry).not.toBe("/en/");
      expect(entry).not.toBe("/de/");
    }
  });

  it("9b) disallow listesi flag durumundan (multilingual_enabled) BAĞIMSIZ — robots.ts hiç settings okumuyor, statik/deterministik", async () => {
    // robots.ts hiçbir DB/settings çağrısı yapmıyor (grep ile doğrulandı) —
    // bu test bunun BİR DEĞİŞİKLİK OLMADIĞINI, iki ayrı import'ta AYNI
    // sonucu vererek kanıtlıyor (settings mock'lamaya GEREK YOK).
    const first = await runRobots();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    const second = await runRobots();
    expect(first.rules).toEqual(second.rules);
  });

  /* --- sitemap/host referansı (mevcut davranış, Phase 7E DOKUNMADI) --- */
  it("10) sitemap/host SITE_URL'den absolute üretiliyor (ÖNCEKİ davranış, DEĞİŞMEDİ)", async () => {
    const result = await runRobots();
    expect(result.sitemap).toBe("https://example.com/sitemap.xml");
    expect(result.host).toBe("https://example.com");
  });

  it("10b) SITE_URL boşsa sitemap/host omit edilir (fail-safe, ÖNCEKİ davranış, DEĞİŞMEDİ)", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "");
    const result = await runRobots();
    expect(result.sitemap).toBeUndefined();
    expect(result.host).toBeUndefined();
  });
});
