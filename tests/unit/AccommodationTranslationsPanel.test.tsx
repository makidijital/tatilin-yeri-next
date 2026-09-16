/* ===============================================================
   🛡️ PHASE 10E — BATCH 3 — AccommodationTranslationsPanel TESTLERİ
   ===============================================================
   Hedef: app/(admin)/maki-admin/villas/[id]/_components/
          AccommodationTranslationsPanel.tsx

   FeaturesPage.test.tsx (Phase 10D Batch 2) ile AYNI mock-katman
   prensibi: gerçek DB/RPC/server action'lara ÇIKILMAZ.
   villa-layout-translations.action / settings.action /
   NotificationProvider MOCK'LANIR.

   25 kullanıcı-onaylı senaryo — bkz. testlerin başlıkları.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const loadVillaLayoutTranslationsMock = vi.fn();
const saveVillaLayoutTranslationMock = vi.fn();

vi.mock(
  "@/app/(admin)/maki-admin/villas/[id]/_components/villa-layout-translations.action",
  () => ({
    loadVillaLayoutTranslationsAction: (...args: unknown[]) =>
      loadVillaLayoutTranslationsMock(...args),
    saveVillaLayoutTranslationAction: (...args: unknown[]) =>
      saveVillaLayoutTranslationMock(...args),
  })
);

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

const notifyErrorMock = vi.fn();
const notifySuccessMock = vi.fn();

vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccessMock,
    error: notifyErrorMock,
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
  useConfirm: () => vi.fn(),
}));

import AccommodationTranslationsPanel from "@/app/(admin)/maki-admin/villas/[id]/_components/AccommodationTranslationsPanel";

const VILLA_ID = "villa-uuid-1";

const TR_BEDROOMS = [
  { name: "Ana Yatak Odası", beds: [{ type: "double" as const, count: 1 }] },
  { name: "Çocuk Odası", beds: [{ type: "single" as const, count: 2 }] },
  { name: "İkiz Yataklı Oda", beds: [{ type: "single" as const, count: 2 }] },
];
const TR_BATHROOMS = [
  { name: "1. Banyo", type: "full" as const },
  { name: "2. Banyo", type: "shower_wc" as const },
];

const EN_BEDROOM_ROW = [
  { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
  { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
  { i: 2, tr: "İkiz Yataklı Oda", name: "Twin Bedroom" },
];
const DE_BEDROOM_ROW = [
  { i: 0, tr: "Ana Yatak Odası", name: "Hauptschlafzimmer" },
  { i: 1, tr: "Çocuk Odası", name: "Kinderzimmer" },
  { i: 2, tr: "İkiz Yataklı Oda", name: "Zweibettzimmer" },
];

function renderPanel(
  props: Partial<React.ComponentProps<typeof AccommodationTranslationsPanel>> = {}
) {
  return render(
    <AccommodationTranslationsPanel
      villaId={VILLA_ID}
      bedrooms={TR_BEDROOMS}
      bathrooms={TR_BATHROOMS}
      {...props}
    />
  );
}

/** Panel görünene kadar bekler (settings + load effect'leri çözülsün). */
async function waitForPanel() {
  await waitFor(() =>
    expect(screen.getByText("Konaklama Düzeni Çevirileri")).toBeInTheDocument()
  );
  await waitFor(() =>
    expect(screen.getByText("Oda Çevirileri")).toBeInTheDocument()
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: true });
  loadVillaLayoutTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  saveVillaLayoutTranslationMock.mockResolvedValue({ ok: true, row: {} });
});

/* ---------------------------------------------------------------
   1-3 — MULTILINGUAL GATE
   --------------------------------------------------------------- */
describe("multilingual_enabled gate", () => {
  it("1) multilingual_enabled=false → panel render EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: false });
    const { container } = renderPanel();

    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(
      screen.queryByText("Konaklama Düzeni Çevirileri")
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it("2) multilingual_enabled=null → OFF kabul edilir, panel render EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue({ multilingual_enabled: null });
    const { container } = renderPanel();

    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("2b) settings null dönerse de OFF (fail-safe)", async () => {
    getPublicSettingsMock.mockResolvedValue(null);
    const { container } = renderPanel();

    await waitFor(() => expect(getPublicSettingsMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("3) multilingual_enabled=true → panel render EDİLİR", async () => {
    renderPanel();
    await waitForPanel();
    expect(screen.getByText("Banyo Çevirileri")).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------
   4-8 — LOCALE TAB DAVRANIŞI
   --------------------------------------------------------------- */
describe("EN/DE tab davranışı", () => {
  it("4) varsayılan EN tab → EN inputları görünür", async () => {
    renderPanel();
    await waitForPanel();

    expect(
      screen.getByLabelText("Ana Yatak Odası — English")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("1. Banyo — English")).toBeInTheDocument();
  });

  it("5) Deutsch tab → DE inputları görünür", async () => {
    renderPanel();
    await waitForPanel();

    fireEvent.click(screen.getByText("Deutsch"));

    expect(
      screen.getByLabelText("Ana Yatak Odası — Deutsch")
    ).toBeInTheDocument();
  });

  it("6) TR kaynak isimleri görünür", async () => {
    renderPanel();
    await waitForPanel();

    expect(screen.getByText(/Ana Yatak Odası/)).toBeInTheDocument();
    expect(screen.getByText(/Çocuk Odası/)).toBeInTheDocument();
    expect(screen.getByText(/İkiz Yataklı Oda/)).toBeInTheDocument();
  });

  it("7) TR isimleri DÜZENLENEBİLİR input DEĞİL (input sayısı = oda+banyo)", async () => {
    renderPanel();
    await waitForPanel();

    const inputs = screen.getAllByRole("textbox");
    /* 3 oda + 2 banyo = 5 çeviri inputu. TR için EK input YOK. */
    expect(inputs).toHaveLength(TR_BEDROOMS.length + TR_BATHROOMS.length);
    for (const input of inputs) {
      expect((input as HTMLInputElement).value).not.toBe("Ana Yatak Odası");
    }
  });

  it("8) EN ve DE inputları AYNI ANDA görünmez", async () => {
    renderPanel();
    await waitForPanel();

    expect(
      screen.getByLabelText("Ana Yatak Odası — English")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Ana Yatak Odası — Deutsch")
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Deutsch"));

    expect(
      screen.getByLabelText("Ana Yatak Odası — Deutsch")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Ana Yatak Odası — English")
    ).not.toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------
   9-11 — HYDRATE
   --------------------------------------------------------------- */
describe("mevcut çevirilerin yüklenmesi", () => {
  it("9) mevcut EN çevirisi inputlara hydrate edilir", async () => {
    loadVillaLayoutTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          locale: "en",
          bedroom_layout: EN_BEDROOM_ROW,
          bathroom_layout: null,
        },
      ],
    });

    renderPanel();
    await waitForPanel();

    expect(
      (screen.getByLabelText("Ana Yatak Odası — English") as HTMLInputElement)
        .value
    ).toBe("Master Bedroom");
    expect(
      (screen.getByLabelText("İkiz Yataklı Oda — English") as HTMLInputElement)
        .value
    ).toBe("Twin Bedroom");
  });

  it("10) mevcut DE çevirisi inputlara hydrate edilir", async () => {
    loadVillaLayoutTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        { locale: "de", bedroom_layout: DE_BEDROOM_ROW, bathroom_layout: null },
      ],
    });

    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getByText("Deutsch"));

    expect(
      (screen.getByLabelText("Ana Yatak Odası — Deutsch") as HTMLInputElement)
        .value
    ).toBe("Hauptschlafzimmer");
  });

  it("11) çeviri yoksa inputlar BOŞ (TR ile doldurulmaz)", async () => {
    renderPanel();
    await waitForPanel();

    for (const input of screen.getAllByRole("textbox")) {
      expect((input as HTMLInputElement).value).toBe("");
    }
  });

  it("11b) drift'li kayıt (TR adı değişmiş) input'a hydrate EDİLMEZ", async () => {
    loadVillaLayoutTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          locale: "en",
          bedroom_layout: [
            { i: 0, tr: "ESKİ AD", name: "Master Bedroom" },
            { i: 1, tr: "Çocuk Odası", name: "Children's Bedroom" },
            { i: 2, tr: "İkiz Yataklı Oda", name: "Twin Bedroom" },
          ],
          bathroom_layout: null,
        },
      ],
    });

    renderPanel();
    await waitForPanel();

    expect(
      (screen.getByLabelText("Ana Yatak Odası — English") as HTMLInputElement)
        .value
    ).toBe("");
    expect(
      (screen.getByLabelText("Çocuk Odası — English") as HTMLInputElement).value
    ).toBe("Children's Bedroom");
  });
});

/* ---------------------------------------------------------------
   12-15 — SAVE PAYLOAD
   --------------------------------------------------------------- */
describe("save flow", () => {
  it("12) oda Kaydet → doğru payload (YALNIZ bedroomLayout)", async () => {
    renderPanel();
    await waitForPanel();

    fireEvent.change(screen.getByLabelText("Ana Yatak Odası — English"), {
      target: { value: "Master Bedroom" },
    });
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalledTimes(1)
    );
    const payload = saveVillaLayoutTranslationMock.mock.calls[0][0];
    expect(payload).toEqual({
      villaId: VILLA_ID,
      locale: "en",
      bedroomLayout: [
        { i: 0, tr: "Ana Yatak Odası", name: "Master Bedroom" },
        { i: 1, tr: "Çocuk Odası", name: "" },
        { i: 2, tr: "İkiz Yataklı Oda", name: "" },
      ],
    });
    expect("bathroomLayout" in payload).toBe(false);
  });

  it("13) banyo Kaydet → doğru payload (YALNIZ bathroomLayout)", async () => {
    renderPanel();
    await waitForPanel();

    fireEvent.change(screen.getByLabelText("1. Banyo — English"), {
      target: { value: "Bathroom 1" },
    });
    fireEvent.click(screen.getAllByText("Kaydet")[1]);

    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalledTimes(1)
    );
    const payload = saveVillaLayoutTranslationMock.mock.calls[0][0];
    expect(payload).toEqual({
      villaId: VILLA_ID,
      locale: "en",
      bathroomLayout: [
        { i: 0, tr: "1. Banyo", name: "Bathroom 1" },
        { i: 1, tr: "2. Banyo", name: "" },
      ],
    });
    expect("bedroomLayout" in payload).toBe(false);
  });

  it("14) EN aktifken locale='en' gönderilir", async () => {
    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalled()
    );
    expect(saveVillaLayoutTranslationMock.mock.calls[0][0].locale).toBe("en");
  });

  it("15) DE aktifken locale='de' gönderilir", async () => {
    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getByText("Deutsch"));
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalled()
    );
    expect(saveVillaLayoutTranslationMock.mock.calls[0][0].locale).toBe("de");
  });

  it("15b) locale 'tr' HİÇBİR ZAMAN gönderilmez", async () => {
    renderPanel();
    await waitForPanel();

    fireEvent.click(screen.getAllByText("Kaydet")[0]);
    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalledTimes(1)
    );
    /* İlk save bitene kadar butonlar disabled (çift istek engeli) —
       ikinci tıklamadan önce yeniden aktifleşmesini bekle. */
    await waitFor(() =>
      expect(
        (screen.getAllByText("Kaydet")[0] as HTMLButtonElement).disabled
      ).toBe(false)
    );

    fireEvent.click(screen.getByText("Deutsch"));
    fireEvent.click(screen.getAllByText("Kaydet")[0]);
    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalledTimes(2)
    );

    for (const call of saveVillaLayoutTranslationMock.mock.calls) {
      expect(call[0].locale).not.toBe("tr");
    }
    expect(saveVillaLayoutTranslationMock.mock.calls[0][0].locale).toBe("en");
    expect(saveVillaLayoutTranslationMock.mock.calls[1][0].locale).toBe("de");
  });
});

/* ---------------------------------------------------------------
   16-19 — LOADING / SUCCESS / ERROR
   --------------------------------------------------------------- */
describe("loading / success / error", () => {
  it("16) save sırasında butonlar disabled (çift istek engeli)", async () => {
    let resolveSave: (v: unknown) => void = () => {};
    saveVillaLayoutTranslationMock.mockImplementation(
      () => new Promise((resolve) => { resolveSave = resolve; })
    );

    renderPanel();
    await waitForPanel();

    const buttons = screen.getAllByText("Kaydet");
    fireEvent.click(buttons[0]);

    await waitFor(() => {
      const bathroomBtn = screen.getByText("Kaydet");
      expect((bathroomBtn as HTMLButtonElement).disabled).toBe(true);
    });
    expect(screen.getByText("Kaydediliyor…")).toBeInTheDocument();

    resolveSave({ ok: true, row: {} });
    await waitFor(() =>
      expect(screen.queryByText("Kaydediliyor…")).not.toBeInTheDocument()
    );
  });

  it("17) başarılı save → success toast", async () => {
    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(notifySuccessMock.mock.calls[0][0]).toContain("English");
  });

  it("18) action hatası kullanıcıya gösterilir", async () => {
    saveVillaLayoutTranslationMock.mockResolvedValue({
      ok: false,
      error: "Yetkisiz",
    });

    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toBe("Kaydedilemedi");
    expect(notifyErrorMock.mock.calls[0][1].description).toBe("Yetkisiz");
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  it("19) drift hatası servisin mesajıyla AYNEN gösterilir", async () => {
    saveVillaLayoutTranslationMock.mockResolvedValue({
      ok: false,
      error: "Oda düzeni değişmiş — sayfayı yenileyip tekrar deneyin",
    });

    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][1].description).toBe(
      "Oda düzeni değişmiş — sayfayı yenileyip tekrar deneyin"
    );
  });

  it("19b) yükleme hatası kullanıcıya gösterilir", async () => {
    loadVillaLayoutTranslationsMock.mockResolvedValue({
      ok: false,
      error: "Çeviriler okunamadı",
    });

    renderPanel();
    await waitFor(() =>
      expect(screen.getByText("Konaklama Düzeni Çevirileri")).toBeInTheDocument()
    );
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toBe("Çeviriler yüklenemedi");
  });
});

/* ---------------------------------------------------------------
   20-25 — SIRA / SALT-OKUNURLUK / GÜVENLİK
   --------------------------------------------------------------- */
describe("sıra ve düzenleme kısıtları", () => {
  it("20) oda sırası TR ile AYNI", async () => {
    renderPanel();
    await waitForPanel();

    const labels = screen
      .getAllByRole("textbox")
      .slice(0, 3)
      .map((i) => i.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Ana Yatak Odası — English",
      "Çocuk Odası — English",
      "İkiz Yataklı Oda — English",
    ]);
  });

  it("21) banyo sırası TR ile AYNI", async () => {
    renderPanel();
    await waitForPanel();

    const labels = screen
      .getAllByRole("textbox")
      .slice(3)
      .map((i) => i.getAttribute("aria-label"));
    expect(labels).toEqual(["1. Banyo — English", "2. Banyo — English"]);
  });

  it("22) oda EKLEME arayüzü YOK", async () => {
    renderPanel();
    await waitForPanel();

    expect(screen.queryByText(/Oda Ekle|Yeni oda|\+ Oda/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Banyo Ekle|Yeni banyo/i)).not.toBeInTheDocument();
  });

  it("23) oda SİLME arayüzü YOK", async () => {
    renderPanel();
    await waitForPanel();

    expect(screen.queryByText(/^Sil$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/sil/i)).not.toBeInTheDocument();
  });

  it("24) drag/drop veya sıralama arayüzü YOK", async () => {
    const { container } = renderPanel();
    await waitForPanel();

    expect(container.querySelectorAll("[draggable='true']")).toHaveLength(0);
    expect(screen.queryByText(/Yukarı|Aşağı|Sırala/i)).not.toBeInTheDocument();
  });

  it("25) payload YALNIZ villaId/locale/layout içerir — TR villa verisi yazılmaz", async () => {
    renderPanel();
    await waitForPanel();
    fireEvent.click(screen.getAllByText("Kaydet")[0]);

    await waitFor(() =>
      expect(saveVillaLayoutTranslationMock).toHaveBeenCalled()
    );
    const payload = saveVillaLayoutTranslationMock.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual([
      "bedroomLayout",
      "locale",
      "villaId",
    ]);
    /* `tr` alanları TR kaynağın AYNISI — uydurulmuş değer YOK; sunucu
       ayrıca DB'ye karşı doğrular (Batch 2). */
    expect(payload.bedroomLayout.map((e: { tr: string }) => e.tr)).toEqual([
      "Ana Yatak Odası",
      "Çocuk Odası",
      "İkiz Yataklı Oda",
    ]);
  });

  it("25b) layout boş villada uyarı gösterilir, input render edilmez", async () => {
    renderPanel({ bedrooms: [], bathrooms: [] });
    await waitFor(() =>
      expect(screen.getByText("Konaklama Düzeni Çevirileri")).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(
        screen.getByText(/konaklama düzeni girilmemiş/i)
      ).toBeInTheDocument()
    );
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});
