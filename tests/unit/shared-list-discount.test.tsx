/* ===============================================================
   🛡️ /liste/[token] — İNDİRİM PARİTESİ
   ===============================================================
   Admin villa listesi önizlemesi indirimli toplamı gösterir; müşterinin
   açtığı /liste/[token] kartı da AYNI indirim verisini almalı.
   Token/snapshot/sıralama/notFound davranışı bu testin konusu değil
   ve DEĞİŞMEDİ.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const cardProps = new Map<string, Record<string, unknown>>();
vi.mock("@/app/components/villa/VillaCard", () => ({
  default: (props: Record<string, unknown>) => {
    cardProps.set(String(props.id), props);
    return <div data-testid="villa-card">{String(props.title)}</div>;
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

let listSp: Record<string, unknown> | null = null;
vi.mock("@/app/services/shared-villa-list.service", () => ({
  getSharedVillaListByToken: async () => ({
    token: "tok",
    created_at: "2026-10-01T00:00:00Z",
    expires_at: null,
    revoked_at: null,
    title: null,
    note: null,
    searchParams: listSp,
    snapshot_count: 1,
    villas: [{ id: "v1" }],
  }),
}));

const ROW = {
  id: "v1",
  slug: "v1",
  title: "Villa Bir",
  is_active: true,
  deleted_at: null,
  badge: null,
  guests: 4,
  bedrooms: 2,
  bathrooms: 1,
  price: null,
  currency: null,
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  location: { name: "Kalkan" },
  villa_images: [],
  villa_prices: [
    { price: 10000, currency: "TRY", start_date: "2026-01-01", end_date: "2026-12-31" },
  ],
  villa_discounts: [
    {
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      discount_type: "percent",
      discount_value: "20",
      currency: null,
    },
    /* Geçersiz tip → elenir (/arama normalizasyonu ile aynı). */
    {
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      discount_type: "weird",
      discount_value: 5,
      currency: null,
    },
  ],
};
vi.mock("@/lib/db/villa.repository.server", () => ({
  villaAdminRepository: {
    findCardsByIds: async () => ({ data: [ROW], error: null }),
  },
}));
vi.mock("@/lib/i18n/get-villa-badge-translations.server", () => ({
  getVillaBadgesByLocale: async () => new Map(),
}));

import SharedListPageBody from "@/app/components/shared-list/SharedListPageBody";

beforeEach(() => {
  cardProps.clear();
});

async function renderPage() {
  const el = await SharedListPageBody({ params: Promise.resolve({ token: "tok" }) });
  render(el);
}

describe("/liste/[token] — indirim", () => {
  it("tarihli snapshot'ta kart indirimleri alır (normalize edilmiş)", async () => {
    listSp = { start: "2026-11-10", end: "2026-11-15", guests: 2 };
    await renderPage();
    const p = cardProps.get("v1")!;
    expect(p.stayStart).toBe("2026-11-10");
    expect(p.stayDiscounts).toEqual([
      {
        start_date: "2026-11-01",
        end_date: "2026-11-30",
        discount_type: "percent",
        discount_value: 20,
        currency: null,
      },
    ]);
  });

  it("tarihsiz snapshot'ta indirim prop'u geçmez (eski davranış)", async () => {
    listSp = null;
    await renderPage();
    const p = cardProps.get("v1")!;
    expect(p.stayDiscounts).toBeUndefined();
    expect(p.prices).toBeUndefined();
  });
});
