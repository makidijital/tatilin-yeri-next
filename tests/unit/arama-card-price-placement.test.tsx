/* ===============================================================
   🛡️ /arama VillaCard — FİYAT GÖSTERİM KONUMU (UI-only regresyon)
   ===============================================================
   DEĞİŞİKLİK: tarih seçiliyken hesaplanan konaklama TOPLAMI artık
   yalnız CONTENT AREA'daki fiyat alanında ("başlayan fiyatlarla" /
   "Fiyat sorunuz" alanı) gösterilir; müsaitlik CTA'sının yanındaki
   ikinci gösterim KALDIRILDI.

   ⚠️ Bu test SADECE KONUMU kilitler. Fiyatın NASIL hesaplandığı
   (price.engine / indirim / kur / temizlik) DEĞİŞMEDİ ve burada
   gerçek motor çalışır — mock'lanan tek şey kart çevresidir.
=============================================================== */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { tr } from "@/lib/i18n/dictionaries/tr";
import type { DiscountRange } from "@/lib/price.engine";

/* ---------------- VillaCard çevre mock'ları (kart testinin deseni) -------- */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/arama",
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("next/image", () => ({
  /* eslint-disable-next-line @next/next/no-img-element */
  default: ({ alt }: { alt?: string }) => <img alt={alt ?? ""} />,
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: { TRY: 1 } }),
}));

import VillaCard from "@/app/components/villa/VillaCard";

/* ---------------- fixtures — 08.10 → 11.10 = 3 GECE ---------------- */
const START = "2026-10-08";
const END = "2026-10-11";
const NIGHTLY = 10000;
const PRICES = [
  {
    price: NIGHTLY,
    currency: "TRY",
    start_date: "2026-10-01",
    end_date: "2026-10-31",
  },
];
const DISCOUNTS: DiscountRange[] = [
  {
    start_date: "2026-10-01",
    end_date: "2026-10-31",
    discount_type: "percent",
    discount_value: 20,
    currency: null,
  },
];

function renderCard(opts: {
  withDates?: boolean;
  discounts?: DiscountRange[];
  prices?: typeof PRICES;
  price?: number | null;
} = {}) {
  const withDates = opts.withDates ?? true;
  return render(
    <VillaCard
      id="v-1"
      slug="test-villa"
      title="Test Villa"
      location="Kalkan"
      price={opts.price === undefined ? NIGHTLY : (opts.price as number)}
      currency="TRY"
      stayStart={withDates ? START : undefined}
      stayEnd={withDates ? END : undefined}
      prices={opts.prices === undefined ? PRICES : opts.prices}
      stayDiscounts={opts.discounts}
      cleaningFee={0}
      cleaningCurrency="TRY"
      cleaningLimit={0}
    />
  );
}

/** Müsaitlik CTA butonunu içeren satırın metni. */
function availabilityRowText(): string {
  const btn = screen.getByLabelText(tr.card.availabilityAriaLabel);
  return btn.parentElement?.textContent || "";
}

/** Fiyat alanı = CONTENT AREA'daki tek `<p>` fiyat satırı. */
function priceAreaText(container: HTMLElement): string {
  const el = Array.from(container.querySelectorAll("p")).find((p) =>
    /\d/.test(p.textContent || "")
  );
  return el?.textContent || "";
}

describe("A) tarih seçili — toplam YALNIZ fiyat alanında", () => {
  it("1) 3 gecelik toplam (30.000) fiyat alanında gösterilir", () => {
    const { container } = renderCard();
    expect(priceAreaText(container)).toMatch(/30\.000/);
  });

  it("2) gece sayısı bilgisi toplamla BİRLİKTE fiyat alanında", () => {
    const { container } = renderCard();
    expect(priceAreaText(container)).toContain("3 gece");
  });

  it("3) 🔒 müsaitlik CTA'sının yanında ARTIK fiyat YOK", () => {
    renderCard();
    const row = availabilityRowText();
    expect(row).not.toMatch(/30\.000/);
    expect(row).not.toMatch(/gece/);
  });

  it("4) toplam kartta TEK KEZ görünür (çift gösterim yok)", () => {
    expect(renderCard().container.textContent?.match(/30\.000/g) || []).toHaveLength(1);
  });
});

describe("B) tarih yok — mevcut davranış BİREBİR", () => {
  it("5) 'başlayan fiyatlarla' + gecelik fiyat aynen", () => {
    const { container } = renderCard({ withDates: false });
    const text = priceAreaText(container);
    expect(text).toMatch(/10\.000/);
    expect(text).toContain(tr.card.startingFromLower);
  });

  it("6) fiyat yoksa 'Fiyat sorunuz' aynen", () => {
    const { container } = renderCard({ withDates: false, price: 0 });
    expect(container.textContent).toContain(tr.card.priceOnRequest);
  });
});

describe("C/D) indirim ve hesaplanamayan fiyat", () => {
  it("7) indirimli villa — motorun İNDİRİMLİ toplamı (24.000) fiyat alanında", () => {
    /* 3 × 10.000 = 30.000 → %20 indirim → 24.000. Motor DEĞİŞMEDİ. */
    const { container } = renderCard({ discounts: DISCOUNTS });
    expect(priceAreaText(container)).toMatch(/24\.000/);
    expect(container.textContent).not.toMatch(/30\.000/);
  });

  it("8) fiyat kaydı yoksa (prices: []) mevcut fallback korunur", () => {
    /* stayTotal hesaplanamaz → kart eski "başlayan fiyatlarla"
       davranışına düşer; YENİ bir fallback ÜRETİLMEDİ. */
    const { container } = renderCard({ prices: [] });
    const text = priceAreaText(container);
    expect(text).toContain(tr.card.startingFromLower);
    expect(availabilityRowText()).not.toMatch(/\d/);
  });

  it("9) fiyat kaydı yok + price yok → 'Fiyat sorunuz'", () => {
    const { container } = renderCard({ prices: [], price: 0 });
    expect(container.textContent).toContain(tr.card.priceOnRequest);
  });
});

describe("E) motor dokunulmazlığı — kaynak kilidi", () => {
  const codeOnly = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("10) 🔒 kartta hâlâ TEK `calculateGrandTotal` çağrısı var", () => {
    const card = codeOnly(
      readFileSync(
        join(process.cwd(), "app/components/villa/VillaCard.tsx"),
        "utf-8"
      )
    );
    expect((card.match(/calculateGrandTotal\(/g) || []).length).toBe(1);
    /* Motorun opsiyonel `discounts` parametresi hâlâ aktarılıyor. */
    expect(card).toMatch(/discounts:\s*stayDiscounts/);
  });

  it("11) 🔒 price.engine.ts'e DOKUNULMADI (imza + discount default)", () => {
    const engine = readFileSync(
      join(process.cwd(), "lib/price.engine.ts"),
      "utf-8"
    );
    expect(engine).toMatch(/discounts = null,/);
    expect(engine).toMatch(/discounts\?:\s*DiscountRange\[\]\s*\|\s*null;/);
  });

  it("12) 🔒 diğer variant'ların (curation/discount) fiyat bloğu DURUYOR", () => {
    const card = readFileSync(
      join(process.cwd(), "app/components/villa/VillaCard.tsx"),
      "utf-8"
    );
    /* Curation: "TOPLAM" eyebrow'lu blok; Discount: gecelik gösterim. */
    expect(card).toContain("dict.card.total");
    expect(card).toContain("dict.card.nightly");
  });
});
