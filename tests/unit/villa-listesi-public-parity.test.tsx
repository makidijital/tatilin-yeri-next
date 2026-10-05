/* ===============================================================
   🏛️ /maki-admin/villa-listesi — PUBLIC ARAMA DAVRANIŞ PARİTESİ
   ===============================================================
   Admin villa listesi, public Hero Search → /arama davranışını referans
   alır (kod paylaşmadan). Bu dosya şu davranışları kilitler:

     A) Saf kurallar (`_lib/villa-listesi-filters.ts`)
        - bölge çoklu seçim + grup kökü genişletme
        - villa tipi / özellik AND, kişi ≥, metin arama
        - tarih aralığı geçerliliği, esnek pencereler
        - fiyat kapsamı (priceAvailable) — indirim kapsamı bozmaz
     B) VillaListesiClient (render)
        - varsayılan kişi 2
        - tarih seçilince DOLU villa elenir, fiyatı EKSİK villa elenir
        - indirim kartlara geçer (stayDiscounts)
        - çoklu bölge, tip, özellik birlikte (AND)
        - esnek ±3: ayrı bölüm, seçilebilir; paylaşımda ana tarih
        - paylaşım payload'ı: seçili id'ler + regions dizisi
     C) Yetki düzeltmesi: availability action "villa_lists" kabul eder
     D) /liste/[token] kartı indirimleri alır
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";

/* ---------------- mock katmanı ---------------- */

/* VillaCard → prop'ları gözlemleyen stub. */
const cardProps = new Map<string, Record<string, unknown>>();
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (props: Record<string, unknown>) => {
    cardProps.set(String(props.id), props);
    return (
      <div
        data-testid="villa-card"
        data-villa-id={String(props.id)}
        data-flexible={props.isFlexible ? "1" : "0"}
      >
        {String(props.title)}
      </div>
    );
  },
}));

/* Tarih seçici → tek tıkla sabit aralık seçen stub. */
vi.mock("@/app/components/admin/shared/AdminDateRangePicker", () => ({
  default: ({
    onChange,
  }: {
    onChange: (r: [Date | null, Date | null]) => void;
  }) => (
    <button
      type="button"
      data-testid="pick-dates"
      onClick={() => onChange([new Date(2026, 10, 10), new Date(2026, 10, 15)])}
    >
      tarih
    </button>
  ),
}));

/* Müsaitlik action'ı — pencereye göre dolu villa döndürür. */
let blockedByWindow: (s: string, e: string) => string[] = () => [];
const availabilityCalls: Array<[string, string, string[]]> = [];
vi.mock("@/lib/availability.action", () => ({
  getBlockedVillaIdsAction: async (s: string, e: string, ids: string[]) => {
    availabilityCalls.push([s, e, ids]);
    return blockedByWindow(s, e).filter((id) => ids.includes(id));
  },
}));

const createShared = vi.fn(async () => ({ ok: true as const, token: "tok123" }));
vi.mock(
  "@/app/(admin)/maki-admin/villa-listesi/_components/shared-villa-list.action",
  () => ({ createSharedVillaListAction: (...a: unknown[]) => createShared(...(a as [])) })
);

vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: { TRY: 1 } }),
}));

import VillaListesiClient, {
  type VillaListesiRow,
} from "@/app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient";
import {
  buildAdminFlexWindows,
  expandAdminRegionSelection,
  hasAdminPriceCoverage,
  isAdminDateRange,
  matchesBaseFilters,
  type AdminVillaFilters,
} from "@/app/(admin)/maki-admin/villa-listesi/_lib/villa-listesi-filters";

/* ---------------- fixtures ---------------- */

const LOCATIONS = [
  { id: "kalkan", name: "Kalkan", filter_group_name: "Kalkan" },
  { id: "islamlar", name: "İslamlar", filter_group_name: "Kalkan" },
  { id: "kas", name: "Kaş", filter_group_name: "Kaş" },
  { id: "fethiye", name: "Fethiye", filter_group_name: "Fethiye" },
];

const FULL_PRICES = [
  { price: 10000, currency: "TRY", start_date: "2026-01-01", end_date: "2026-12-31" },
];
/* 13 Kasım sonrası fiyat yok → 10–15 Kasım aralığı EKSİK. */
const PARTIAL_PRICES = [
  { price: 10000, currency: "TRY", start_date: "2026-01-01", end_date: "2026-11-12" },
];
const DISCOUNTS = [
  {
    start_date: "2026-11-01",
    end_date: "2026-11-30",
    discount_type: "percent" as const,
    discount_value: 20,
    currency: null,
  },
];

function villa(
  id: string,
  over: Partial<VillaListesiRow> = {}
): VillaListesiRow {
  return {
    id,
    slug: id,
    title: `Villa ${id}`,
    location_id: "kalkan",
    location: "Kalkan",
    price: null,
    currency: null,
    images: [],
    badge: null,
    guests: 4,
    bedrooms: 2,
    bathrooms: 1,
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    prices: FULL_PRICES,
    discounts: [],
    ...over,
  };
}

const ids = () =>
  screen
    .queryAllByTestId("villa-card")
    .filter((c) => c.getAttribute("data-flexible") === "0")
    .map((c) => c.getAttribute("data-villa-id"));
const flexIds = () =>
  screen
    .queryAllByTestId("villa-card")
    .filter((c) => c.getAttribute("data-flexible") === "1")
    .map((c) => c.getAttribute("data-villa-id"));

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function openDropdownAndCheck(label: string, optionText: string) {
  const fieldLabel = screen.getAllByText(label, { selector: "label" })[0];
  const field = fieldLabel.parentElement!;
  const btn = within(field).getByRole("button");
  if (btn.getAttribute("aria-expanded") !== "true") fireEvent.click(btn);
  const list = within(field).getByRole("listbox");
  fireEvent.click(within(list).getByText(optionText));
}

beforeEach(() => {
  cardProps.clear();
  availabilityCalls.length = 0;
  blockedByWindow = () => [];
  createShared.mockClear();
});

/* ===============================================================
   A) SAF KURALLAR
   =============================================================== */
describe("A) villa-listesi-filters (public /arama davranışı)", () => {
  const base: AdminVillaFilters = {
    locationIds: null,
    guests: 0,
    categoryIds: [],
    villaCategoryMap: {},
    featureIds: [],
    villaFeatureMap: {},
    search: "",
  };

  it("grup kökü seçimi gruptaki tüm alt bölgeleri kapsar; çoklu seçim birleşir", () => {
    const set = expandAdminRegionSelection(["kalkan", "kas"], LOCATIONS)!;
    expect([...set].sort()).toEqual(["islamlar", "kalkan", "kas"]);
    expect(expandAdminRegionSelection([], LOCATIONS)).toBeNull();
    /* Kök olmayan seçim yalnız kendisi. */
    expect([...expandAdminRegionSelection(["islamlar"], LOCATIONS)!]).toEqual(["islamlar"]);
  });

  it("villa tipi ve özellik AND; kişi ≥; metin arama", () => {
    const v = villa("a", { guests: 4 });
    const f = {
      ...base,
      categoryIds: ["t1", "t2"],
      villaCategoryMap: { a: ["t1", "t2", "t3"] },
      featureIds: ["f1"],
      villaFeatureMap: { a: ["f1"] },
      guests: 4,
    };
    expect(matchesBaseFilters(v, f)).toBe(true);
    expect(matchesBaseFilters(v, { ...f, categoryIds: ["t1", "t9"] })).toBe(false);
    expect(matchesBaseFilters(v, { ...f, featureIds: ["f1", "f2"] })).toBe(false);
    expect(matchesBaseFilters(v, { ...f, guests: 5 })).toBe(false);
    expect(matchesBaseFilters(v, { ...base, search: "villa a" })).toBe(true);
    expect(matchesBaseFilters(v, { ...base, search: "yok" })).toBe(false);
  });

  it("tarih aralığı: geçerli YMD ve start < end", () => {
    expect(isAdminDateRange("2026-11-10", "2026-11-15")).toBe(true);
    expect(isAdminDateRange("2026-11-15", "2026-11-15")).toBe(false);
    expect(isAdminDateRange("", "2026-11-15")).toBe(false);
  });

  it("esnek pencereler: süre sabit, ±1..±3 gün", () => {
    const w = buildAdminFlexWindows("2026-11-10", "2026-11-15", 3);
    expect(w).toHaveLength(6);
    expect(w[0]).toEqual({ start: "2026-11-07", end: "2026-11-12" });
    expect(w[5]).toEqual({ start: "2026-11-13", end: "2026-11-18" });
    expect(buildAdminFlexWindows("", "", 3)).toEqual([]);
  });

  it("fiyat kapsamı: eksik gece → false; indirim kapsamı bozmaz", () => {
    expect(hasAdminPriceCoverage(villa("x"), "2026-11-10", "2026-11-15")).toBe(true);
    expect(
      hasAdminPriceCoverage(villa("y", { prices: PARTIAL_PRICES }), "2026-11-10", "2026-11-15")
    ).toBe(false);
    expect(
      hasAdminPriceCoverage(villa("z", { discounts: DISCOUNTS }), "2026-11-10", "2026-11-15")
    ).toBe(true);
    expect(hasAdminPriceCoverage(villa("w", { prices: [] }), "2026-11-10", "2026-11-15")).toBe(false);
  });
});

/* ===============================================================
   B) VillaListesiClient
   =============================================================== */
describe("B) VillaListesiClient — public arama paritesi", () => {
  it("varsayılan kişi 2: kapasitesi 1 olan villa açılışta elenir", () => {
    render(
      <VillaListesiClient
        villas={[villa("a", { guests: 1 }), villa("b", { guests: 2 })]}
        locations={LOCATIONS}
        categories={[]}
        villaCategoryMap={{}}
      />
    );
    expect(ids()).toEqual(["b"]);
    expect((screen.getByPlaceholderText("örn. 4") as HTMLInputElement).value).toBe("2");
  });

  it("tarih seçilince dolu ve fiyatı eksik villa elenir; indirim karta geçer", async () => {
    blockedByWindow = (s, e) => (s === "2026-11-10" && e === "2026-11-15" ? ["dolu"] : []);
    render(
      <VillaListesiClient
        villas={[
          villa("ok", { discounts: DISCOUNTS }),
          villa("dolu"),
          villa("eksik", { prices: PARTIAL_PRICES }),
        ]}
        locations={LOCATIONS}
        categories={[]}
        villaCategoryMap={{}}
      />
    );
    /* Tarihsiz: hepsi görünür, fiyat prop'u yok. */
    expect(ids()).toEqual(["ok", "dolu", "eksik"]);
    expect(availabilityCalls).toHaveLength(0);

    fireEvent.click(screen.getByTestId("pick-dates"));
    /* Yanıt gelene kadar dolu villa bir anlığına bile görünmez/seçilemez. */
    expect(ids()).toEqual([]);
    expect(screen.getByText("Müsaitlik kontrol ediliyor…")).toBeTruthy();
    await flush();

    expect(ids()).toEqual(["ok"]);
    const p = cardProps.get("ok")!;
    expect(p.stayStart).toBe("2026-11-10");
    expect(p.stayEnd).toBe("2026-11-15");
    expect(p.stayDiscounts).toEqual(DISCOUNTS);
    expect(p.isFlexible).toBe(false);
  });

  it("çoklu bölge + villa tipi + özellik birlikte (AND)", () => {
    render(
      <VillaListesiClient
        villas={[
          villa("k1", { location_id: "islamlar", location: "İslamlar" }),
          villa("k2", { location_id: "kas", location: "Kaş" }),
          villa("k3", { location_id: "fethiye", location: "Fethiye" }),
          villa("k4", { location_id: "kalkan" }),
        ]}
        locations={LOCATIONS}
        categories={[{ id: "t1", name: "Balayı" }]}
        villaCategoryMap={{ k1: ["t1"], k2: ["t1"], k3: ["t1"] }}
        features={[{ id: "f1", name: "Jakuzi" }]}
        villaFeatureMap={{ k1: ["f1"], k2: ["f1"], k3: ["f1"], k4: ["f1"] }}
      />
    );
    openDropdownAndCheck("Bölge", "Kalkan");
    openDropdownAndCheck("Bölge", "Kaş");
    /* Kalkan kökü → İslamlar da dahil; Fethiye hariç. */
    expect(ids()).toEqual(["k1", "k2", "k4"]);

    openDropdownAndCheck("Kategori", "Balayı");
    expect(ids()).toEqual(["k1", "k2"]);

    openDropdownAndCheck("Özellikler", "Jakuzi");
    expect(ids()).toEqual(["k1", "k2"]);
  });

  it("esnek ±3: ana tarihte dolu ama kaydırılmış pencerede boş villa ayrı bölümde, seçilebilir ve paylaşılır", async () => {
    /* Ana pencere (10→15): ikisi de dolu. +2 gün penceresi (12→17):
       yalnız "flex" boş. "hep-dolu" her pencerede dolu → esnek DEĞİL. */
    blockedByWindow = (s) => {
      if (s === "2026-11-10") return ["flex", "hep-dolu"];
      if (s === "2026-11-12") return ["hep-dolu"];
      return ["flex", "hep-dolu"];
    };
    render(
      <VillaListesiClient
        villas={[villa("normal"), villa("flex"), villa("hep-dolu")]}
        locations={LOCATIONS}
        categories={[]}
        villaCategoryMap={{}}
      />
    );
    fireEvent.click(screen.getByTestId("pick-dates"));
    await flush();
    expect(ids()).toEqual(["normal"]);
    expect(flexIds()).toEqual([]);

    fireEvent.click(screen.getByLabelText(/3 gün önceki ve sonraki/));
    await flush();
    /* Checkbox tek başına sonuçları değiştirmez; yenileme butonu çıkar. */
    expect(flexIds()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Sonuçları Yenile" }));
    await flush();

    expect(ids()).toEqual(["normal"]);
    expect(flexIds()).toEqual(["flex"]);
    const fp = cardProps.get("flex")!;
    expect(fp.isFlexible).toBe(true);
    expect(fp.prices).toBeUndefined();
    expect(fp.stayStart).toBe("2026-11-10");
    /* Sayaç yalnız normal sonuçları sayar. */
    expect(screen.getByText(/±3 gün içinde müsait \(1\)/)).toBeTruthy();

    /* Esnek villayı seç + normal villayı seç → paylaş. */
    const flexCard = screen
      .getAllByTestId("villa-card")
      .find((c) => c.getAttribute("data-villa-id") === "flex")!;
    fireEvent.click(within(flexCard.parentElement!.parentElement!).getByRole("button", { name: "Listeye ekle" }));
    const normalCard = screen
      .getAllByTestId("villa-card")
      .find((c) => c.getAttribute("data-villa-id") === "normal")!;
    fireEvent.click(within(normalCard.parentElement!.parentElement!).getByRole("button", { name: "Listeye ekle" }));

    openDropdownAndCheck("Bölge", "Kalkan");
    fireEvent.click(screen.getByRole("button", { name: /Listeyi Paylaş/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bağlantı oluştur" }));
    });

    expect(createShared).toHaveBeenCalledTimes(1);
    const payload = (createShared.mock.calls[0] as unknown[])[0] as {
      villaIds: string[];
      searchParams: Record<string, unknown>;
    };
    expect(payload.villaIds.sort()).toEqual(["flex", "normal"]);
    expect(payload.searchParams).toEqual({
      start: "2026-11-10",
      end: "2026-11-15",
      guests: 2,
      regions: ["kalkan"],
    });
    expect(screen.getByDisplayValue(/\/liste\/tok123$/)).toBeTruthy();
  });
});

/* ===============================================================
   B2) ESNEK ±3 — "Sonuçları Yenile" akışı
   =============================================================== */
describe("B2) esnek tarih + Sonuçları Yenile", () => {
  /* Ana pencere (10→15): flex, flex-kas, hep-dolu dolu. +2 pencere
     (12→17): yalnız hep-dolu dolu → flex ve flex-kas esnek sonuçtur. */
  const windows = (s: string) => {
    if (s === "2026-11-12") return ["hep-dolu"];
    return ["flex", "flex-kas", "hep-dolu"];
  };
  const mainCalls = () =>
    availabilityCalls.filter(([s, e]) => s === "2026-11-10" && e === "2026-11-15").length;

  function setup(extra: Partial<Parameters<typeof VillaListesiClient>[0]> = {}) {
    blockedByWindow = windows;
    render(
      <VillaListesiClient
        villas={[
          villa("normal", { location_id: "kalkan" }),
          villa("flex", { location_id: "kalkan" }),
          villa("flex-kas", { location_id: "kas", location: "Kaş" }),
          villa("hep-dolu"),
        ]}
        locations={LOCATIONS}
        categories={[{ id: "t1", name: "Balayı" }]}
        villaCategoryMap={{ normal: ["t1"], flex: ["t1"], "flex-kas": ["t1"] }}
        features={[{ id: "f1", name: "Jakuzi" }]}
        villaFeatureMap={{ normal: ["f1"], flex: ["f1"], "flex-kas": ["f1"] }}
        {...extra}
      />
    );
  }
  const refreshBtn = () => screen.queryByRole("button", { name: "Sonuçları Yenile" });
  const flexBox = () => screen.getByLabelText(/3 gün önceki ve sonraki/);

  it("buton yalnız tercih değişince görünür; basınca kaybolur, tüm müsaitlik yeniden sorgulanır", async () => {
    setup();
    expect(refreshBtn()).toBeNull();

    /* A) Tarih seç → normal sonuçlar. */
    fireEvent.click(screen.getByTestId("pick-dates"));
    await flush();
    expect(ids()).toEqual(["normal"]);
    expect(mainCalls()).toBe(1);

    /* B) ±3 aç → sonuçlar DEĞİŞMEZ, buton çıkar. */
    fireEvent.click(flexBox());
    await flush();
    expect(refreshBtn()).not.toBeNull();
    expect(flexIds()).toEqual([]);
    expect(mainCalls()).toBe(1);

    /* Yenile → yükleniyor durumu, ardından esnek sonuçlar. */
    fireEvent.click(refreshBtn()!);
    expect(screen.getByText("Müsaitlik kontrol ediliyor…")).toBeTruthy();
    expect(refreshBtn()).toBeNull();
    await flush();
    /* C) 3 gün önce/sonra müsait villalar geldi; ana tarih sorgusu tazelendi. */
    expect(ids()).toEqual(["normal"]);
    expect(flexIds()).toEqual(["flex", "flex-kas"]);
    expect(mainCalls()).toBe(2);
    expect(screen.getByText(/\+2 villa ±3 gün içinde/)).toBeTruthy();

    /* D) ±3 kapat → yine değişmez, Yenile → normal sonuçlara dönülür. */
    fireEvent.click(flexBox());
    expect(flexIds()).toEqual(["flex", "flex-kas"]);
    fireEvent.click(refreshBtn()!);
    await flush();
    expect(flexIds()).toEqual([]);
    expect(ids()).toEqual(["normal"]);
    expect(refreshBtn()).toBeNull();
  });

  it("E) kişi/bölge/tip/özellik filtreleri esnek sonuçlara da uygulanır", async () => {
    setup();
    fireEvent.click(screen.getByTestId("pick-dates"));
    await flush();
    fireEvent.click(flexBox());
    fireEvent.click(refreshBtn()!);
    await flush();
    expect(flexIds()).toEqual(["flex", "flex-kas"]);

    /* Bölge: yalnız Kalkan → Kaş'taki esnek villa düşer. */
    openDropdownAndCheck("Bölge", "Kalkan");
    expect(flexIds()).toEqual(["flex"]);
    expect(ids()).toEqual(["normal"]);

    /* Tip + özellik (ikisi de sahip) → değişmez. */
    openDropdownAndCheck("Kategori", "Balayı");
    openDropdownAndCheck("Özellikler", "Jakuzi");
    expect(flexIds()).toEqual(["flex"]);

    /* Kişi 5 → kapasite 4 olan herkes düşer (ana + esnek). */
    fireEvent.change(screen.getByPlaceholderText("örn. 4"), { target: { value: "5" } });
    expect(ids()).toEqual([]);
    expect(flexIds()).toEqual([]);
  });

  it("F) seçim + paylaşım yenilemeden sonra da çalışır; seçim korunur", async () => {
    setup();
    fireEvent.click(screen.getByTestId("pick-dates"));
    await flush();
    const card = (id: string) =>
      screen.getAllByTestId("villa-card").find((c) => c.getAttribute("data-villa-id") === id)!;
    fireEvent.click(within(card("normal").parentElement!.parentElement!).getByRole("button", { name: "Listeye ekle" }));

    fireEvent.click(flexBox());
    fireEvent.click(refreshBtn()!);
    await flush();
    fireEvent.click(within(card("flex").parentElement!.parentElement!).getByRole("button", { name: "Listeye ekle" }));

    expect(screen.getByText("villa seçildi", { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Listeyi Paylaş/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Bağlantı oluştur" }));
    });
    const payload = (createShared.mock.calls[0] as unknown[])[0] as { villaIds: string[] };
    expect(payload.villaIds.sort()).toEqual(["flex", "normal"]);
  });
});

/* ===============================================================
   C) YETKİ — availability action "villa_lists" adminlerini kabul eder
   =============================================================== */
describe("C) getBlockedVillaIdsAction yetkisi", () => {
  it('requirePermission(["villas","villa_lists"]) ile çağrılır', async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/availability.action");
    const requirePermission = vi.fn(async () => ({}));
    vi.doMock("@/lib/auth/action-authz", () => ({ requirePermission }));
    vi.doMock("@/lib/availability.helper", () => ({
      getBlockedVillaIds: async () => new Set(["v1"]),
    }));
    const mod = await import("@/lib/availability.action");
    const out = await mod.getBlockedVillaIdsAction("2026-11-10", "2026-11-15", ["v1"]);
    expect(requirePermission).toHaveBeenCalledWith(["villas", "villa_lists"]);
    expect(out).toEqual(["v1"]);
  });
});
