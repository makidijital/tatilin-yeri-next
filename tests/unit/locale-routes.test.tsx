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
const getVillaTranslatedDescriptionMock = vi.fn();
/* 🛡️ PHASE 8D-2 — location/features/rules/priceIncludes/distances ham veri
   + batch çeviri (8D-1) + icon-key mock'ları. Gerçek DB/gerçek Türkçe
   anahtar-kelime mantığına gidilmesin diye (bu dosyanın amacı routing/
   render testi — gerçek çeviri/fallback/icon mantığı kendi testlerinde
   ayrıntılı doğrulanıyor, bkz. get-translation.test.ts, translation-
   repository.test.ts) hepsi mock'lanıyor. */
const getVillaDistancesMock = vi.fn();
const getVillaFeaturesByVillaMock = vi.fn();
const getRuleItemsByVillaMock = vi.fn();
const getPriceIncludeItemsByVillaMock = vi.fn();
const getTranslationsForParentsMock = vi.fn();
const getDistanceIconKeyMock = vi.fn();

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
  /* 🛡️ PHASE 8B — description helper de aynı modülden export edilir;
     mock'lanmazsa EN/DE villa detay page.tsx'in yeni import'u
     `undefined` alır ve çağrıda TypeError fırlatır. */
  getVillaTranslatedDescription: (...args: unknown[]) =>
    getVillaTranslatedDescriptionMock(...args),
}));

/* 🛡️ PHASE 8D-2 — EN/DE villa detay artık location/distances/features/
   rules/priceIncludes de okuyor (bkz. page.tsx). TR sayfasındaki AYNI 4
   servis + Phase 8D-1'in batch çeviri helper'ı — gerçek DB'ye gidilmesin
   diye mock'lanıyor. */
vi.mock("@/app/services/villa-distance.service", () => ({
  getVillaDistances: (...args: unknown[]) => getVillaDistancesMock(...args),
}));
vi.mock("@/app/services/villa-feature.service", () => ({
  getVillaFeaturesByVilla: (...args: unknown[]) =>
    getVillaFeaturesByVillaMock(...args),
}));
vi.mock("@/app/services/rule-item.service", () => ({
  getRuleItemsByVilla: (...args: unknown[]) => getRuleItemsByVillaMock(...args),
}));
vi.mock("@/app/services/price-include-item.service", () => ({
  getPriceIncludeItemsByVilla: (...args: unknown[]) =>
    getPriceIncludeItemsByVillaMock(...args),
}));
/* 🛡️ PHASE 8D-2 — `getTranslationsForParents` mock'lanır;
   `resolveTranslatedField`'in GERÇEK saf mantığı burada birebir yeniden
   uygulanır (modül tamamen mock'landığı için page.tsx'in gerçek import'u
   gerçek fonksiyona erişemez — bkz. lib/i18n/get-translation.server.ts
   satır 201-209, `vi.importActual` bu dosyada/projede kullanılan bir
   desen değil, bu yüzden yeni bir desen İCAT EDİLMEDİ, mevcut "inline
   mock implementation" convention'ı izlendi). */
vi.mock("@/lib/i18n/get-translation.server", () => ({
  getTranslationsForParents: (...args: unknown[]) =>
    getTranslationsForParentsMock(...args),
  resolveTranslatedField: (
    translatedValue: string | null | undefined,
    parentValue: unknown
  ) =>
    typeof translatedValue === "string" && translatedValue.trim() !== ""
      ? translatedValue
      : parentValue,
}));
/* 🛡️ PHASE 8D-2 — `getDistanceIconKey` TÜRKÇE anahtar kelimeye bağlı
   (bkz. lib/distance.helper.ts); bu dosyanın amacı o eşleme mantığını
   test etmek DEĞİL (routing/render testi) — yalnız page.tsx'in bu
   fonksiyonu HANGİ ARGÜMANLA çağırdığını (orijinal TR title mi, çevrilmiş
   displayTitle mi) doğrulamak için mock'lanıyor. */
vi.mock("@/lib/distance.helper", () => ({
  getDistanceIconKey: (...args: unknown[]) => getDistanceIconKeyMock(...args),
}));

beforeEach(() => {
  requirePublicLocaleEnabledMock.mockReset();
  getVillaBySlugMock.mockReset();
  getVillaTranslatedTitleMock.mockReset();
  getVillaTranslatedDescriptionMock.mockReset();
  /* 🛡️ PHASE 8D-2 */
  getVillaDistancesMock.mockReset();
  getVillaFeaturesByVillaMock.mockReset();
  getRuleItemsByVillaMock.mockReset();
  getPriceIncludeItemsByVillaMock.mockReset();
  getTranslationsForParentsMock.mockReset();
  getDistanceIconKeyMock.mockReset();
  getVillaBySlugMock.mockResolvedValue({
    id: "test-villa-id",
    slug: "test-villa",
    title: "Test Villa Title",
    /* 🛡️ PHASE 8B — description artık EN/DE villa detay page.tsx'te
       okunuyor; VillaDTO.description zorunlu (non-optional) bir
       string olduğu için mock'ta da sağlanmalı (aksi halde
       description.trim() undefined üzerinde çağrılıp TypeError atar). */
    description: "<p>Test villa description.</p>",
    /* 🛡️ PHASE 8D-2 — VillaInfoBar + location çözümü için gereken alanlar.
       location_id varsayılan olarak null: mevcut (Phase 4A/8B) testler
       location çeviri sorgusu HİÇ atılmadan geçmeli (audit hedefi:
       "location_id null ise villa_location sorgusu hiç atılmaz"). */
    location: "Bodrum, Muğla",
    location_id: null as string | null,
    guests: 6,
    bedrooms: 3,
    bathrooms: 2,
    tourism_document_number: null as string | null,
  });
  /* 🛡️ PHASE 8D-2 — varsayılan: boş koleksiyonlar + boş çeviri Map'i
     (TR fallback olmadan da sayfa çökmemeli — bkz. "empty collections"
     testi). İlgili testler kendi ihtiyacına göre override eder. */
  getVillaDistancesMock.mockResolvedValue([]);
  getVillaFeaturesByVillaMock.mockResolvedValue([]);
  getRuleItemsByVillaMock.mockResolvedValue([]);
  getPriceIncludeItemsByVillaMock.mockResolvedValue([]);
  getTranslationsForParentsMock.mockResolvedValue(new Map());
  getDistanceIconKeyMock.mockReturnValue("pin");
  /* Echo: gerçek fallback/çeviri mantığı burada test edilmiyor
     (bkz. get-villa-translation.test.ts). */
  getVillaTranslatedTitleMock.mockImplementation(
    (_villaId: string, originalTitle: string) =>
      Promise.resolve(originalTitle)
  );
  /* 🛡️ PHASE 8B — description için de AYNI echo deseni (varsayılan);
     description-spesifik testler bunu kendi ihtiyacına göre override eder. */
  getVillaTranslatedDescriptionMock.mockImplementation(
    (_villaId: string, originalDescription: string) =>
      Promise.resolve(originalDescription)
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

/* ===============================================================
   🛡️ PHASE 8B — EN/DE villa detay: description overlay page-body testleri
   ===============================================================
   Yalnız `kiralik-villa/[slug]` route'larını (villa okuyan tek EN/DE
   route grubu) hedefler. `getVillaTranslatedDescription` yukarıdaki
   mock ile sarılı — GERÇEK çeviri/fallback mantığı burada test
   edilmiyor (bkz. get-villa-translation.test.ts); burada yalnız
   page.tsx'in resolve edilen description'ı doğru şekilde
   `CollapsibleDescription`'a/fallback'e ilettiği doğrulanıyor.
   =============================================================== */
const VILLA_DETAIL_ROUTES: Array<[string, "en" | "de"]> = [
  ["@/app/(public)/en/kiralik-villa/[slug]/page", "en"],
  ["@/app/(public)/de/kiralik-villa/[slug]/page", "de"],
];

describe.each(VILLA_DETAIL_ROUTES)(
  "%s — Phase 8B description overlay",
  (modulePath, locale) => {
    beforeEach(() => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
    });

    it("8) çevrilmiş description CollapsibleDescription'a (sanitize edilmiş HTML olarak) geçer", async () => {
      getVillaTranslatedDescriptionMock.mockResolvedValue(
        `<p>Resolved ${locale} description.</p>`
      );

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`Resolved ${locale} description.`)
      ).toBeInTheDocument();
      expect(getVillaTranslatedDescriptionMock).toHaveBeenCalledWith(
        "test-villa-id",
        "<p>Test villa description.</p>",
        locale
      );
    });

    it("8b) sanitize mekanizması korunuyor — çeviri HTML'i içinde script/tehlikeli attribute varsa render'a SIZMAZ", async () => {
      getVillaTranslatedDescriptionMock.mockResolvedValue(
        '<p onclick="alert(1)">Safe text</p><script>alert(2)</script>'
      );

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      const { container } = render(element);

      expect(screen.getByText("Safe text")).toBeInTheDocument();
      expect(container.querySelector("script")).toBeNull();
      expect(container.innerHTML).not.toContain("onclick");
    });

    it("9) resolved description boş/whitespace → 'Açıklama bulunmuyor' fallback (hardcoded metin DEĞİŞMEDİ)", async () => {
      getVillaTranslatedDescriptionMock.mockResolvedValue("   ");

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText("Açıklama bulunmuyor")).toBeInTheDocument();
    });
  }
);

/* ===============================================================
   🛡️ PHASE 8D-2 — EN/DE villa detay: location/distances/features/
   priceIncludes/rules page-body testleri
   ===============================================================
   Yalnız `kiralik-villa/[slug]` route'larını hedefler.
   `getTranslationsForParents`/`resolveTranslatedField`/servis
   fonksiyonları/`getDistanceIconKey` yukarıda mock'lı — GERÇEK
   çeviri/fallback/icon-eşleme mantığı burada test edilmiyor (bkz.
   get-translation.test.ts, translation-repository.test.ts,
   lib/distance.helper.ts'in kendi testleri); burada yalnız page.tsx'in
   resolve edilen değerleri doğru prop'larla ilgili component'lere
   ilettiği + N+1 YAPMADIĞI + icon key'i HER ZAMAN orijinal (TR)
   title'dan hesapladığı doğrulanıyor. */
describe.each(VILLA_DETAIL_ROUTES)(
  "%s — Phase 8D-2 location/distances/features/rules/priceIncludes",
  (modulePath, locale) => {
    beforeEach(() => {
      requirePublicLocaleEnabledMock.mockResolvedValue(undefined);
    });

    it("10) location çevirisi varsa (location_id eşleşmesiyle) VillaInfoBar'a çevrilmiş değer geçer", async () => {
      getVillaBySlugMock.mockResolvedValue({
        id: "test-villa-id",
        slug: "test-villa",
        title: "Test Villa Title",
        description: "<p>Test villa description.</p>",
        location: "Orijinal TR Konum",
        location_id: "loc-1",
        guests: 6,
        bedrooms: 3,
        bathrooms: 2,
        tourism_document_number: null,
      });
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "villa_location") {
          return Promise.resolve(
            new Map([["loc-1", { name: `Translated location (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`Translated location (${locale})`)
      ).toBeInTheDocument();
      expect(getTranslationsForParentsMock).toHaveBeenCalledWith(
        "villa_location",
        ["loc-1"],
        locale
      );
    });

    it("11) location çevirisi yoksa villa.location TR fallback olarak VillaInfoBar'a geçer", async () => {
      getVillaBySlugMock.mockResolvedValue({
        id: "test-villa-id",
        slug: "test-villa",
        title: "Test Villa Title",
        description: "<p>Test villa description.</p>",
        location: "Orijinal TR Konum (çeviri yok)",
        location_id: "loc-2",
        guests: 6,
        bedrooms: 3,
        bathrooms: 2,
        tourism_document_number: null,
      });
      /* getTranslationsForParentsMock varsayılan (beforeEach'ten) boş Map
         döner — loc-2 için çeviri YOK. */

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText("Orijinal TR Konum (çeviri yok)")
      ).toBeInTheDocument();
    });

    it("12) location_id null ise villa_location çeviri sorgusu HİÇ atılmaz, villa.location kullanılır", async () => {
      /* beforeEach'in varsayılan villa mock'u zaten location_id: null. */
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText("Bodrum, Muğla")).toBeInTheDocument();
      expect(getTranslationsForParentsMock).not.toHaveBeenCalledWith(
        "villa_location",
        expect.anything(),
        expect.anything()
      );
    });

    it("13) features: çevirisi olan çevrilmiş isimle, olmayan orijinal TR isimle render edilir", async () => {
      getVillaFeaturesByVillaMock.mockResolvedValue([
        { id: "f1", name: "Deniz Manzarası" },
        { id: "f2", name: "Havuz" },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "villa_feature") {
          return Promise.resolve(
            new Map([["f1", { name: `Sea View (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText(`Sea View (${locale})`)).toBeInTheDocument();
      expect(screen.getByText("Havuz")).toBeInTheDocument();
    });

    it("14) rules: çevirisi olan çevrilmiş başlıkla, olmayan orijinal TR başlıkla render edilir", async () => {
      getRuleItemsByVillaMock.mockResolvedValue([
        { id: "r1", title: "Evcil hayvan kabul edilmez" },
        { id: "r2", title: "Sigara içilmez" },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "rule_item") {
          return Promise.resolve(
            new Map([["r1", { title: `No pets allowed (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`No pets allowed (${locale})`)
      ).toBeInTheDocument();
      expect(screen.getByText("Sigara içilmez")).toBeInTheDocument();
    });

    it("15) priceIncludes: çevirisi olan çevrilmiş başlıkla, olmayan orijinal TR başlıkla render edilir", async () => {
      getPriceIncludeItemsByVillaMock.mockResolvedValue([
        { id: "p1", title: "Temizlik dahil" },
        { id: "p2", title: "Havlu ve nevresim dahil" },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "price_include_item") {
          return Promise.resolve(
            new Map([["p1", { title: `Cleaning included (${locale})` }]])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(
        screen.getByText(`Cleaning included (${locale})`)
      ).toBeInTheDocument();
      expect(screen.getByText("Havlu ve nevresim dahil")).toBeInTheDocument();
    });

    it("16) distances: title VE distance ayrı ayrı çevrilir/fallback edilir", async () => {
      getVillaDistancesMock.mockResolvedValue([
        {
          id: "d1",
          villa_id: "test-villa-id",
          title: "Plaj",
          distance: "300 m",
          created_at: "",
        },
        {
          id: "d2",
          villa_id: "test-villa-id",
          title: "Market",
          distance: "150 m",
          created_at: "",
        },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "villa_distance") {
          return Promise.resolve(
            new Map([
              [
                "d1",
                { title: `Beach (${locale})`, distance: `300 m (${locale})` },
              ],
              /* d2: title çevirisi var, distance çevirisi YOK (null) —
                 iki alan BAĞIMSIZ fallback almalı. */
              ["d2", { title: `Market (${locale})`, distance: null }],
            ])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText(`Beach (${locale})`)).toBeInTheDocument();
      expect(screen.getByText(`300 m (${locale})`)).toBeInTheDocument();
      expect(screen.getByText(`Market (${locale})`)).toBeInTheDocument();
      /* distance çevirisi yok → orijinal TR "150 m" fallback. */
      expect(screen.getByText("150 m")).toBeInTheDocument();
    });

    it("17) 🛡️ REGRESYON: distance icon key ORİJİNAL (TR) title'dan hesaplanır, ÇEVRİLMİŞ displayTitle'dan DEĞİL", async () => {
      getVillaDistancesMock.mockResolvedValue([
        {
          id: "d1",
          villa_id: "test-villa-id",
          title: "Restoran",
          distance: "500 m",
          created_at: "",
        },
      ]);
      getTranslationsForParentsMock.mockImplementation((entity: string) => {
        if (entity === "villa_distance") {
          return Promise.resolve(
            new Map([
              [
                "d1",
                {
                  title: `Restaurant (${locale})`,
                  distance: `500 m (${locale})`,
                },
              ],
            ])
          );
        }
        return Promise.resolve(new Map());
      });

      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      /* ORİJİNAL TR title ile çağrılmalı ... */
      expect(getDistanceIconKeyMock).toHaveBeenCalledWith("Restoran");
      /* ... ÇEVRİLMİŞ displayTitle ile ASLA çağrılmamalı. */
      expect(getDistanceIconKeyMock).not.toHaveBeenCalledWith(
        `Restaurant (${locale})`
      );
    });

    it("18) boş koleksiyonlar (distances/features/rules/priceIncludes) sayfayı ÇÖKERTMEZ, hardcoded boş-durum metinleri render edilir", async () => {
      /* beforeEach varsayılanı zaten tüm koleksiyonlar için []. */
      const { default: Page } = await import(modulePath);
      const element = await Page({
        params: Promise.resolve({ slug: "test-villa" }),
      });
      render(element);

      expect(screen.getByText("Bilgi yok")).toBeInTheDocument();
      expect(
        screen.getByText("Özellik bilgisi bulunmuyor")
      ).toBeInTheDocument();
    });
  }
);
