/* ===============================================================
   🛡️ İNDİRİMLİ KART CTA — "Hemen Rezervasyon Yap" TARİH TAŞIMA KİLİDİ
   ===============================================================
   Ana sayfa "İndirimli Kiralık Villalar" kartındaki CTA, villa_discounts
   kaydının tarihlerini /rezervasyon sayfasına ÖN-SEÇİLİ olarak taşımalı.

   BU TEST ŞUNLARI KİLİTLER:
     1) URL standardı: /rezervasyon/<slug>?start=&end=  (ShortGaps +
        useBookingEngine ile AYNI param adları — yeni sözleşme yok).
     2) TARİH SEMANTİĞİ: villa_discounts KAPALI interval (end_date = son
        indirimli GECE) → checkout = end_date + 1 gün. Aksi halde son
        indirimli gece kaybolur.
     3) Locale önekleri (/en, /de) doğru.
     4) Bozuk/eksik veride MEVCUT davranışa (villa detayı) düşüş.
     5) discount variant DIŞINDA hiçbir şey değişmedi.
=============================================================== */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const pushSpy = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushSpy, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/",
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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

type DiscountProp = {
  start_date: string;
  end_date: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  currency: string | null;
};

const BASE_DISCOUNT: DiscountProp = {
  start_date: "2026-10-08",
  end_date: "2026-10-14",
  discount_type: "percent",
  discount_value: 20,
  currency: null,
};

function renderDiscountCard(opts?: {
  discount?: DiscountProp | null;
  slug?: string;
  locale?: "tr" | "en" | "de";
}) {
  render(
    <VillaCard
      variant="discount"
      id="v-1"
      slug={opts?.slug ?? "ornek-villa"}
      title="Örnek Villa"
      location="Kaş"
      price={10000}
      currency="TRY"
      images={[]}
      bedrooms={3}
      bathrooms={2}
      guests={6}
      discount={opts?.discount === undefined ? BASE_DISCOUNT : opts.discount}
      locale={opts?.locale ?? "tr"}
    />
  );
}

/** CTA butonunu metniyle bulur (tasarım/diğer butonlar değişmeden). */
function clickCta(label = "Hemen Rezervasyon Yap") {
  const btn = screen.getByRole("button", { name: label });
  fireEvent.click(btn);
  return btn;
}

describe("İndirimli kart CTA — fırsat tarihlerini rezervasyona taşır", () => {
  beforeEach(() => {
    pushSpy.mockReset();
  });

  it("1) TR: /rezervasyon/<slug>?start=&end= adresine gider", () => {
    renderDiscountCard();
    clickCta();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-15"
    );
  });

  it("2) SEMANTİK: checkout = end_date + 1 gün (son indirimli gece KAYBOLMAZ)", () => {
    renderDiscountCard();
    clickCta();
    const url = new URL(pushSpy.mock.calls[0][0] as string, "https://x.test");
    const start = url.searchParams.get("start")!;
    const end = url.searchParams.get("end")!;
    // villa_discounts [08..14] kapalı interval = 7 gece
    const nights =
      (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
    expect(nights).toBe(7);
    expect(end).toBe("2026-10-15");
    // Regresyon: end_date'in AYNEN taşınması YANLIŞTIR (6 gece olurdu).
    expect(end).not.toBe("2026-10-14");
  });

  it("3) Tek günlük indirim → 1 gece", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-08", end_date: "2026-10-08" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-09"
    );
  });

  it("4) Ay/yıl sınırını doğru aşar (31 Aralık → 1 Ocak)", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-12-28", end_date: "2026-12-31" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/rezervasyon/ornek-villa?start=2026-12-28&end=2027-01-01"
    );
  });

  it("5) EN locale → /en/rezervasyon/...", () => {
    renderDiscountCard({ locale: "en" });
    clickCta("Book Now");
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/en/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-15"
    );
  });

  it("6) DE locale → /de/rezervasyon/...", () => {
    renderDiscountCard({ locale: "de" });
    const btn = screen.getAllByRole("button").find((b) =>
      (b.textContent || "").trim().length > 0 &&
      (b.getAttribute("class") || "").includes("bg-[#ED7926]")
    )!;
    fireEvent.click(btn);
    expect(pushSpy.mock.calls[0][0]).toBe(
      "/de/rezervasyon/ornek-villa?start=2026-10-08&end=2026-10-15"
    );
  });

  it("7) discount YOKSA → MEVCUT davranış: villa detay sayfası", () => {
    renderDiscountCard({ discount: null });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
  });

  it("8) BOZUK tarih → MEVCUT davranışa düşer (asla geçersiz URL üretmez)", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "bozuk", end_date: "2026-10-14" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
  });

  it("9) TERS aralık (end < start) → MEVCUT davranışa düşer", () => {
    renderDiscountCard({
      discount: { ...BASE_DISCOUNT, start_date: "2026-10-14", end_date: "2026-10-08" },
    });
    clickCta();
    expect(pushSpy.mock.calls[0][0]).toBe("/kiralik-villa/ornek-villa");
  });

  it("10) CTA tasarımı DEĞİŞMEDİ — turuncu marka butonu aynı sınıflarla duruyor", () => {
    renderDiscountCard();
    const btn = screen.getByRole("button", { name: "Hemen Rezervasyon Yap" });
    const cls = btn.getAttribute("class") || "";
    expect(cls).toContain("bg-[#ED7926]");
    expect(cls).toContain("h-11");
    expect(cls).toContain("rounded-xl");
    expect(btn.getAttribute("type")).toBe("button");
  });

  it("11) DEFAULT variant (indirimsiz liste kartı) DEĞİŞMEDİ", () => {
    render(
      <VillaCard
        id="v-2"
        slug="baska-villa"
        title="Başka Villa"
        location="Fethiye"
        price={5000}
        currency="TRY"
        images={[]}
        bedrooms={2}
        bathrooms={1}
        guests={4}
        locale="tr"
      />
    );
    // default variant'ta "Hemen Rezervasyon Yap" CTA'sı HİÇ render edilmez.
    expect(
      screen.queryByRole("button", { name: "Hemen Rezervasyon Yap" })
    ).toBeNull();
  });
});
