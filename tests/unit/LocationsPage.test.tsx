/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Locations Admin Sayfası + Çeviri Paneli
   TESTLERİ
   ===============================================================
   FeaturesPage.test.tsx (Batch 2) ile AYNI mock-katman prensibi ve
   senaryo seti — Location field'larına (`name`) uyarlandı. Locations
   sayfasının kendi CRUD'ı adminFetch (REST route) üzerinden gider —
   bu testler yalnız Batch 3'ün çeviri UI'ını hedefler; mevcut inline-
   edit/cover-upload davranışına dokunmaz (regresyon testi #13 mevcut
   temel elemanların hâlâ render edildiğini doğrular).
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
}));

const loadLocationTranslationsMock = vi.fn();
const saveLocationTranslationMock = vi.fn();

vi.mock("@/app/(admin)/maki-admin/locations/location-translations.action", () => ({
  loadLocationTranslationsAction: (...args: unknown[]) =>
    loadLocationTranslationsMock(...args),
  saveLocationTranslationAction: (...args: unknown[]) =>
    saveLocationTranslationMock(...args),
}));

const getPublicSettingsMock = vi.fn();
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: () => getPublicSettingsMock(),
}));

vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
  revalidateMenu: vi.fn().mockResolvedValue(undefined),
}));

const notifyErrorMock = vi.fn();
const notifySuccessMock = vi.fn();
const confirmMock = vi.fn();

vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({
    success: notifySuccessMock,
    error: notifyErrorMock,
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    promise: vi.fn(),
  }),
  useConfirm: () => confirmMock,
}));

import LocationsPage from "@/app/(admin)/maki-admin/locations/page";

const LOCATIONS = [
  {
    id: "loc-1",
    name: "Kaş",
    slug: "kas",
    cover_image: null,
    show_in_filter: false,
    filter_group_name: null,
  },
  {
    id: "loc-2",
    name: "Fethiye",
    slug: "fethiye",
    cover_image: null,
    show_in_filter: false,
    filter_group_name: null,
  },
];

function settingsWith(multilingual_enabled: boolean | null) {
  return { multilingual_enabled };
}

beforeEach(() => {
  adminFetchMock.mockReset();
  loadLocationTranslationsMock.mockReset();
  saveLocationTranslationMock.mockReset();
  getPublicSettingsMock.mockReset();
  notifyErrorMock.mockReset();
  notifySuccessMock.mockReset();
  confirmMock.mockReset();

  adminFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, locations: LOCATIONS }),
  });
  loadLocationTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  saveLocationTranslationMock.mockResolvedValue({
    ok: true,
    row: {
      id: "row-1",
      location_id: "loc-1",
      locale: "en",
      name: "Kas",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  });
});

describe("LocationsPage — Phase 10D Batch 3 — çeviri UI görünürlüğü", () => {
  it("1) multilingual_enabled=false → 'Çeviriler' butonu RENDER EDİLMEZ", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(false));
    render(<LocationsPage />);

    expect(await screen.findByText("Kaş")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("2) multilingual_enabled=null → fail-safe KAPALI, buton görünmez", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(null));
    render(<LocationsPage />);

    expect(await screen.findByText("Kaş")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /çevirileri/i })
    ).not.toBeInTheDocument();
  });

  it("3) multilingual_enabled=true → 'Çeviriler' butonları render edilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    expect(btns.length).toBe(2);
  });
});

describe("LocationsPage — Phase 10D Batch 3 — panel açma/kapama + tab mekaniği", () => {
  it("4) 'Çeviriler' butonuna tıklanınca panel açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);

    expect(await screen.findByText("Türkçe (referans, salt okunur)")).toBeInTheDocument();
  });

  it("5) Yalnız ilgili satırın paneli açılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);
    await screen.findByText("Türkçe (referans, salt okunur)");

    expect(screen.getAllByText("Türkçe (referans, salt okunur)").length).toBe(1);
  });

  it("6) İkinci satıra basınca önceki panel kapanır (tek panel açık)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    const btns = await screen.findAllByRole("button", { name: /çevirileri/i });
    fireEvent.click(btns[0]);
    await screen.findByText("Türkçe (referans, salt okunur)");
    fireEvent.click(btns[1]);

    await waitFor(() => {
      expect(screen.getAllByText("Türkçe (referans, salt okunur)").length).toBe(1);
    });
  });

  it("7) EN tab çalışıyor (varsayılan aktif)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    expect(await screen.findByLabelText("English")).toBeInTheDocument();
    expect(screen.queryByLabelText("Deutsch")).not.toBeInTheDocument();
  });

  it("8) DE tab çalışıyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    await screen.findByLabelText("English");
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));

    expect(await screen.findByLabelText("Deutsch")).toBeInTheDocument();
    expect(screen.queryByLabelText("English")).not.toBeInTheDocument();
  });
});

describe("LocationsPage — Phase 10D Batch 3 — mevcut çeviri yükleme + kaydet", () => {
  it("9) Mevcut EN/DE çevirileri input'a yüklenir", async () => {
    loadLocationTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        {
          id: "row-en",
          location_id: "loc-1",
          locale: "en",
          name: "Kas",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "row-de",
          location_id: "loc-1",
          locale: "de",
          name: "Kasch",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    const enInput = (await screen.findByLabelText("English")) as HTMLInputElement;
    await waitFor(() => expect(enInput.value).toBe("Kas"));

    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    const deInput = (await screen.findByLabelText("Deutsch")) as HTMLInputElement;
    await waitFor(() => expect(deInput.value).toBe("Kasch"));
  });

  it("10) Kaydet → saveLocationTranslationAction doğru locationId/locale/name ile çağrılır", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Kas" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() =>
      expect(saveLocationTranslationMock).toHaveBeenCalledWith({
        locationId: "loc-1",
        locale: "en",
        name: "Kas",
      })
    );
  });

  it("11) Boş/trim input → action ÇAĞRILMAZ, hata toast gösterilir", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveLocationTranslationMock).not.toHaveBeenCalled();
  });

  it("12) Action hata döndürürse hata gösterilir", async () => {
    saveLocationTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);
    const input = await screen.findByLabelText("English");
    fireEvent.change(input, { target: { value: "Kas" } });
    fireEvent.click(screen.getByRole("button", { name: /sürümünü kaydet/i }));

    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        "Kaydedilemedi",
        expect.objectContaining({ description: "Yetkisiz" })
      )
    );
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });
});

describe("LocationsPage — Phase 10D Batch 3 — regresyon + TR referans kuralı", () => {
  it("13) Mevcut Location CRUD UI temel elemanları (Düzenle/Sil/input) hâlâ render ediliyor", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    expect(await screen.findByText("Kaş")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Düzenle/i }).length).toBe(2);
    expect(screen.getAllByRole("button", { name: /^Sil$/i }).length).toBe(2);
    expect(
      screen.getByPlaceholderText("Bölge adı (Kaş, Fethiye…)")
    ).toBeInTheDocument();
  });

  it("Inline düzenleme modunda 'Çeviriler' butonu gizlenir (mevcut edit UX bozulmuyor)", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    await screen.findByText("Kaş");
    const editBtns = screen.getAllByRole("button", { name: /Düzenle/i });
    fireEvent.click(editBtns[0]);

    // Düzenleme modunda satır başına Kaydet/İptal görünür, Çeviriler
    // butonu o satır için artık render edilmez.
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /çevirileri/i }).length).toBe(1);
    });
  });

  it("TR referansı düzenlenebilir input olarak SUNULMUYOR — yalnız salt metin", async () => {
    getPublicSettingsMock.mockResolvedValue(settingsWith(true));
    render(<LocationsPage />);

    fireEvent.click((await screen.findAllByRole("button", { name: /çevirileri/i }))[0]);

    const trLabel = await screen.findByText("Türkçe (referans, salt okunur)");
    const panel = trLabel.closest("div")?.parentElement as HTMLElement;
    expect(panel).toBeTruthy();

    const trText = within(panel).getByText("Kaş");
    expect(trText.tagName).not.toBe("INPUT");
    expect(trText.tagName).not.toBe("TEXTAREA");

    const inputs = within(panel).getAllByRole("textbox");
    expect(inputs.length).toBe(1);
  });
});
