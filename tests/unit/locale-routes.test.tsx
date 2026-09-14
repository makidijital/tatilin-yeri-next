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

vi.mock("@/lib/i18n/public-locale-gate.server", () => ({
  requirePublicLocaleEnabled: () => requirePublicLocaleEnabledMock(),
}));

beforeEach(() => {
  requirePublicLocaleEnabledMock.mockReset();
});

/* [modül yolu, beklenen locale] — 8 yeni route. */
const ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/kiralik-villalar/page", "en"],
  ["@/app/(public)/de/kiralik-villalar/page", "de"],
  ["@/app/(public)/en/arama/page", "en"],
  ["@/app/(public)/de/arama/page", "de"],
  ["@/app/(public)/en/kiralik-villa/[slug]/page", "en"],
  ["@/app/(public)/de/kiralik-villa/[slug]/page", "de"],
  ["@/app/(public)/en/rezervasyon/[slug]/page", "en"],
  ["@/app/(public)/de/rezervasyon/[slug]/page", "de"],
];

describe.each(ROUTES)("%s", (modulePath, locale) => {
  it(`gate geçtiğinde (multilingual_enabled=true) locale="${locale}" ile render eder`, async () => {
    requirePublicLocaleEnabledMock.mockResolvedValue(undefined);

    const { default: Page } = await import(modulePath);
    const element = await Page();
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

    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
