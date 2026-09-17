/* ===============================================================
   🛡️ MIGRATION 086 — ADMIN MENÜ ÇEVİRİ UI TESTLERİ
   ===============================================================
   `PageTranslationsCard.test.tsx` (Phase 12C) ile AYNI mock-katman
   prensibi.

   Kapsam:
     A) `MenuTranslationsPanel` — mevcut menüyü DÜZENLEME akışı
     B) `/maki-admin/menu/new` — YENİ menü oluştururken TR + EN + DE
     C) Mevcut CRUD sözleşmesinin BOZULMADIĞI (POST payload, href,
        source_type/source_id)

   ⚠️ Bu ekranlar ADMIN ARAYÜZ DİLİNİ DEĞİŞTİRMEZ — admin Türkçe kalır.
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/* ---------- mock katmanı ---------- */
const loadMenuTranslationsMock = vi.fn();
const saveMenuTranslationMock = vi.fn();
vi.mock("@/app/(admin)/maki-admin/menu/menu-translations.action", () => ({
  loadMenuTranslationsAction: (...a: unknown[]) =>
    loadMenuTranslationsMock(...a),
  saveMenuTranslationAction: (...a: unknown[]) => saveMenuTranslationMock(...a),
}));

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...a: unknown[]) => adminFetchMock(...a),
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
  }),
  useConfirm: () => vi.fn().mockResolvedValue(false),
}));

const revalidateMenuMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateMenu: (...a: unknown[]) => revalidateMenuMock(...a),
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
}));

const routerPushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/maki-admin/menu/new",
}));

import MenuTranslationsPanel from "@/app/(admin)/maki-admin/menu/MenuTranslationsPanel";
import NewMenu from "@/app/(admin)/maki-admin/menu/new/page";

beforeEach(() => {
  vi.clearAllMocks();
  loadMenuTranslationsMock.mockResolvedValue({ ok: true, rows: [] });
  saveMenuTranslationMock.mockResolvedValue({
    ok: true,
    row: { id: "t1", menu_id: "m1", locale: "en", name: "X" },
  });
  adminFetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, pages: [], types: [], locations: [], menu: [] }),
  });
});

/* ===============================================================
   A) MenuTranslationsPanel — DÜZENLEME
   =============================================================== */
describe("MenuTranslationsPanel", () => {
  async function mountPanel(name = "Kiralık Villalar") {
    render(<MenuTranslationsPanel menuId="m1" menuName={name} />);
    await screen.findByLabelText("English");
  }

  it("1) TR adı SALT OKUNUR referans olarak gösterilir (input DEĞİL)", async () => {
    await mountPanel();
    expect(screen.getByText("Kiralık Villalar")).toBeInTheDocument();
    expect(
      (screen.getByText("Kiralık Villalar") as HTMLElement).tagName
    ).not.toBe("INPUT");
  });

  it("2) EN + DE alanları AYNI ANDA görünür", async () => {
    await mountPanel();
    expect(screen.getByLabelText("English")).toBeInTheDocument();
    expect(screen.getByLabelText("Deutsch")).toBeInTheDocument();
  });

  it("3) mevcut çeviriler yüklenir (düzenleme akışı)", async () => {
    loadMenuTranslationsMock.mockResolvedValue({
      ok: true,
      rows: [
        { locale: "en", name: "Rental Villas" },
        { locale: "de", name: "Mietvillen" },
      ],
    });
    await mountPanel();
    expect(loadMenuTranslationsMock).toHaveBeenCalledWith("m1");
    expect(screen.getByLabelText("English")).toHaveValue("Rental Villas");
    expect(screen.getByLabelText("Deutsch")).toHaveValue("Mietvillen");
  });

  it("4) EN + DE güncellenir ve İKİSİ DE kaydedilir", async () => {
    await mountPanel();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.change(screen.getByLabelText("Deutsch"), {
      target: { value: "Mietvillen" },
    });
    fireEvent.click(screen.getByText("Çevirileri kaydet"));

    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "m1",
      locale: "en",
      name: "Rental Villas",
    });
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "m1",
      locale: "de",
      name: "Mietvillen",
    });
  });

  it("5) BOŞ bırakılabilir — kaydetme hata VERMEZ", async () => {
    await mountPanel();
    fireEvent.click(screen.getByText("Çevirileri kaydet"));
    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(saveMenuTranslationMock.mock.calls[0][0].name).toBe("");
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("6) kayıt sonrası MEVCUT cache invalidation çağrılır (revalidateMenu)", async () => {
    await mountPanel();
    fireEvent.click(screen.getByText("Çevirileri kaydet"));
    await waitFor(() => expect(revalidateMenuMock).toHaveBeenCalled());
  });

  it("7) yetkisiz/hatalı kayıt kullanıcıya bildirilir, 2. locale denenmez", async () => {
    saveMenuTranslationMock.mockResolvedValue({ ok: false, error: "Yetkisiz" });
    await mountPanel();
    fireEvent.click(screen.getByText("Çevirileri kaydet"));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).toHaveBeenCalledTimes(1);
    expect(revalidateMenuMock).not.toHaveBeenCalled();
  });

  it("8) okuma hatası kullanıcıya bildirilir (panel çökmez)", async () => {
    loadMenuTranslationsMock.mockResolvedValue({
      ok: false,
      error: "Çeviriler okunamadı",
    });
    render(<MenuTranslationsPanel menuId="m1" menuName="X" />);
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
  });
});

/* ===============================================================
   B+C) /maki-admin/menu/new — OLUŞTURMA
   =============================================================== */
describe("/maki-admin/menu/new — TR + EN + DE", () => {
  async function fillManual() {
    render(<NewMenu />);
    await waitFor(() => expect(adminFetchMock).toHaveBeenCalled());
    fireEvent.change(screen.getByPlaceholderText("Örn: İletişim"), {
      target: { value: "Kiralık Villalar" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("/iletisim veya https://…"),
      { target: { value: "/kiralik-villalar" } }
    );
  }

  function mockCreateOk(id: string | null = "new-menu-id") {
    adminFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ ok: true, id }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          pages: [],
          types: [],
          locations: [],
          menu: [],
        }),
      });
    });
  }

  it("9) EN + DE alanları formda mevcut", async () => {
    await fillManual();
    expect(screen.getByLabelText("English")).toBeInTheDocument();
    expect(screen.getByLabelText("Deutsch")).toBeInTheDocument();
  });

  it("10) TR + EN + DE birlikte kaydedilir", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.change(screen.getByLabelText("Deutsch"), {
      target: { value: "Mietvillen" },
    });
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(2)
    );
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "new-menu-id",
      locale: "en",
      name: "Rental Villas",
    });
    expect(saveMenuTranslationMock).toHaveBeenCalledWith({
      menuId: "new-menu-id",
      locale: "de",
      name: "Mietvillen",
    });
  });

  it("11) MEVCUT POST payload'ı DEĞİŞMEDİ (name/href/source_type/source_id/is_active)", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));

    await waitFor(() =>
      expect(
        adminFetchMock.mock.calls.some((c) => c[1]?.method === "POST")
      ).toBe(true)
    );
    const post = adminFetchMock.mock.calls.find(
      (c) => c[1]?.method === "POST"
    )!;
    expect(post[0]).toBe("/api/admin/menu");
    expect(JSON.parse(post[1].body as string)).toEqual({
      name: "Kiralık Villalar",
      href: "/kiralik-villalar",
      source_type: "manual",
      source_id: null,
      is_active: true,
    });
  });

  it("12) EN/DE BOŞ bırakılırsa çeviri isteği HİÇ atılmaz", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(routerPushMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).not.toHaveBeenCalled();
  });

  it("13) yalnız EN doldurulursa TEK çeviri isteği atılır", async () => {
    mockCreateOk();
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() =>
      expect(saveMenuTranslationMock).toHaveBeenCalledTimes(1)
    );
    expect(saveMenuTranslationMock.mock.calls[0][0].locale).toBe("en");
  });

  it("14) id dönmezse (eski/None yanıt) menü OLUŞUR, çeviri atlanır — çökme yok", async () => {
    mockCreateOk(null);
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/maki-admin/menu");
  });

  it("15) çeviri kaydı patlarsa menü kaydı BOZULMAZ (best-effort)", async () => {
    mockCreateOk();
    saveMenuTranslationMock.mockResolvedValue({
      ok: false,
      error: "Yetkisiz",
    });
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    expect(notifyErrorMock).toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/maki-admin/menu");
  });

  it("16) menü oluşturma BAŞARISIZSA çeviri hiç denenmez", async () => {
    adminFetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ ok: false, error: "boom" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, pages: [], types: [], locations: [], menu: [] }),
      });
    });
    await fillManual();
    fireEvent.change(screen.getByLabelText("English"), {
      target: { value: "Rental Villas" },
    });
    fireEvent.click(screen.getByText("Kaydet"));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(saveMenuTranslationMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
