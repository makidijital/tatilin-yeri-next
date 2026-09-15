/* ===============================================================
   🛡️ PHASE 4A — PUBLIC LOCALE ROUTING CORE: ROUTE WIRING TESTS
   ===============================================================
   Bu proje Next.js App Router'ı gerçek bir server ile test etmiyor
   (bkz. mevcut *OrchestrationContract.test.ts deseni — gerçek
   route/DB yerine call-sequence + mock doğrulanıyor). Aynı ruhla:
   her yeni /en/* ve /de/* page.tsx'in

     1) requirePublicLocaleEnabled() gate'ini GERÇEKTEN çağırdığını
        (bypass edilmediğini),
     2) gate geçtiğinde (multilingual_enabled=true senaryosu) doğru
        locale ile LocaleRouteComingSoon render ettiğini,
     3) gate notFound() fırlattığında (multilingual_enabled=false —
        bugünkü production) sayfanın hiçbir ek içerik üretmeden aynı
        şekilde fırlattığını (yutmadığını)

   statik olarak doğrular. Gerçek Next.js route resolution (/en/...
   URL'inin doğru dosyaya eşlenmesi) bu ortamda test edilemez — o
   yalnız `next build`/manuel doğrulama ile teyit edilebilir (bkz.
   nihai rapor).

   Mevcut price-engine / discount / pool-heating / reservation / TR
   route testlerine HİÇ dokunulmadı.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const requirePublicLocaleEnabledMock = vi.fn();
const getVillaBySlugMock = vi.fn();
const getVillaTranslatedTitleMock = vi.fn();

vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));

/* 🛡️ PHASE 6B — yalnız /en, /de kiralik-villa/[slug] artık villa okuyup
   title çeviriyor. Bu dosyanın amacı routing/gate testi (bkz. üstyazı);
   title-çözümleme mantığının KENDİSİ zaten
   tests/unit/get-villa-translation.test.ts'te ayrıntılı test ediliyor —
   burada yalnız gerçek DB'ye gidilmesin diye mock'lanıyor. */
vi.mock("@/app/services/villa.service", () => ({
  getVillaBySlug: (...args: unknown[]) => getVillaBySlugMock(...args),
}));
vi.mock("@/lib/i18n/get-villa-translation.server", () => ({
  getVillaTranslatedTitle: (...args: unknown[]) =>
    getVillaTranslatedTitleMock(...args),
}));

beforeEach(() => {
  requirePublicLocaleEnabledMock.mockReset();
  getVillaBySlugMock.mockReset();
  getVillaTranslatedTitleMock.mockReset();
  getVillaBySlugMock.mockResolvedValue({
    id: "test-villa-id",
    slug: "test-villa",
    title: "Test Villa Title",
  });
  /* Echo: gerçek fallback/çeviri mantığı burada test edilmiyor
     (bkz. get-villa-translation.test.ts). */
  getVillaTranslatedTitleMock.mockImplementation(
    (_villaId: string, originalTitle: string) =>
      Promise.resolve(originalTitle)
  );
});

/* 🛡️ PHASE 6B — kiralik-villa/[slug] route'ları artık `params` (slug)
   okuyor; testte sabit bir slug ile Promise geçiriyoruz. Diğer 6 route
   hâlâ hiç prop almıyor (PHASE 4A ile birebir). */
const VILLA_PAGE_PROPS = { params: Promise.resolve({ slug: "test-villa" }) };

/* [modül yolu, beklenen locale, page prop'ları] — 8 route. */
const ROUTES: Array<
  [string, "en" | "de", Record<string, unknown> | undefined]
> = [
  ["@/app/(public)/en/kiralik-villalar/page", "en", undefined],
  ["@/app/(public)/de/kiralik-villalar/page", "de", undefined],
  ["@/app/(public)/en/arama/page", "en", undefined],
  ["@/app/(public)/de/arama/page", "de", undefined],
  ["@/app/(public)/en/kiralik-villa/[slug]/page", "en", VILLA_PAGE_PROPS],
  ["@/app/(public)/de/kiralik-villa/[slug]/page", "de", VILLA_PAGE_PROPS],
  ["@/app/(public)/en/rezervasyon/[slug]/page", "en", undefined],
  ["@/app/(public)/de/rezervasyon/[slug]/page", "de", undefined],
];

describe.each(ROUTES)("%s", (modulePath, locale, pageProps) => {
  it(`gate geçtiğinde (multilingual_enabled=true) locale="${locale}" ile render eder`, async () => {
    requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

    const { default: Page } = await import(modulePath);
    const element = await Page(pageProps);
    render(element);

    expect(requirePublicLocaleEnabledMock).toHaveBeenCalledTimes(1);
    expect(
      locale === "en"
        ? screen.getByText(/this page isn't translated yet/i)
        : screen.getByText(/diese seite ist noch nicht übersetzt/i)
    ).toBeInTheDocument();
  });

  it("gate notFound() fırlattığında sayfa bunu YUTMAZ (aynen propagate eder)", async () => {
    requirePublicLocaleEnabledMock.mockRejectedValue(
      new Error("NEXT_NOT_FOUND")
    );

    const { default: Page } = await import(modulePath);

    await expect(Page(pageProps)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
