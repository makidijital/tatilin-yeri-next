/* ===============================================================
   🛡️ PHASE 7C — EN/DE VILLA DETAIL generateMetadata: CANONICAL + HREFLANG
   ===============================================================
   Hedef:
     app/(public)/en/kiralik-villa/[slug]/page.tsx > generateMetadata
     app/(public)/de/kiralik-villa/[slug]/page.tsx > generateMetadata

   Mock seviyesi Phase 6B/locale-routes.test.tsx ile AYNI desen:
   `@/lib/i18n/public-locale-gate.server`, `@/app/services/villa.service`,
   `@/lib/i18n/get-villa-translation.server`, `@/lib/cache.helpers`
   mock'lanır (hiçbiri bu fazda GERÇEKTEN değiştirilmedi). `buildLocaleAlternates`
   (Phase 7B) mock'lanmıyor — gerçek implementasyonuyla çalışıyor.

   GERÇEK DB'YE HİÇ DOKUNULMAZ.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";

const requirePublicLocaleEnabledMock = vi.fn();
const getVillaBySlugMock = vi.fn();
const getVillaTranslatedTitleMock = vi.fn();
const getCachedSettingsMock = vi.fn();

vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));
vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...args: unknown[]) => getVillaBySlugMock(...args),
}));
vi.mock("@/lib/i18n/get-villa-translation.server", () => ({
  getVillaTranslatedTitle: (...args: unknown[]) =>
    getVillaTranslatedTitleMock(...args),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: (...args: unknown[]) => getCachedSettingsMock(...args),
}));

beforeEach(() => {
  requirePublicLocaleEnabledMock.mockReset();
  requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
  getVillaBySlugMock.mockReset();
  getVillaTranslatedTitleMock.mockReset();
  getCachedSettingsMock.mockReset();
});

const BASE_VILLA = {
  id: "villa-uuid-1",
  slug: "villa-in-love",
  title: "Villa Aşkım",
};

const ROUTES: Array<{
  modulePath: string;
  locale: "en" | "de";
  translatedTitle: string;
  notFoundTitle: string;
}> = [
  {
    modulePath: "@/app/(public)/en/kiralik-villa/[slug]/page",
    locale: "en",
    translatedTitle: "Villa In Love",
    notFoundTitle: "Villa not found",
  },
  {
    modulePath: "@/app/(public)/de/kiralik-villa/[slug]/page",
    locale: "de",
    translatedTitle: "Villa Verliebt",
    notFoundTitle: "Villa nicht gefunden",
  },
];

async function callGenerateMetadata(modulePath: string, slug = "villa-in-love") {
  const mod = await import(/* @vite-ignore */ modulePath);
  return mod.generateMetadata({ params: Promise.resolve({ slug }) });
}

describe.each(ROUTES)(
  "$modulePath generateMetadata — Phase 7C canonical/hreflang",
  ({ modulePath, locale, translatedTitle, notFoundTitle }) => {
    /* --- 2/3) EN/DE locale canonical --- */
    it(`canonical '/${locale}/kiralik-villa/{slug}' formatındadır`, async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.alternates?.canonical).toBe(
        `/${locale}/kiralik-villa/villa-in-love`
      );
    });

    /* --- 4) multilingual_enabled=true iken dört hreflang key'i --- */
    it("multilingual_enabled=true iken languages tr/en/de/x-default TAMAMI mevcut", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      const languages = result.alternates?.languages as
        | Record<string, unknown>
        | undefined;
      expect(languages?.tr).toBe("/kiralik-villa/villa-in-love");
      expect(languages?.en).toBe("/en/kiralik-villa/villa-in-love");
      expect(languages?.de).toBe("/de/kiralik-villa/villa-in-love");
      expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
    });

    /* --- 5) x-default TR --- */
    it("x-default HER ZAMAN TR path'tir", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      const languages = result.alternates?.languages as
        | Record<string, unknown>
        | undefined;
      expect(languages?.["x-default"]).toBe("/kiralik-villa/villa-in-love");
    });

    /* --- 6) multilingual_enabled=false iken EN/DE hreflang'ların
       YANLIŞLIKLA 404 URL olarak üretilmemesi --- */
    it("multilingual_enabled=false iken `languages` key'i HİÇ YOK", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.alternates).toEqual({
        canonical: `/${locale}/kiralik-villa/villa-in-love`,
      });
      expect(
        (result.alternates as Record<string, unknown>).languages
      ).toBeUndefined();
    });

    /* --- 7) mevcut robots/noindex davranışının korunması (BU FAZDA
       DEĞİŞMEDİ — flag true olsa BİLE hâlâ noindex) --- */
    it("robots HER ZAMAN {index:false,follow:false} — multilingual_enabled=false iken", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.robots).toEqual({ index: false, follow: false });
    });

    it("robots HER ZAMAN {index:false,follow:false} — multilingual_enabled=true İKEN DE (bu faz robots'u değiştirmiyor)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.robots).toEqual({ index: false, follow: false });
    });

    it("villa bulunamazsa (null) → notFound title + noindex, alternates YOK", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: true });
      getVillaBySlugMock.mockResolvedValue(null);

      const result = await callGenerateMetadata(modulePath, "olmayan-slug");
      expect(result.title).toBe(notFoundTitle);
      expect(result.robots).toEqual({ index: false, follow: false });
      expect(result.alternates).toBeUndefined();
    });

    /* --- Title: mevcut Phase 6B translation helper'ı kullanılıyor --- */
    it("title getVillaTranslatedTitle'dan gelir (doğru villaId + locale ile çağrılır)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.title).toBe(translatedTitle);
      expect(getVillaTranslatedTitleMock).toHaveBeenCalledWith(
        BASE_VILLA.id,
        BASE_VILLA.title,
        locale
      );
    });

    /* --- description bu fazda EKLENMEDİ --- */
    it("description metadata'da SET EDİLMEZ (root layout'tan miras — Phase 7C §7 kapsam dışı)", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.description).toBeUndefined();
    });

    it("openGraph.url canonical ile AYNI", async () => {
      getCachedSettingsMock.mockResolvedValue({ multilingual_enabled: false });
      getVillaBySlugMock.mockResolvedValue(BASE_VILLA);
      getVillaTranslatedTitleMock.mockResolvedValue(translatedTitle);

      const result = await callGenerateMetadata(modulePath);
      expect(result.openGraph?.url).toBe(result.alternates?.canonical);
    });
  }
);
