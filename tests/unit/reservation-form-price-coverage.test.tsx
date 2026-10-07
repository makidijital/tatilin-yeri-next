/* ===============================================================
   🛡️ /rezervasyon formu — FİYAT KAPSAMI (rezervasyon akışı)
   ===============================================================
   Takvimlerle AYNI seçim kuralı: [giriş, çıkış] içinde (checkout
   günü dahil) fiyatsız gün varsa form GÖNDERİLEMEZ ve mevcut
   "fiyat tanımlı değil" uyarısı görünür. Fiyat HESABI değişmez.
   Örnek: 30 Kas fiyatlı · 1 Ara fiyatsız · 2 Ara fiyatlı.
=============================================================== */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/app/context/CurrencyContext", () => ({
  useCurrency: () => ({ currency: "TRY", rates: {}, setCurrency: vi.fn() }),
}));
vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 20 })),
}));
vi.mock("@/lib/cache.helpers", () => ({
  getCachedSettings: vi.fn(async () => ({ phone: "", whatsapp_link: "", updated_at: null })),
}));
vi.mock("@/lib/storage.helpers", () => ({
  resolveVillaImageUrl: (u: string | null | undefined) => u || null,
  resolveAssetUrlVersioned: (u: string | null | undefined) => u || null,
}));

import ReservationForm from "@/app/components/reservation/ReservationForm";

const YY = new Date().getFullYear() + 1;
const k = (m: number, d: number) =>
  `${YY}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const PRICES = [
  { start_date: k(11, 1), end_date: k(11, 30), price: 7000, currency: "TRY" },
  { start_date: k(12, 2), end_date: k(12, 31), price: 9000, currency: "TRY" },
];
const VILLA = {
  id: "villa-1",
  slug: "test-villa",
  title: "Test Villa",
  cleaning_fee: 0,
  cleaning_currency: "TRY",
  cleaning_limit: 0,
  pool_heating_fee: 0,
  pool_heating_currency: "TRY",
  pool_heating_months: null,
};
const NOTICE = /fiyat tanımlı değil/;

function renderForm(start: string, end: string) {
  const props: Record<string, unknown> = {
    villa: VILLA,
    prices: PRICES,
    discounts: [],
    start,
    end,
    image: "/cover.jpg",
    adults: "2",
    children: "0",
    poolHeatingSelected: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<ReservationForm {...(props as any)} />);
}

describe("ReservationForm — fiyat kapsamı", () => {
  it.each([
    ["30 Kas → 1 Ara (fiyatsız checkout)", k(11, 30), k(12, 1)],
    ["1 Ara → 2 Ara", k(12, 1), k(12, 2)],
    ["30 Kas → 2 Ara (arada fiyatsız gün)", k(11, 30), k(12, 2)],
  ])("%s → uyarı görünür (gönderim engelli)", (_l, s, e) => {
    renderForm(s, e);
    expect(screen.getByText(NOTICE)).toBeTruthy();
  });

  it("tamamen fiyatlı 28 → 30 Kas → uyarı YOK (mevcut akış)", () => {
    renderForm(k(11, 28), k(11, 30));
    expect(screen.queryByText(NOTICE)).toBeNull();
  });
});
