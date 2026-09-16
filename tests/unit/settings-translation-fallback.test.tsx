/* ===============================================================
   🛡️ PHASE 10L — FALLBACK ZİNCİRİ + PUBLIC RENDER TESTLERİ
   ===============================================================
   Kapsam:
     A) `resolveSettingsText` (saf resolver, §6)
     B) Footer telif metni — locale-aware + {year}/{site_name} ikamesi (§7)
     C) MaintenanceScreen — locale-aware bakım mesajı (§8)
     D) TR BİT-BİRE AYNILIK REGRESYON KİLİDİ

   `tests/unit/footer-locale.test.tsx` (Phase 9B) ile AYNI
   `usePathname` mock deseni — yeni bir test mimarisi İCAT EDİLMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { resolveSettingsText } from "@/lib/i18n/settings-translation.helper";
import type { SettingsTranslationsByLocale } from "@/lib/i18n/settings-translations.types";
import Footer from "@/app/components/layout/Footer";
import MaintenanceScreen from "@/app/components/layout/MaintenanceScreen";

const TR_COPYRIGHT = "© {year} {site_name} · Tüm hakları saklıdır.";
const EN_COPYRIGHT = "© {year} {site_name} · All rights reserved.";
const DE_COPYRIGHT = "© {year} {site_name} · Alle Rechte vorbehalten.";

const TRANSLATIONS: SettingsTranslationsByLocale = {
  en: {
    footer_copyright: EN_COPYRIGHT,
    maintenance_message: "We are refreshing our site. Back very soon.",
    default_meta_title: "Luxury Villa Rentals",
    default_meta_description: "Handpicked villas on the Mediterranean coast.",
  },
  de: {
    footer_copyright: DE_COPYRIGHT,
    maintenance_message: "Wir erneuern unsere Website. Gleich zurück.",
    default_meta_title: "Luxus-Villen mieten",
    default_meta_description: "Ausgewählte Villen an der Mittelmeerküste.",
  },
};

/* ===============================================================
   A) resolveSettingsText — fallback zinciri
   =============================================================== */
describe("resolveSettingsText — §6 fallback zinciri", () => {
  it("1) locale 'tr' → canonical AYNEN (aynı string referansı, trim YOK)", () => {
    const canonical = "  boşluklu canonical  ";
    const out = resolveSettingsText(
      canonical,
      TRANSLATIONS,
      "tr",
      "footer_copyright"
    );
    expect(out).toBe(canonical);
  });

  it("2) locale 'tr' → çeviri VARSA BİLE canonical döner", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, TRANSLATIONS, "tr", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
  });

  it("3) locale 'tr' + canonical null/undefined → AYNEN null/undefined (çağıranın falsy kontrolü korunur)", () => {
    expect(resolveSettingsText(null, TRANSLATIONS, "tr", "footer_copyright")).toBeNull();
    expect(
      resolveSettingsText(undefined, TRANSLATIONS, "tr", "footer_copyright")
    ).toBeUndefined();
  });

  it("4) locale 'en' + çeviri var → çeviri", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, TRANSLATIONS, "en", "footer_copyright")
    ).toBe(EN_COPYRIGHT);
  });

  it("5) locale 'de' + çeviri var → çeviri", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, TRANSLATIONS, "de", "footer_copyright")
    ).toBe(DE_COPYRIGHT);
  });

  it("6) locale 'en' + çeviri YOK (translations null) → TR canonical", () => {
    expect(
      resolveSettingsText(TR_COPYRIGHT, null, "en", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
    expect(
      resolveSettingsText(TR_COPYRIGHT, undefined, "en", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
  });

  it("7) locale 'en' + o dil hiç yok ({ de: … }) → TR canonical", () => {
    expect(
      resolveSettingsText(
        TR_COPYRIGHT,
        { de: TRANSLATIONS.de },
        "en",
        "footer_copyright"
      )
    ).toBe(TR_COPYRIGHT);
  });

  it("8) çeviri null → TR canonical", () => {
    const partial: SettingsTranslationsByLocale = {
      en: {
        footer_copyright: null,
        maintenance_message: null,
        default_meta_title: null,
        default_meta_description: null,
      },
    };
    expect(
      resolveSettingsText(TR_COPYRIGHT, partial, "en", "footer_copyright")
    ).toBe(TR_COPYRIGHT);
  });

  it("9) çeviri '' veya yalnız boşluk → TR canonical", () => {
    for (const empty of ["", "   ", "\n\t"]) {
      const partial: SettingsTranslationsByLocale = {
        en: {
          footer_copyright: empty,
          maintenance_message: null,
          default_meta_title: null,
          default_meta_description: null,
        },
      };
      expect(
        resolveSettingsText(TR_COPYRIGHT, partial, "en", "footer_copyright")
      ).toBe(TR_COPYRIGHT);
    }
  });

  it("10) her alan BAĞIMSIZ çözülür (biri çevrili, diğeri değil)", () => {
    const partial: SettingsTranslationsByLocale = {
      en: {
        footer_copyright: EN_COPYRIGHT,
        maintenance_message: null,
        default_meta_title: "Luxury Villa Rentals",
        default_meta_description: "",
      },
    };
    expect(
      resolveSettingsText(TR_COPYRIGHT, partial, "en", "footer_copyright")
    ).toBe(EN_COPYRIGHT);
    expect(
      resolveSettingsText("TR bakım", partial, "en", "maintenance_message")
    ).toBe("TR bakım");
    expect(
      resolveSettingsText("TR başlık", partial, "en", "default_meta_title")
    ).toBe("Luxury Villa Rentals");
    expect(
      resolveSettingsText("TR açıklama", partial, "en", "default_meta_description")
    ).toBe("TR açıklama");
  });
});

/* ===============================================================
   B) Footer — §7
   =============================================================== */
const FOOTER_BASE = {
  locations: [],
  villaTypes: [],
  corporatePages: [],
  year: 2026,
  siteName: "VillayaGel",
  phoneDigits: "",
};

describe("Footer — footer_copyright locale-aware (§7)", () => {
  beforeEach(() => usePathnameMock.mockReset());

  it("11) TR — canonical metin, {year}/{site_name} ikamesi AYNEN", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 VillayaGel · Tüm hakları saklıdır.")
    ).toBeInTheDocument();
  });

  it("12) EN — çeviri kullanılır ve yer tutucular ÇEVİRİDE DE ikame edilir", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 VillayaGel · All rights reserved.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("© 2026 VillayaGel · Tüm hakları saklıdır.")
    ).not.toBeInTheDocument();
  });

  it("13) DE — çeviri kullanılır", () => {
    usePathnameMock.mockReturnValue("/de");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 VillayaGel · Alle Rechte vorbehalten.")
    ).toBeInTheDocument();
  });

  it("14) EN + çeviri YOK → TR canonical metin gösterilir", () => {
    usePathnameMock.mockReturnValue("/en");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: null }}
      />
    );
    expect(
      screen.getByText("© 2026 VillayaGel · Tüm hakları saklıdır.")
    ).toBeInTheDocument();
  });

  it("15) canonical BOŞ + çeviri yok → ESKİ hardcoded Türkçe fallback (DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...FOOTER_BASE} settings={{ footer_copyright: "" }} />);
    expect(
      screen.getByText("© 2026 VillayaGel · Tüm hakları saklıdır")
    ).toBeInTheDocument();
  });

  it("16) settings null → ESKİ hardcoded Türkçe fallback (DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(<Footer {...FOOTER_BASE} settings={null} />);
    expect(
      screen.getByText("© 2026 VillayaGel · Tüm hakları saklıdır")
    ).toBeInTheDocument();
  });

  it("17) EN + canonical boş + çeviri VAR → çeviri gösterilir", () => {
    usePathnameMock.mockReturnValue("/en");
    render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: "", translations: TRANSLATIONS }}
      />
    );
    expect(
      screen.getByText("© 2026 VillayaGel · All rights reserved.")
    ).toBeInTheDocument();
  });
});

/* ===============================================================
   C) MaintenanceScreen — §8
   =============================================================== */
describe("MaintenanceScreen — maintenance_message locale-aware (§8)", () => {
  beforeEach(() => usePathnameMock.mockReset());

  it("18) TR — canonical mesaj", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={TRANSLATIONS}
      />
    );
    expect(screen.getByText("Kısa bir bakım yapıyoruz.")).toBeInTheDocument();
  });

  it("19) EN — çeviri mesajı", () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/x");
    render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={TRANSLATIONS}
      />
    );
    expect(
      screen.getByText("We are refreshing our site. Back very soon.")
    ).toBeInTheDocument();
  });

  it("20) DE — çeviri mesajı", () => {
    usePathnameMock.mockReturnValue("/de");
    render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={TRANSLATIONS}
      />
    );
    expect(
      screen.getByText("Wir erneuern unsere Website. Gleich zurück.")
    ).toBeInTheDocument();
  });

  it("21) EN + çeviri yok → TR canonical", () => {
    usePathnameMock.mockReturnValue("/en");
    render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={null}
      />
    );
    expect(screen.getByText("Kısa bir bakım yapıyoruz.")).toBeInTheDocument();
  });

  it("22) canonical boş → ESKİ hardcoded Türkçe varsayılan (DEĞİŞMEDİ)", () => {
    usePathnameMock.mockReturnValue("/");
    render(
      <MaintenanceScreen brand="VillayaGel" canonicalMessage="" translations={null} />
    );
    expect(
      screen.getByText("Sitemizi yeniliyoruz. Kısa süre içinde tekrar buradayız.")
    ).toBeInTheDocument();
  });

  it("23) 'Bakım' üst etiketi ve marka HER DİLDE aynı (§8 — bu fazda çevrilmez)", () => {
    usePathnameMock.mockReturnValue("/en");
    render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={TRANSLATIONS}
      />
    );
    expect(screen.getByText("Bakım")).toBeInTheDocument();
    expect(screen.getByText("VillayaGel")).toBeInTheDocument();
  });
});

/* ===============================================================
   D) TR BİT-BİRE AYNILIK — regresyon kilidi
   =============================================================== */
describe("TR bit-bire aynılık (§6) — çeviri VARKEN bile TR çıktısı değişmez", () => {
  beforeEach(() => usePathnameMock.mockReset());

  it("24) Footer TR DOM'u, translations=null ve translations=DOLU durumlarında AYNI", () => {
    usePathnameMock.mockReturnValue("/");
    const { container: withoutT, unmount } = render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: null }}
      />
    );
    const htmlWithout = withoutT.innerHTML;
    unmount();

    usePathnameMock.mockReturnValue("/");
    const { container: withT } = render(
      <Footer
        {...FOOTER_BASE}
        settings={{ footer_copyright: TR_COPYRIGHT, translations: TRANSLATIONS }}
      />
    );
    expect(withT.innerHTML).toBe(htmlWithout);
  });

  it("25) MaintenanceScreen TR DOM'u, translations=null ve DOLU durumlarında AYNI", () => {
    usePathnameMock.mockReturnValue("/");
    const { container: a, unmount } = render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={null}
      />
    );
    const htmlA = a.innerHTML;
    unmount();

    usePathnameMock.mockReturnValue("/");
    const { container: b } = render(
      <MaintenanceScreen
        brand="VillayaGel"
        canonicalMessage="Kısa bir bakım yapıyoruz."
        translations={TRANSLATIONS}
      />
    );
    expect(b.innerHTML).toBe(htmlA);
  });
});
