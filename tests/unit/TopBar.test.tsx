/* ==============================================================
   🛡️ PHASE 10C — TOPBAR D°L DEĞİŞTİRİCİ: TESTLER
   ==============================================================
   Hedef: app/components/layout/TopBar.tsx'e eklenen dil değiştirici
   (bkz. lib/i18n/locale-switch.helper.ts, dictionaries `common.language`).

   TopBar zaten kendi `getPublicSettingsAction()` fetch'ine sahip
   ("use client", useEffect + cancelled guard, DEĞİŞMEDİ) — bu dosyada
   o fetch mock'lanır (gerçek DB/RPC'ye ÇİKMAZ, diğer proje testleriyle
   AYNI convention — bkz. tests/unit/BookingSidebar.pool-heating.test.tsx).
   `usePathname()` (next/navigation) ve `useCurrency()` (CurrencyContext)
   de shallow mock'lanır — bu testlerin amacı dil değiştirici + TopBar'ın
   MEVCUT davranışının regresyonu, currency context'in kendi iç mantığı
   DEĞİLI (o ayrı bir dosyanın kapsamı).

   14 kullanıcı-onaylı senaryo + ek regresyon testleri:
     1-3)   Görünürlük: multilingual kapalı/açık/settings-null.
     4-9)   Aktif locale + hedef URL'ler (ana sayfa, villa detay, TR/EN/DE).
     10-12) Fallback-to-home (locale karşılığı olmayan route'lar).
     13-16) Regresyon: currency seçici, sosyal ikonlar, 7/24 destek,
            telefon/e-posta ETKİLENMEDİ.
     17-19) Dropdown mekaniği: aç/kapa, dışa-tık, aktif locale
            tıklanamaz + aria-current.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

/* 🛡️ useCurrency shallow mock — CurrencyProvider'ın kendi localStorage/
   rate mantığı bu dosyanın kapsamı DIŞINDA (ayrı, dokunulmayan bir
   context). Currency seçicinin TopBar içindeki MEVCUT davranışının
   (state/dropdown/seçim) regresyonu aşağıda test edilir. */
const setCurrencyMock = vi.fn();
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({
    currency: "TRY",
    setCurrency: setCurrencyMock,
    rates: {},
  }),
}));

import TopBar from "@/app/components/layout/TopBar";

const LANGUAGE_LABEL: Record<"tr" | "en" | "de", string> = {
  tr: "Dil",
  en: "Language",
  de: "Sprache",
};

const BASE_SETTINGS = {
  phone: "+90 555 555 55 55",
  email: "info@example.com",
  whatsapp_link: null as string | null,
  instagram: "https://instagram.com/example",
  facebook: "https://facebook.com/example",
  youtube: "https://youtube.com/example",
  tiktok: "https://tiktok.com/example",
};

function settingsWith(
  overrides: Partial<typeof BASE_SETTINGS & { multilingual_enabled: boolean | null }>
) {
  return { ...BASE_SETTINGS, multilingual_enabled: false, ...overrides };
}

describe("TopBar — Phase 10C dil değiştirici", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
    getPublicSettingsMock.mockReset();
    setCurrencyMock.mockReset();
    usePathnameMock.mockReturnValue("/");
  });

  /* --- 1-3) GÖRÜNÜRLÜK --- */

  it("1) multilingual_enabled=false → dil değiştirici RENDER EDİLMEZ, currency seçici etkilenmez", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: false }));
    render(<TopBar />);
    expect(await screen.findByText("TRY")).toBeInTheDocument();
    expect(screen.queryByLabelText(LANGUAGE_LABEL.tr)).not.toBeInTheDocument();
  });

  it("2) multilingual_enabled=true → dil değiştirici render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    expect(await screen.findByLabelText(LANGUAGE_LABEL.tr)).toBeInTheDocument();
  });

  it("3) settings null (fetch başarısız/okunamıyor) → TOPBAR'IN TAMAMI (dil değiştirici dahil) render edilmez — fail-safe", async () => {
    getPublicSettingsMock.mockResolvedValue(null);
    const { container } = render(<TopBar />);
    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText(LANGUAGE_LABEL.tr)).not.toBeInTheDocument();
  });

  /* --- 4-9) AKTİF LOCALE + HEDEF URL'LER --- */

  it("4) '/' (TR ana sayfa) → aktif locale TR, EN→'/en', DE→'/de'", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    const trOption = screen.getByRole("option", { name: "TR" });
    expect(trOption.tagName).toBe("SPAN");
    expect(trOption).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute("href", "/de");
  });

  it("5) '/en' (EN ana sayfa) → aktif locale EN, TR→'/', DE→'/de'", async () => {
    usePathnameMock.mockReturnValue("/en");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "EN" }).tagName).toBe("SPAN");
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute("href", "/de");
  });

  it("6) '/de' (DE ana sayfa) → aktif locale DE, TR→'/', EN→'/en'", async () => {
    usePathnameMock.mockReturnValue("/de");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.de);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.de));
    expect(screen.getByRole("option", { name: "DE" }).tagName).toBe("SPAN");
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
  });

  it("7) '/kiralik-villa/test' (TR villa detay) → EN→'/en/kiralik-villa/test', DE→'/de/kiralik-villa/test'", async () => {
    usePathnameMock.mockReturnValue("/kiralik-villa/test");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/kiralik-villa/test"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/kiralik-villa/test"
    );
  });

  it("8) '/en/kiralik-villa/test' (EN villa detay) → TR→'/kiralik-villa/test', DE→'/de/kiralik-villa/test'", async () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villa/test");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      "/kiralik-villa/test"
    );
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute(
      "href",
      "/de/kiralik-villa/test"
    );
  });

  it("9) '/de/kiralik-villa/test' (DE villa detay) → TR→'/kiralik-villa/test', EN→'/en/kiralik-villa/test'", async () => {
    usePathnameMock.mockReturnValue("/de/kiralik-villa/test");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.de);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.de));
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute(
      "href",
      "/kiralik-villa/test"
    );
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute(
      "href",
      "/en/kiralik-villa/test"
    );
  });

  /* --- 10-12) FALLBACK-TO-HOME (locale karşılığı olmayan route'lar) --- */

  it("10) '/teklif-al' (locale karşılığı yok) → EN→'/en', DE→'/de' (ASLA 404/broken)", async () => {
    usePathnameMock.mockReturnValue("/teklif-al");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
    expect(screen.getByRole("option", { name: "DE" })).toHaveAttribute("href", "/de");
  });

  it("11) '/en/teklif-al' → TR→'/' (kullanıcı örneği birebir)", async () => {
    usePathnameMock.mockReturnValue("/en/teklif-al");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    expect(screen.getByRole("option", { name: "TR" })).toHaveAttribute("href", "/");
  });

  it("12) '/de/blog' → EN→'/en' (kullanıcı örneği birebir)", async () => {
    usePathnameMock.mockReturnValue("/de/blog");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.de);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.de));
    expect(screen.getByRole("option", { name: "EN" })).toHaveAttribute("href", "/en");
  });

  /* --- 13-16) REGRESYON: mevcut TopBar davranışı ETKİLENMEDİ --- */

  it("13) currency seçici hâlâ çalışıyor (dil değiştirici AÇIKKEN) — ayrı state, birbirini etkilemez", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    const curButton = await screen.findByText("TRY");
    fireEvent.click(curButton);
    expect(screen.getByRole("option", { name: /USD/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: /USD/ }));
    expect(setCurrencyMock).toHaveBeenCalledWith("USD");
    // Dil değiştirici dropdown'ı hâlâ kapalı — currency seçimi onu tetiklemedi.
    expect(screen.queryByRole("option", { name: "TR" })).not.toBeInTheDocument();
  });

  it("14) dil değiştirici açıkken currency seçici KAPALI kalır (bağımsız state)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.tr));
    expect(screen.getByRole("option", { name: "TR" })).toBeInTheDocument();
    // Currency dropdown'ı bu tıklamadan ETKİLENMEDİ (hâlâ kapalı).
    expect(screen.queryByRole("option", { name: /USD/ })).not.toBeInTheDocument();
  });

  it("15) sosyal ikonlar, 7/24 destek, telefon/e-posta — multilingual açıkken de DEĞİŞMEDİ", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.tr);
    expect(screen.getByText("7/24 Destek")).toBeInTheDocument();
    expect(screen.getByText(BASE_SETTINGS.phone)).toBeInTheDocument();
    expect(screen.getByText(BASE_SETTINGS.email)).toBeInTheDocument();
    expect(screen.getByLabelText("Instagram")).toBeInTheDocument();
    expect(screen.getByLabelText("Facebook")).toBeInTheDocument();
    expect(screen.getByLabelText("YouTube")).toBeInTheDocument();
    expect(screen.getByLabelText("TikTok")).toBeInTheDocument();
  });

  it("16) sosyal ikonlar, 7/24 destek, telefon/e-posta — multilingual KAPALİYKEN de DEĞİŞMEDİ (regresyon)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: false }));
    render(<TopBar />);
    await screen.findByText("7/24 Destek");
    expect(screen.getByText(BASE_SETTINGS.phone)).toBeInTheDocument();
    expect(screen.getByText(BASE_SETTINGS.email)).toBeInTheDocument();
    expect(screen.getByText("TRY")).toBeInTheDocument();
  });

  /* --- 17-19) DROPDOWN MEKANIğİ --- */

  it("17) dil değiştirici butonuna tıklayınca dropdown açılır, tekrar tıklayınca kapanır", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    const langButton = await screen.findByLabelText(LANGUAGE_LABEL.tr);
    expect(screen.queryByRole("listbox", { name: LANGUAGE_LABEL.tr })).not.toBeInTheDocument();
    fireEvent.click(langButton);
    expect(screen.getByRole("listbox", { name: LANGUAGE_LABEL.tr })).toBeInTheDocument();
    fireEvent.click(langButton);
    expect(screen.queryByRole("listbox", { name: LANGUAGE_LABEL.tr })).not.toBeInTheDocument();
  });

  it("18) dropdown açıkken dışarı tıklanınca kapanır (dışa-tık — currency ile AYNI mekanik)", async () => {
    usePathnameMock.mockReturnValue("/");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    const langButton = await screen.findByLabelText(LANGUAGE_LABEL.tr);
    fireEvent.click(langButton);
    expect(screen.getByRole("listbox", { name: LANGUAGE_LABEL.tr })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox", { name: LANGUAGE_LABEL.tr })).not.toBeInTheDocument();
  });

  it("19) aktif locale seçeneği tıklanamaz (span, Link değil) — diğer ikisi tıklanabilir Link", async () => {
    usePathnameMock.mockReturnValue("/en/kiralik-villalar");
    getPublicSettingsMock.mockResolvedValue(settingsWith({ multilingual_enabled: true }));
    render(<TopBar />);
    await screen.findByLabelText(LANGUAGE_LABEL.en);
    fireEvent.click(screen.getByLabelText(LANGUAGE_LABEL.en));
    const activeOption = screen.getByRole("option", { name: "EN" });
    expect(activeOption.tagName).toBe("SPAN");
    expect(activeOption).not.toHaveAttribute("href");
    expect(screen.getByRole("option", { name: "TR" }).tagName).toBe("A");
    expect(screen.getByRole("option", { name: "DE" }).tagName).toBe("A");
  });
});
