import { describe, it, expect, vi, beforeEach } from "vitest";
/* ===============================================================
   🛡️ FİYAT KAPSAMI — SUNUCU (POST /api/public/reservations)
   ===============================================================
   UI ile BİREBİR aynı kural (`rangeHasUnpricedDay`): [giriş, çıkış]
   içinde (checkout günü DAHİL) fiyatsız gün varsa rezervasyon
   OLUŞTURULMAZ; mevcut hata zarfı + mesaj + 400 aynen.
   Fiyat motoru / tutarlar DEĞİŞMEZ (gerçek motor çalışır).
   Örnek: 30 Kas fiyatlı · 1 Ara fiyatsız · 2 Ara fiyatlı (2027).
   =============================================================== */
const findVillaCleaningConfig = vi.fn();
const getVillaPrices = vi.fn();
const getExchangeRatesMap = vi.fn();
const getPublicSettings = vi.fn();
const getVillaDiscounts = vi.fn();
const createReservation = vi.fn();
const verifyStay = vi.fn();

vi.mock("@/lib/db/reservation.repository", () => ({
  reservationRepository: {
    findVillaCleaningConfig: (...a: unknown[]) => findVillaCleaningConfig(...a),
  },
}));
vi.mock("@/app/services/villa-price.service", () => ({
  getVillaPrices: (...a: unknown[]) => getVillaPrices(...a),
}));
vi.mock("@/app/services/exchange-rate.service", () => ({
  getExchangeRatesMap: (...a: unknown[]) => getExchangeRatesMap(...a),
}));
vi.mock("@/app/services/settings.service", () => ({
  getPublicSettings: (...a: unknown[]) => getPublicSettings(...a),
}));
vi.mock("@/app/services/villa-discount.service", () => ({
  getVillaDiscounts: (...a: unknown[]) => getVillaDiscounts(...a),
}));
vi.mock("@/app/services/reservation.service", () => ({
  createReservation: (...a: unknown[]) => createReservation(...a),
}));
vi.mock("@/lib/db/reservation.repository.server", () => ({
  reservationServerRepository: { insert: vi.fn() },
}));
vi.mock("@/app/services/reservation/_helpers/stay-verify", () => ({
  verifyPublicReservationStayRules: (...a: unknown[]) => verifyStay(...a),
}));
vi.mock("@/lib/rate-limit", () => ({
  applyRateLimit: async () => null,
}));

import { POST } from "@/app/api/public/reservations/route";
import {
  recomputePublicReservationPrice,
  verifyPublicReservationPrice,
} from "@/app/services/reservation/_helpers/price-verify";
import type { ReservationCreateInput } from "@/app/services/reservation/types";
import { SEC06_RATES, SEC06_BASE_VILLA } from "./_sec06-price-scenarios";

type Json = Record<string, unknown>;
const PRICES = [
  { start_date: "2027-11-01", end_date: "2027-11-30", price: 7000, currency: "TRY" },
  { start_date: "2027-12-02", end_date: "2027-12-31", price: 9000, currency: "TRY" },
];
const ERR = "Seçilen tarihler için fiyat hesaplanamadı";

function body(start: string, end: string): Json {
  return {
    villa_id: "villa-cov",
    start_date: start,
    end_date: end,
    name: "Coverage Test",
    phone: "+905551112233",
    phone2: "+905551112244",
    email: "t@example.test",
    guests: 2,
    total_price: 1,
    total_price_try: 1,
    prepayment_amount: 1,
    remaining_payment: 0,
    paid_amount: 0,
    damage_deposit: 0,
    payment_preference: "prepayment",
  };
}
async function post(b: Json) {
  const res = await POST(
    new Request("http://localhost/api/public/reservations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(b),
    })
  );
  return { status: res.status, json: (await res.json()) as Json };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  findVillaCleaningConfig.mockResolvedValue({
    data: { ...SEC06_BASE_VILLA, deposit: 0 },
    error: null,
  });
  getVillaPrices.mockResolvedValue(PRICES);
  getExchangeRatesMap.mockResolvedValue({ rates: SEC06_RATES, updatedAt: null });
  getPublicSettings.mockResolvedValue({ prepayment_rate: 20 });
  getVillaDiscounts.mockResolvedValue([]);
  verifyStay.mockResolvedValue(undefined);
  createReservation.mockResolvedValue({ id: "r1", reservation_no: "TY-1" });
});

describe("POST /api/public/reservations — fiyatsız gün reddi", () => {
  it.each([
    ["30 Kas → 1 Ara (fiyatsız checkout)", "2027-11-30", "2027-12-01"],
    ["1 Ara → 2 Ara (fiyatsız giriş gecesi)", "2027-12-01", "2027-12-02"],
    ["30 Kas → 2 Ara (arada fiyatsız gün)", "2027-11-30", "2027-12-02"],
    ["25 Kas → 3 Ara (uzun aralık, arada fiyatsız)", "2027-11-25", "2027-12-03"],
  ])("%s → 400, mevcut hata zarfı, INSERT YOK", async (_l, s, e) => {
    const r = await post(body(s, e));
    expect(r.status).toBe(400);
    expect(r.json).toEqual({ ok: false, error: ERR });
    expect(createReservation).not.toHaveBeenCalled();
  });

  it("tamamen fiyatlı 28 → 30 Kas → 200; tutarlar motorla AYNI (2 gece, checkout hariç)", async () => {
    const r = await post(body("2027-11-28", "2027-11-30"));
    expect(r.status).toBe(200);
    const row = createReservation.mock.calls[0][0] as Json;
    expect(row.total_price_try).toBe(14000);
  });

  it("tamamen fiyatlı 2 → 5 Ara → 200", async () => {
    const r = await post(body("2027-12-02", "2027-12-05"));
    expect(r.status).toBe(200);
    expect((createReservation.mock.calls[0][0] as Json).total_price_try).toBe(27000);
  });
});

describe("price-verify — hesap DEĞİŞMEDİ, yalnız uygunluk bayrağı", () => {
  it("30 Kas → 1 Ara: motor hâlâ 1 gece / 7000 hesaplar; hasUnpricedDay=true", async () => {
    const r = await recomputePublicReservationPrice({
      villa_id: "villa-cov",
      start_date: "2027-11-30",
      end_date: "2027-12-01",
    });
    expect(r!.priceAvailable).toBe(true);
    expect(r!.totalPriceTry).toBe(7000);
    expect(r!.hasUnpricedDay).toBe(true);
  });

  it("verifyPublicReservationPrice → priceUnavailable (mevcut red sinyali)", async () => {
    const v = await verifyPublicReservationPrice({
      villa_id: "villa-cov",
      start_date: "2027-11-30",
      end_date: "2027-12-01",
    } as ReservationCreateInput);
    expect(v.priceUnavailable).toBe(true);
    expect(v.authoritative).toBeNull();
  });

  it("tamamen fiyatlı aralık → hasUnpricedDay=false, authoritative dolu", async () => {
    const v = await verifyPublicReservationPrice({
      villa_id: "villa-cov",
      start_date: "2027-11-28",
      end_date: "2027-11-30",
    } as ReservationCreateInput);
    expect(v.priceUnavailable).toBe(false);
    expect(v.authoritative?.total_price_try).toBe(14000);
  });
});
