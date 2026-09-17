/* ===============================================================
   🛡️ PHASE 12B — ADMIN LOCALE PROVIDER + DİL SEÇİCİ TESTLERİ
   ===============================================================
   KAPSAM:
     1) Varsayılan dil TR
     2) TR → EN değişimi (dil seçici üzerinden)
     3) TR → DE değişimi
     4) Persistence (localStorage) — yeniden mount'ta korunuyor
     5) Pages ekranlarının (list / new / [id]) seçilen dille render'ı
     6) Public tarafın ETKİLENMEDİĞİ (public dictionary + public
        locale mimarisi + provider'sız TR fallback)
     7) Hydration güvenliği (ilk state DEFAULT_LOCALE — source-lock)
   =============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import { en } from "@/lib/i18n/dictionaries/en";
import { de } from "@/lib/i18n/dictionaries/de";
import {
  DEFAULT_LOCALE,
  localeFromPathname,
  type Locale,
} from "@/lib/i18n/config";
import {
  AdminLocaleProvider,
  ADMIN_LOCALE_STORAGE_KEY,
  useAdminLocale,
} from "@/app/components/admin/AdminLocaleProvider";
import { AdminLocaleSwitcher } from "@/app/components/admin/AdminLocaleSwitcher";

/* Yorum satırlarını temizler — source-lock kontrolleri yalnız KOD'a
   bakmalı (yorumlardaki "useEffect" gibi kelimeler false-positive
   üretir; Phase 11/12'deki aynı ilke). */
function stripComments(src: string): string {
  const out: string[] = [];
  let i = 0;
  const n = src.length;
  let state: "code" | "block" | "line" = "code";
  while (i < n) {
    const ch = src[i];
    if (state === "code") {
      if (src.startsWith("/*", i)) {
        state = "block";
        i += 2;
        continue;
      }
      if (src.startsWith("//", i)) {
        state = "line";
        i += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        out.push(ch);
        i += 1;
        while (i < n) {
          if (src[i] === "\\") {
            out.push(src[i]);
            if (i + 1 < n) out.push(src[i + 1]);
            i += 2;
            continue;
          }
          out.push(src[i]);
          if (src[i] === q) {
            i += 1;
            break;
          }
          i += 1;
        }
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    if (state === "block") {
      if (src.startsWith("*/", i)) {
        state = "code";
        i += 2;
        continue;
      }
      out.push(ch === "\n" ? "\n" : " ");
      i += 1;
      continue;
    }
    if (ch === "\n") {
      state = "code";
      out.push("\n");
      i += 1;
      continue;
    }
    out.push(" ");
    i += 1;
  }
  return out.join("");
}

/* ===============================================================
   MOCK KATMANI — Pages route'ları için (i18n dışı her şey stub).
   =============================================================== */

const adminFetchMock = vi.fn();
vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (...args: unknown[]) => adminFetchMock(...args),
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

vi.mock("@/app/services/revalidate.actions", () => ({
  revalidateMenu: vi.fn().mockResolvedValue(undefined),
  revalidateTaxonomy: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/activity-log.client", () => ({ logActivity: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: "page-1" }),
  usePathname: () => "/maki-admin/pages",
}));

vi.mock("@/lib/storage", () => ({ storageProvider: { upload: vi.fn() } }));
vi.mock("@/lib/storage.helpers", () => ({
  getPageCoverPublicUrl: () => null,
  buildPageCoverPath: () => "pages/x.webp",
  SITE_ASSETS_BUCKET_NAME: "site-assets",
}));
vi.mock("@/lib/image.helpers", () => ({ convertImageToWebP: vi.fn() }));

import AdminPagesList from "@/app/(admin)/maki-admin/pages/page";
import NewPagePage from "@/app/(admin)/maki-admin/pages/new/page";
import EditPagePage from "@/app/(admin)/maki-admin/pages/[id]/page";

/* =============================================================== */

function okJson(data: unknown) {
  return { ok: true, status: 200, json: async () => ({ ok: true, data }) };
}

const ROW = {
  id: "page-1",
  title: "Hakkımızda",
  slug: "hakkimizda",
  body: "metin",
  excerpt: "",
  seo_title: "",
  seo_description: "",
  noindex: false,
  is_active: true,
  show_in_menu: false,
  cover_image: null,
};

/** Şu anki locale'i görünür kılan yardımcı prob. */
function LocaleProbe() {
  const { locale, ready } = useAdminLocale();
  return (
    <span data-testid="probe" data-ready={String(ready)}>
      {locale}
    </span>
  );
}

function selectLocale(next: Locale) {
  const select = screen.getByRole("combobox") as HTMLSelectElement;
  fireEvent.change(select, { target: { value: next } });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  adminFetchMock.mockResolvedValue(okJson([]));
});

/* ===============================================================
   1) VARSAYILAN DİL
   =============================================================== */
describe("Phase 12B — varsayılan dil", () => {
  it("kayıtlı tercih yokken TR", async () => {
    render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    expect(screen.getByTestId("probe").textContent).toBe(DEFAULT_LOCALE);
    expect(screen.getByTestId("probe").textContent).toBe("tr");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "tr"
    );
  });

  it("geçersiz/bozuk kayıtlı değer TR'ye düşer", async () => {
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, "klingon");
    render(
      <AdminLocaleProvider>
        <LocaleProbe />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    expect(screen.getByTestId("probe").textContent).toBe("tr");
  });

  it("dil seçicide 3 seçenek var (TR/EN/DE)", () => {
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(["tr", "en", "de"]);
    expect(options.map((o) => o.textContent)).toEqual([
      "🇹🇷 TR",
      "🇬🇧 EN",
      "🇩🇪 DE",
    ]);
  });

  it("dil seçici etiketi mevcut `common.language` key'inden gelir", () => {
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    expect(screen.getByLabelText(tr.common.language)).toBeTruthy();
  });
});

/* ===============================================================
   2-3) DİL DEĞİŞİMİ
   =============================================================== */
describe("Phase 12B — dil değişimi", () => {
  it("TR → EN", async () => {
    render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    selectLocale("en");
    expect(screen.getByTestId("probe").textContent).toBe("en");
    expect(screen.getByLabelText(en.common.language)).toBeTruthy();
  });

  it("TR → DE", async () => {
    render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    selectLocale("de");
    expect(screen.getByTestId("probe").textContent).toBe("de");
    expect(screen.getByLabelText(de.common.language)).toBeTruthy();
  });

  it("EN → TR geri dönüş", async () => {
    render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    selectLocale("en");
    expect(screen.getByTestId("probe").textContent).toBe("en");
    selectLocale("tr");
    expect(screen.getByTestId("probe").textContent).toBe("tr");
  });
});

/* ===============================================================
   4) PERSISTENCE
   =============================================================== */
describe("Phase 12B — persistence (localStorage)", () => {
  it("seçim localStorage'a yazılır", async () => {
    render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    expect(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY)).toBeNull();
    selectLocale("de");
    expect(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY)).toBe("de");
  });

  it("yeniden mount (sayfa yenileme) seçimi korur", async () => {
    const first = render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").dataset.ready).toBe("true")
    );
    selectLocale("en");
    expect(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY)).toBe("en");
    first.unmount();

    render(
      <AdminLocaleProvider>
        <LocaleProbe />
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByTestId("probe").textContent).toBe("en")
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "en"
    );
  });

  it("localStorage erişilemezse sessizce TR'ye düşer (fail-safe)", async () => {
    /* Storage kapalıyken provider oturum-içi belleğe düşer; bu bellek
       modül seviyesindedir ve testler arasında paylaşılır. Gerçek bir
       sayfa yüklemesinin başlangıç durumunu taklit etmek için önce
       (storage ÇALIŞIRKEN) TR'ye sabitle. */
    const reset = render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
      </AdminLocaleProvider>
    );
    selectLocale("tr");
    reset.unmount();
    window.localStorage.clear();

    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage disabled");
      });
    try {
      render(
        <AdminLocaleProvider>
          <LocaleProbe />
          <AdminLocaleSwitcher />
        </AdminLocaleProvider>
      );
      await waitFor(() =>
        expect(screen.getByTestId("probe").dataset.ready).toBe("true")
      );
      expect(screen.getByTestId("probe").textContent).toBe("tr");
      /* Yazma da throw etse bile UI çökmemeli; oturum içi geçerli olur. */
      selectLocale("en");
      expect(screen.getByTestId("probe").textContent).toBe("en");
    } finally {
      getItem.mockRestore();
      setItem.mockRestore();
    }
  });
});

/* ===============================================================
   5) PAGES EKRANLARI — SEÇİLEN DİLLE RENDER
   =============================================================== */
describe("Phase 12B — Pages ekranları seçilen dille render", () => {
  it("pages listesi: TR → EN → DE", async () => {
    adminFetchMock.mockResolvedValue(okJson([]));
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <AdminPagesList />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: tr.admin.pages.list.title })
      ).toBeTruthy()
    );
    expect(screen.getByText(tr.admin.pages.list.emptyTitle)).toBeTruthy();

    selectLocale("en");
    expect(
      screen.getByRole("heading", { name: en.admin.pages.list.title })
    ).toBeTruthy();
    expect(screen.getByText(en.admin.pages.list.emptyTitle)).toBeTruthy();
    expect(screen.getByText(en.admin.pages.list.newPageCta)).toBeTruthy();

    selectLocale("de");
    expect(
      screen.getByRole("heading", { name: de.admin.pages.list.title })
    ).toBeTruthy();
    expect(screen.getByText(de.admin.pages.list.emptyTitle)).toBeTruthy();
    expect(screen.getByText(de.admin.pages.list.newPageCta)).toBeTruthy();
  });

  it("pages listesi satır aksiyonları EN'e geçer", async () => {
    adminFetchMock.mockResolvedValue(
      okJson([
        {
          id: "page-1",
          title: "Hakkımızda",
          slug: "hakkimizda",
          is_active: true,
          show_in_menu: false,
        },
      ])
    );
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <AdminPagesList />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(screen.getByText(tr.admin.pages.publish.published)).toBeTruthy()
    );
    selectLocale("en");
    expect(screen.getByText(en.admin.pages.list.view)).toBeTruthy();
    expect(screen.getByText(en.admin.common.edit)).toBeTruthy();
    expect(screen.getByText(en.admin.pages.publish.published)).toBeTruthy();
    expect(screen.getByText(en.admin.pages.list.addToMenu)).toBeTruthy();
    expect(screen.getByText(en.admin.common.delete)).toBeTruthy();
  });

  it("yeni sayfa formu: label + placeholder DE'ye geçer", async () => {
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <NewPagePage />
      </AdminLocaleProvider>
    );
    expect(
      screen.getByRole("heading", { name: tr.admin.pages.form.newTitle })
    ).toBeTruthy();

    selectLocale("de");
    expect(
      screen.getByRole("heading", { name: de.admin.pages.form.newTitle })
    ).toBeTruthy();
    expect(screen.getByText(de.admin.pages.form.fieldTitle)).toBeTruthy();
    expect(
      screen.getByPlaceholderText(de.admin.pages.form.titlePlaceholder)
    ).toBeTruthy();
    expect(screen.getByText(de.admin.pages.sections.label)).toBeTruthy();
    expect(screen.getByText(de.common.save)).toBeTruthy();
  });

  it("yeni sayfa toast mesajı seçilen dilde üretilir", async () => {
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <NewPagePage />
      </AdminLocaleProvider>
    );
    selectLocale("en");
    fireEvent.click(screen.getByText(en.common.save));
    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toBe(
      en.admin.pages.toast.titleSlugRequired
    );
  });

  it("sayfa düzenle: parametreli metinler EN'de doğru doldurulur", async () => {
    adminFetchMock.mockResolvedValue(okJson(ROW));
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <EditPagePage />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: tr.admin.pages.form.editTitle })
      ).toBeTruthy()
    );
    selectLocale("en");
    expect(
      screen.getByRole("heading", { name: en.admin.pages.form.editTitle })
    ).toBeTruthy();
    expect(screen.getByText(en.admin.pages.publish.heading)).toBeTruthy();
    expect(
      screen.getByText(
        en.admin.pages.publish.hint.replace("{url}", "/p/hakkimizda")
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        en.admin.pages.publish.showInMenuHint.replace(
          "{url}",
          "/p/hakkimizda"
        )
      )
    ).toBeTruthy();
  });

  it("dil seçimi Pages ekranları arasında (yeniden mount) korunur", async () => {
    const first = render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <NewPagePage />
      </AdminLocaleProvider>
    );
    selectLocale("de");
    expect(
      screen.getByRole("heading", { name: de.admin.pages.form.newTitle })
    ).toBeTruthy();
    first.unmount();

    adminFetchMock.mockResolvedValue(okJson([]));
    render(
      <AdminLocaleProvider>
        <AdminLocaleSwitcher />
        <AdminPagesList />
      </AdminLocaleProvider>
    );
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: de.admin.pages.list.title })
      ).toBeTruthy()
    );
  });
});

/* ===============================================================
   6) PUBLIC TARAF ETKİLENMEDİ
   =============================================================== */
describe("Phase 12B — public taraf izolasyonu", () => {
  it("public locale mimarisi (`localeFromPathname`) DEĞİŞMEDİ", () => {
    expect(localeFromPathname("/")).toBe("tr");
    expect(localeFromPathname("/en")).toBe("en");
    expect(localeFromPathname("/en/kiralik-villalar")).toBe("en");
    expect(localeFromPathname("/de/")).toBe("de");
    expect(localeFromPathname("/energy")).toBe("tr");
    /* Admin path'i public locale üretmez — admin locale AYRI kanal. */
    expect(localeFromPathname("/maki-admin/pages")).toBe("tr");
  });

  it("public dictionary değerleri DEĞİŞMEDİ (örneklem)", () => {
    expect(tr.common.save).toBe("Kaydet");
    expect(tr.common.loading).toBe("Yükleniyor");
    expect(tr.common.language).toBe("Dil");
    expect(en.common.language).toBe("Language");
    expect(de.common.language).toBe("Sprache");
    expect(tr.header.home).toBe("Anasayfa");
  });

  it("provider DIŞINDA `useAdminLocale` TR fallback döner ve storage'a yazmaz", async () => {
    function Bare() {
      const { locale, setLocale, ready, dictionary } = useAdminLocale();
      return (
        <button
          data-testid="bare"
          data-ready={String(ready)}
          data-title={dictionary.admin.pages.list.title}
          onClick={() => setLocale("en")}
        >
          {locale}
        </button>
      );
    }
    render(<Bare />);
    const el = screen.getByTestId("bare");
    expect(el.textContent).toBe("tr");
    expect(el.dataset.ready).toBe("false");
    expect(el.dataset.title).toBe(tr.admin.pages.list.title);
    await act(async () => {
      fireEvent.click(el);
    });
    expect(el.textContent).toBe("tr");
    expect(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("provider yalnız `(admin)` ağacında mount ediliyor", () => {
    const publicLayout = fs.readFileSync(
      path.join(process.cwd(), "app/(public)/layout.tsx"),
      "utf-8"
    );
    const rootLayout = fs.readFileSync(
      path.join(process.cwd(), "app/layout.tsx"),
      "utf-8"
    );
    expect(publicLayout).not.toContain("AdminLocaleProvider");
    expect(rootLayout).not.toContain("AdminLocaleProvider");

    const adminLayout = fs.readFileSync(
      path.join(process.cwd(), "app/(admin)/maki-admin/layout.tsx"),
      "utf-8"
    );
    expect(adminLayout).toContain("<AdminLocaleProvider>");
    expect(adminLayout).toContain("<AdminLocaleSwitcher />");
  });
});

/* ===============================================================
   7) HYDRATION GÜVENLİĞİ — source-lock
   =============================================================== */
describe("Phase 12B — hydration güvenliği", () => {
  const providerSrc = stripComments(
    fs.readFileSync(
      path.join(process.cwd(), "app/components/admin/AdminLocaleProvider.tsx"),
      "utf-8"
    )
  );

  it("`useSyncExternalStore` + server snapshot = DEFAULT_LOCALE", () => {
    expect(providerSrc).toContain("useSyncExternalStore");
    expect(providerSrc).toContain("function readDefaultLocale(): Locale {");
    expect(providerSrc).toContain("return DEFAULT_LOCALE;");
    /* `useEffect` + `setState` paterni KULLANILMIYOR (cascading render). */
    expect(providerSrc).not.toContain("useEffect");
    expect(providerSrc).not.toContain("useState");
  });

  it("storage okuma/yazma try/catch ile korunuyor", () => {
    const reads = providerSrc.split("localStorage").length - 1;
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(providerSrc).toContain("try {");
    expect(providerSrc).toContain("} catch {");
  });

  it("değer `toLocale` ile sınırlanıyor (güvenilmeyen girdi)", () => {
    expect(providerSrc).toContain(
      "toLocale(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY))"
    );
    expect(providerSrc).toContain("toLocale(next)");
  });
});
