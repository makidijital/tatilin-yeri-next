/* ===============================================================
   🏛️ /maki-admin/villa-listesi — PASİF VİLLA KAPSAMI + /liste PAYLAŞIMI
   ===============================================================
   Kapsam: AKTİF  veya  PASİF + (pozitif fiyatlı, bitişi bugün/sonrası
   en az bir villa_prices sezonu). Belge numarası hiçbir durumda filtre
   değildir.

     A) Aktif + belge var + fiyat var  → GELİR
     B) Aktif + belge yok + fiyat var  → GELİR
     C) Pasif + belge var + fiyat var  → GELİR
     D) Pasif + belge yok + fiyat var  → GELİR
     E) Pasif + belge var + fiyat yok  → GELMEZ
     F) Pasif + belge yok + fiyat yok  → GELMEZ
     +  Pasif + yalnız GEÇMİŞ fiyat    → GELMEZ
     +  Aktif + fiyat yok              → GELİR (aktif davranışı değişmedi)

   Paylaşım:
     G) Pasif villa için token yoksa MEVCUT üreticiyle oluşturulur;
        aktif / token'lı pasif villaya dokunulmaz; üretim hatası → liste
        oluşturulmaz.
     /liste: aktif → normal link; pasif → /v/[token]; linksiz pasif gizli;
        aktif + pasif birlikte; yalnız pasiflerden oluşan liste 404 olmaz.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import {
  hasCurrentOrFuturePrice,
  isInVillaListesiScope,
} from "@/app/(admin)/maki-admin/villa-listesi/_lib/villa-listesi-filters";

/* ---------------- ortak mock'lar ---------------- */

const TODAY = "2026-10-05";
vi.mock("@/lib/date-format", async (orig) => ({
  ...(await orig<typeof import("@/lib/date-format")>()),
  todayIstanbulYmd: () => TODAY,
}));

/* Admin sayfası: auth + yetki geçer; client prop'ları yakalanır. */
const clientProps: { current: Record<string, unknown> | null } = { current: null };
vi.mock(
  "@/app/(admin)/maki-admin/villa-listesi/_components/VillaListesiClient",
  () => ({
    default: (props: Record<string, unknown>) => {
      clientProps.current = props;
      return null;
    },
  })
);
vi.mock("@/lib/admin-route-auth", () => ({
  authorizeAdminSession: async () => ({ ok: true, caller: { id: "admin-1" } }),
}));
vi.mock("@/app/components/admin/AdminSectionGuard", () => ({
  adminPermissionGate: async () => null,
}));
vi.mock("@/app/components/admin/AdminPageSessionRefresh", () => ({
  default: () => null,
}));

const FUTURE = [{ price: 9000, currency: "TRY", start_date: "2026-06-01", end_date: "2026-12-31" }];
const PAST = [{ price: 9000, currency: "TRY", start_date: "2025-06-01", end_date: "2025-09-30" }];
const ZERO = [{ price: 0, currency: "TRY", start_date: "2026-06-01", end_date: "2026-12-31" }];

function raw(id: string, is_active: boolean, prices: unknown[], doc: string | null) {
  return {
    id,
    slug: id,
    title: id,
    location_id: "loc",
    badge: null,
    is_active,
    tourism_document_number: doc,
    guests: 4,
    bedrooms: 2,
    bathrooms: 1,
    cleaning_fee: 0,
    cleaning_currency: "TRY",
    cleaning_limit: 0,
    location: { name: "Kalkan" },
    villa_images: [],
    villa_prices: prices,
    villa_discounts: [],
  };
}

const CURATOR_ROWS = [
  raw("A-aktif-belge-fiyat", true, FUTURE, "07-1234"),
  raw("B-aktif-belgesiz-fiyat", true, FUTURE, null),
  raw("C-pasif-belge-fiyat", false, FUTURE, "07-5678"),
  raw("D-pasif-belgesiz-fiyat", false, FUTURE, null),
  raw("E-pasif-belge-fiyatsiz", false, [], "07-9999"),
  raw("F-pasif-belgesiz-fiyatsiz", false, [], null),
  raw("pasif-gecmis-fiyat", false, PAST, null),
  raw("pasif-sifir-fiyat", false, ZERO, null),
  raw("aktif-fiyatsiz", true, [], null),
];

/* Repository katmanı — admin sayfası + paylaşım servisi + /liste. */
let cardRows: Array<Record<string, unknown>> = [];
let tokenStatusRows: Array<Record<string, unknown>> = [];
let tokenStatusError: { message: string } | null = null;
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findCuratorCards: async () => ({ data: CURATOR_ROWS, error: null }),
    findCardsByIds: async () => ({ data: cardRows, error: null }),
    findPrivateTokenStatusByIds: async () => ({
      data: tokenStatusError ? null : tokenStatusRows,
      error: tokenStatusError,
    }),
  },
}));
vi.mock("@/lib/db/villa-location.repository", () => ({
  villaLocationRepository: { findAllForFilter: async () => ({ data: [], error: null }) },
}));
vi.mock("@/lib/db/villa-type.repository", () => ({
  villaTypeRepository: {
    findAllIdNameBySortOrder: async () => ({ data: [], error: null }),
    findAllRelations: async () => ({ data: [], error: null }),
  },
}));
vi.mock("@/lib/db/villa-feature.repository", () => ({
  villaFeatureRepository: {
    findAllForPublicTaxonomy: async () => ({ data: [], error: null }),
    findAllRelations: async () => ({ data: [], error: null }),
  },
}));

const generateToken = vi.fn(async (id: string) => ({ ok: true as const, token: `tok-${id}` }));
vi.mock("@/app/services/villa-admin/private-token.service", () => ({
  generatePrivateAccessToken: (id: string) => generateToken(id),
}));

const createRow = vi.fn(async () => ({ error: null }));
let storedList: Record<string, unknown> | null = null;
vi.mock("@/lib/db/shared-villa-list.repository", () => ({
  sharedVillaListRepository: {
    create: (...a: unknown[]) => createRow(...(a as [])),
    findByToken: async () => ({ data: storedList, error: null }),
  },
}));
vi.mock("@/app/services/villa.service", () => ({
  /* Mevcut görünürlük: yalnız aktifler (repo is_active=true). */
  getVillasByIds: async (ids: string[]) =>
    ids.filter((id) => id.startsWith("aktif")).map((id) => ({ id })),
}));

/* /liste kartı — prop'lar yakalanır. */
const cardProps = new Map<string, Record<string, unknown>>();
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (props: Record<string, unknown>) => {
    cardProps.set(String(props.id), props);
    return <div data-testid="villa-card" />;
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/i18n/get-villa-badge-translations.server", () => ({
  getVillaBadgesByLocale: async () => new Map(),
}));

import VillaListesiPage from "@/app/(admin)/maki-admin/villa-listesi/page";
import {
  createSharedVillaList,
  getSharedVillaListByToken,
} from "@/app/services/shared-villa-list.service";
import SharedListPageBody from "@/app/components/shared-list/SharedListPageBody";

beforeEach(() => {
  clientProps.current = null;
  cardProps.clear();
  generateToken.mockClear();
  createRow.mockClear();
  tokenStatusRows = [];
  tokenStatusError = null;
  cardRows = [];
  storedList = null;
});

/* ===============================================================
   1) Saf kural
   =============================================================== */
describe("kapsam kuralı (saf)", () => {
  const P = (price: number, end_date: string) => ({ price, end_date });

  it("pasif: yalnız pozitif ve bitişi bugün/sonrası fiyat sayılır", () => {
    expect(hasCurrentOrFuturePrice([P(100, TODAY)], TODAY)).toBe(true);
    expect(hasCurrentOrFuturePrice([P(100, "2026-10-04")], TODAY)).toBe(false);
    expect(hasCurrentOrFuturePrice([P(0, "2027-01-01")], TODAY)).toBe(false);
    expect(hasCurrentOrFuturePrice([], TODAY)).toBe(false);
    expect(
      hasCurrentOrFuturePrice([P(100, "2025-01-01"), P(50, "2027-01-01")], TODAY)
    ).toBe(true);
  });

  it("aktif her zaman; is_active null/false → pasif kuralı", () => {
    expect(isInVillaListesiScope({ is_active: true, prices: [] }, TODAY)).toBe(true);
    expect(isInVillaListesiScope({ is_active: false, prices: [] }, TODAY)).toBe(false);
    expect(isInVillaListesiScope({ is_active: null, prices: [] }, TODAY)).toBe(false);
    expect(
      isInVillaListesiScope({ is_active: false, prices: [P(1, "2026-12-31")] }, TODAY)
    ).toBe(true);
  });
});

/* ===============================================================
   2) Admin sayfası — A–F senaryoları
   =============================================================== */
describe("admin villa listesi havuzu (A–F)", () => {
  it("aktifler + fiyatı güncel pasifler gelir; fiyatsız/geçmiş fiyatlı pasifler gelmez", async () => {
    render(await VillaListesiPage());
    const villas = clientProps.current!.villas as Array<{ id: string; is_active: boolean }>;
    const ids = villas.map((v) => v.id);
    expect(ids).toEqual([
      "A-aktif-belge-fiyat",
      "B-aktif-belgesiz-fiyat",
      "C-pasif-belge-fiyat",
      "D-pasif-belgesiz-fiyat",
      "aktif-fiyatsiz",
    ]);
    expect(ids).not.toContain("E-pasif-belge-fiyatsiz");
    expect(ids).not.toContain("F-pasif-belgesiz-fiyatsiz");
    expect(ids).not.toContain("pasif-gecmis-fiyat");
    expect(ids).not.toContain("pasif-sifir-fiyat");
    /* Pasif işareti istemciye taşınır (kart rozeti). */
    expect(villas.find((v) => v.id === "C-pasif-belge-fiyat")!.is_active).toBe(false);
    expect(villas.find((v) => v.id === "A-aktif-belge-fiyat")!.is_active).toBe(true);
  });
});

/* ===============================================================
   3) Paylaşım — token garantisi (G)
   =============================================================== */
describe("paylaşım: pasif villa özel link token'ı", () => {
  it("yalnız token'ı OLMAYAN pasif villa için mevcut üretici çağrılır", async () => {
    tokenStatusRows = [
      { id: "aktif-1", is_active: true, deleted_at: null, private_access_token: null },
      { id: "pasif-tokenli", is_active: false, deleted_at: null, private_access_token: "abc" },
      { id: "pasif-tokensiz", is_active: false, deleted_at: null, private_access_token: null },
    ];
    const res = await createSharedVillaList({
      villaIds: ["aktif-1", "pasif-tokenli", "pasif-tokensiz"],
    });
    expect(res.ok).toBe(true);
    expect(generateToken).toHaveBeenCalledTimes(1);
    expect(generateToken).toHaveBeenCalledWith("pasif-tokensiz");
    expect(createRow).toHaveBeenCalledTimes(1);
  });

  it("token üretilemezse liste oluşturulmaz", async () => {
    tokenStatusRows = [
      { id: "pasif-tokensiz", is_active: false, deleted_at: null, private_access_token: null },
    ];
    generateToken.mockResolvedValueOnce({ ok: false, error: "x" } as never);
    const res = await createSharedVillaList({ villaIds: ["pasif-tokensiz"] });
    expect(res.ok).toBe(false);
    expect(createRow).not.toHaveBeenCalled();
  });

  it("yalnız aktif villalı listede üretici hiç çağrılmaz", async () => {
    tokenStatusRows = [
      { id: "aktif-1", is_active: true, deleted_at: null, private_access_token: null },
    ];
    const res = await createSharedVillaList({ villaIds: ["aktif-1"] });
    expect(res.ok).toBe(true);
    expect(generateToken).not.toHaveBeenCalled();
  });

  it("durum sorgusu hata verirse liste oluşturulmaz", async () => {
    tokenStatusError = { message: "db down" };
    const res = await createSharedVillaList({ villaIds: ["aktif-1"] });
    expect(res.ok).toBe(false);
    expect(createRow).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   4) /liste/[token] — aktif + pasif birlikte (D, E, H)
   =============================================================== */
function card(id: string, is_active: boolean, token: string | null) {
  return {
    ...raw(id, is_active, FUTURE, null),
    deleted_at: null,
    price: null,
    currency: null,
    private_access_token: token,
  };
}

describe("/liste/[token] — pasif villalar özel linkle", () => {
  beforeEach(() => {
    storedList = {
      token: "liste1",
      created_at: "2026-10-01T00:00:00Z",
      expires_at: null,
      revoked_at: null,
      title: null,
      note: null,
      search_params: { start: "2026-11-10", end: "2026-11-15" },
      villa_ids: ["aktif-1", "pasif-tokenli", "pasif-linksiz"],
    };
  });

  it("servis tüm snapshot id'lerini döndürür (villas yalnız aktif)", async () => {
    const list = (await getSharedVillaListByToken("liste1"))!;
    expect(list.villa_ids).toEqual(["aktif-1", "pasif-tokenli", "pasif-linksiz"]);
    expect(list.villas.map((v) => v.id)).toEqual(["aktif-1"]);
  });

  it("aktif → normal link; pasif → /v/[token]; linksiz pasif gizli", async () => {
    cardRows = [
      card("aktif-1", true, null),
      card("pasif-tokenli", false, "ozel123"),
      card("pasif-linksiz", false, null),
    ];
    const el = await SharedListPageBody({ params: Promise.resolve({ token: "liste1" }) });
    render(el);
    expect([...cardProps.keys()]).toEqual(["aktif-1", "pasif-tokenli"]);
    expect(cardProps.get("aktif-1")!.privateHref).toBeUndefined();
    expect(cardProps.get("pasif-tokenli")!.privateHref).toBe("/v/ozel123");
    /* Fiyat bağlamı pasif villada da aynı. */
    expect(cardProps.get("pasif-tokenli")!.stayStart).toBe("2026-11-10");
  });

  it("EN locale → /en/v/[token]", async () => {
    cardRows = [card("pasif-tokenli", false, "ozel123")];
    const el = await SharedListPageBody({
      params: Promise.resolve({ token: "liste1" }),
      locale: "en",
    });
    render(el);
    expect(cardProps.get("pasif-tokenli")!.privateHref).toBe("/en/v/ozel123");
  });

  it("yalnız pasif villalardan oluşan liste 404 olmaz", async () => {
    storedList = { ...storedList!, villa_ids: ["pasif-tokenli"] };
    cardRows = [card("pasif-tokenli", false, "ozel123")];
    const el = await SharedListPageBody({ params: Promise.resolve({ token: "liste1" }) });
    render(el);
    expect([...cardProps.keys()]).toEqual(["pasif-tokenli"]);
  });

  it("yalnız aktif villalı liste eskisi gibi çalışır", async () => {
    storedList = { ...storedList!, villa_ids: ["aktif-1"] };
    cardRows = [card("aktif-1", true, null)];
    const el = await SharedListPageBody({ params: Promise.resolve({ token: "liste1" }) });
    render(el);
    expect([...cardProps.keys()]).toEqual(["aktif-1"]);
  });
});
