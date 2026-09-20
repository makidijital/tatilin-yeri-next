/* ===============================================================
   🛡️ /arama MÜSAİTLİK MODALI — GÜNLÜK İNDİRİMLİ FİYAT
   ===============================================================
   Modal, engine girdilerini `/api/public/villas/[id]/availability`
   route'undan alır. Bu turda route'a MEVCUT public servis
   (`getVillaDiscounts`) üzerinden `discounts` alanı EKLENDİ →
   modal takvimi villa detay takvimiyle AYNI indirimli günlük fiyat
   görünümünü kullanır (üstü çizili normal + indirimli).

   Değerler price.engine'in ZATEN export ettiği fonksiyonlardan gelir
   (`getActiveDiscount` → `applyDiscountToDailyPrice`); bu dosya yeni
   indirim formülü İÇERMEZ ve kaynak kilidiyle bunu doğrular.

   Harness: `VillaCardBookingModal.pool-heating.test.tsx` deseni
   (fetch stub + settings mock, gerçek network YOK).
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import VillaCardBookingModal from "@/app/components/villa/VillaCardBookingModal";
import type { DiscountRange } from "@/lib/price.engine";

const NIGHTLY = 10000;

/* Görünüm testleri takvimin AÇILDIĞI ay üzerinden yapılır (navigasyon
   gerekmez; fiyat gösterimi geçmiş günlerde de aynıdır). */
const NOW = new Date();
const Y = NOW.getFullYear();
const M = String(NOW.getMonth() + 1).padStart(2, "0");
/* Tarih hidrasyonu testi için gelecek ay (seçilebilir aralık). */
const FUTURE = new Date(NOW.getFullYear(), NOW.getMonth() + 2, 1);
const FY = FUTURE.getFullYear();
const FM = String(FUTURE.getMonth() + 1).padStart(2, "0");

/** Ayın 8–12'si %20 indirimli; kalan günler indirimsiz. */
const PARTIAL_DISCOUNT: DiscountRange[] = [
  {
    start_date: `${Y}-${M}-08`,
    end_date: `${Y}-${M}-12`,
    discount_type: "percent",
    discount_value: 20,
    currency: null,
  },
];

/** %0 → indirimli = normal (sahte indirim senaryosu). */
const ZERO_DISCOUNT: DiscountRange[] = [
  {
    start_date: `${Y}-${M}-01`,
    end_date: `${Y}-${M}-28`,
    discount_type: "percent",
    discount_value: 0,
    currency: null,
  },
];

function availabilityResponse(discounts?: DiscountRange[]) {
  return {
    config: {
      deposit: 0,
      cleaning_fee: 0,
      cleaning_currency: "TRY",
      cleaning_limit: 0,
      custom_prepayment_rate: 20,
      minimum_stay_nights: null,
      pool_heating_fee: null,
      pool_heating_currency: "TRY",
      pool_heating_months: null,
    },
    prices: [
      {
        price: NIGHTLY,
        currency: "TRY",
        start_date: "2020-01-01",
        end_date: "2035-12-31",
      },
    ],
    externalBlocks: { checkin: [], checkout: [], middle: [] },
    ...(discounts ? { discounts } : {}),
  };
}

function mockFetch(discounts?: DiscountRange[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/availability")) {
        return { ok: true, json: async () => availabilityResponse(discounts) };
      }
      if (url.includes("/blocked-ranges")) {
        return { ok: true, json: async () => ({ ok: true, ranges: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch
  );
}

async function openModal(discounts?: DiscountRange[]) {
  mockFetch(discounts);
  const r = render(
    <VillaCardBookingModal
      isOpen={true}
      onClose={vi.fn()}
      villaId="v1"
      villaSlug="test-villa"
      villaTitle="Test Villa"
    />
  );
  await screen.findByText("Tarih seç");
  await waitFor(() => expect(dayCellText(r.container, 9)).not.toBe(""));
  return r;
}

function dayCellText(container: HTMLElement, day: number): string {
  const cells = Array.from(container.querySelectorAll('[role="gridcell"]'));
  const pattern = new RegExp(`^${day}(₺|$)`);
  return cells.find((el) => pattern.test(el.textContent || ""))?.textContent || "";
}

function struckTexts(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*"))
    .filter(
      (el) => (el as HTMLElement).style?.textDecoration === "line-through"
    )
    .map((el) => el.textContent || "");
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("/arama modal takvimi — indirimli günlük fiyat", () => {
  it("1) API `discounts` DÖNMEZSE mevcut tek-fiyat görünümü (eski davranış)", async () => {
    const { container } = await openModal();
    expect(dayCellText(container, 9)).toBe("9₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("2) %20 indirimli günde üstü çizili ₺10.000 + ₺8.000", async () => {
    const { container } = await openModal(PARTIAL_DISCOUNT);
    const text = dayCellText(container, 9);
    expect(text).toContain("₺10.000");
    expect(text).toContain("₺8.000");
    expect(struckTexts(container).join(" ")).toContain("₺10.000");
  });

  it("3) indirimsiz günler TEK fiyat olarak kalır (gün bazlı doğruluk)", async () => {
    const { container } = await openModal(PARTIAL_DISCOUNT);
    expect(dayCellText(container, 8)).toContain("₺8.000");
    expect(dayCellText(container, 12)).toContain("₺8.000");
    expect(dayCellText(container, 13)).toBe("13₺10.000");
  });

  it("4) sahte indirim (fiyat eşit) → üstü çizili YOK", async () => {
    const { container } = await openModal(ZERO_DISCOUNT);
    expect(dayCellText(container, 9)).toBe("9₺10.000");
    expect(struckTexts(container)).toHaveLength(0);
  });

  it("5) 🔒 URL'den gelen tarihler HÂLÂ seçili açılır (önceki geliştirme)", async () => {
    mockFetch(PARTIAL_DISCOUNT);
    const start = `${FY}-${FM}-08`;
    const end = `${FY}-${FM}-11`;
    render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="test-villa"
        villaTitle="Test Villa"
        initialStart={start}
        initialEnd={end}
      />
    );
    const label = (d: Date) =>
      d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
    const expected = `${label(new Date(FY, FUTURE.getMonth(), 8))} – ${label(
      new Date(FY, FUTURE.getMonth(), 11)
    )}`;
    expect(await screen.findByText(expected)).toBeInTheDocument();
  });
});

describe("kaynak kilidi — veri akışı ve motor", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("6) availability route MEVCUT `getVillaDiscounts` servisini kullanır", () => {
    const route = codeOnly(
      read("app/api/public/villas/[id]/availability/route.ts")
    );
    expect(route).toMatch(/getVillaDiscounts\(id\)/);
    /* Mevcut response alanları KORUNDU. */
    expect(route).toMatch(/config,/);
    expect(route).toMatch(/prices: safePrices,/);
    expect(route).toMatch(/externalBlocks:/);
    /* Yeni repository/sorgu türemedi. */
    expect(route).not.toMatch(/villaDiscountRepository/);
    expect(route).not.toMatch(/from\("villa_discounts"\)/);
  });

  it("7) modal, engine'in MEVCUT `discounts` parametresini kullanır", () => {
    const modal = codeOnly(
      read("app/components/villa/VillaCardBookingModal.tsx")
    );
    expect(modal).toMatch(/discounts: apiData\.discounts \?\? \[\]/);
    /* Modalde fiyat motoru çağrısı YOK (hesap engine'de). */
    expect(modal).not.toMatch(/calculateGrandTotal\(/);
    expect(modal).not.toMatch(/applyDiscountToDailyPrice\(/);
  });

  it("8) price.engine.ts'e DOKUNULMADI", () => {
    const engine = read("lib/price.engine.ts");
    expect(engine).toMatch(/discounts = null,/);
    expect(engine).toMatch(/export const applyDiscountToDailyPrice/);
    expect(engine).toMatch(/export const getActiveDiscount/);
  });

  it("9) admin fiyat takvimi indirim gösterimi MEVCUT haliyle duruyor", () => {
    /* PricingCalendarCanvas / DiscountCalendarCanvas ortak hücresi —
       bu turda DOKUNULMADI, yalnız varlığı kilitlenir. */
    const dayCell = read(
      "app/components/admin/villa/pricing-calendar/_components/DayCell.tsx"
    );
    expect(dayCell).toMatch(/textDecoration: "line-through"/);
    expect(dayCell).toMatch(/discountedPrice/);
  });
});
