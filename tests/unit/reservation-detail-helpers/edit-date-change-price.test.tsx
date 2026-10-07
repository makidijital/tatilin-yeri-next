/* ===============================================================
   🛡️ ADMIN REZERVASYON DÜZENLEME — TARİH DEĞİŞİMİ ↔ ANLIK ÖZET
   ===============================================================
   A) Normal fiyat: 10–15 → 20–25 → 10–15 ⇒ 50.000 → 60.000 → 50.000
      (geri dönüşte ORİJİNAL KAYITLI fiyat; motor 45.000 hesaplardı).
   B/C) Özel fiyat: tarih değişse de değer AYNI, motor çalışmaz, uyarı
      görünür, özel fiyat kapanmaz; tekrar değişimde uyarı devam eder.
   D) Kayıt: PATCH güncel değerlerle gider, sayfa yeniden yüklenir;
      yeni oturumda orijinal = kaydedilen değerler (stale state yok).
   Fiyat motoru / ödeme / özel fiyat mantığı DEĞİŞMEDİ.
=============================================================== */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";

import { computeReservationPriceRecalc } from "@/app/(admin)/maki-admin/reservations/[id]/_helpers/computeReservationPriceRecalc";
import type { ReservationDetailData } from "@/app/(admin)/maki-admin/reservations/[id]/_types/reservation-form-data";

const WARNING =
  "Özel fiyat aktif — fiyat yeni tarihlere göre otomatik hesaplanmıyor.";

/* 10–17 Eki 9.000/gece (motor: 10–15 = 45.000) · 18–31 Eki 12.000/gece
   (20–25 = 60.000). Orijinal KAYITLI toplam 50.000 (motordan farklı →
   geri dönüşte snapshot kullanıldığı kanıtlanır). */
const PRICES = [
  { start_date: "2027-10-01", end_date: "2027-10-17", price: 9000, currency: "TRY" },
  { start_date: "2027-10-18", end_date: "2027-10-31", price: 12000, currency: "TRY" },
];

const RES = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  villa_id: "v1",
  status: "confirmed",
  name: "Misafir",
  phone: "1",
  email: "a@a.com",
  guests: 2,
  guest_names: [],
  start_date: "2027-10-10",
  end_date: "2027-10-15",
  total_price: 50000,
  total_price_try: 50000,
  cleaning_fee_try: 0,
  original_price: 0,
  original_currency: "TRY",
  original_cleaning_fee: 0,
  original_cleaning_currency: "TRY",
  exchange_rate: 1,
  prepayment_amount: 10000,
  remaining_payment: 40000,
  paid_amount: 10000,
  payment_preference: "prepayment",
  custom_price: false,
  villa: { id: "v1", title: "V", cleaning_fee: 0, cleaning_currency: "TRY", cleaning_limit: 0 },
  ...over,
});

const state: { res: Record<string, unknown> } = { res: RES() };
const patchBodies: Array<Record<string, unknown>> = [];

vi.mock("@/lib/admin-fetch", () => ({
  adminFetch: (url: string, init?: { method?: string; body?: string }) => {
    if (init?.method === "PATCH") {
      patchBodies.push(JSON.parse(init.body || "{}"));
    }
    const body = url.includes("/prices")
      ? { ok: true, prices: PRICES, discounts: [] }
      : url.startsWith("/api/admin/reservations/")
        ? { ok: true, reservation: state.res }
        : url === "/api/admin/villas"
          ? { ok: true, villas: [{ id: "v1", title: "V" }] }
          : url.startsWith("/api/admin/villas/")
            ? { ok: true, villa: { id: "v1", cleaning_fee: 0, cleaning_currency: "TRY", cleaning_limit: 0 } }
            : url === "/api/admin/settings"
              ? { ok: true, settings: { prepayment_rate: 20 } }
              : { ok: true };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
  },
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/maki-admin/reservations/r1",
  useSearchParams: () => ({ get: () => null }),
}));
vi.mock(
  "@/app/(admin)/maki-admin/reservations/[id]/_effects/fetchBlockedDates.action",
  () => ({
    fetchBlockedDatesAction: () =>
      Promise.resolve({
        blocked: [], checkin: [], checkout: [], pendingCheckin: [],
        pendingCheckout: [], pendingMiddle: [], manualBlocked: [],
        manualCheckin: [], manualCheckout: [],
      }),
  })
);
vi.mock("@/lib/external-calendar.admin.action", () => ({
  fetchExternalCalendarArraysForVillaAdminAction: () =>
    Promise.resolve({
      externalCheckinDates: [], externalCheckoutDates: [],
      externalMiddleDates: [], detailByDate: {},
    }),
}));
vi.mock("@/lib/activity-log.client", () => ({ logActivity: vi.fn(() => Promise.resolve()) }));
vi.mock(
  "@/app/(admin)/maki-admin/reservations/[id]/_orchestrators/dispatchStatusChangeMail",
  () => ({ dispatchStatusChangeMail: vi.fn() })
);
vi.mock("@/app/components/admin/notifications/NotificationProvider", () => ({
  useNotify: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
  useConfirm: () => () => Promise.resolve(true),
}));
/* Takvim: yalnız onSelectRange sözleşmesi (fiyat kapsamı ayrı testlerde). */
const excludeSeen: Date[][] = [];
vi.mock("@/app/components/admin/reservation-form/ReservationCalendar", () => ({
  default: (p: {
    excludeDisabledDates: Date[];
    onSelectRange: (a: Date, b: Date, fb: Date[]) => void;
  }) => {
    excludeSeen.push(p.excludeDisabledDates);
    return (
      <>
        <button data-testid="pick-20-25" onClick={() => p.onSelectRange(new Date(2027, 9, 20), new Date(2027, 9, 25), [])}>a</button>
        <button data-testid="pick-21-24" onClick={() => p.onSelectRange(new Date(2027, 9, 21), new Date(2027, 9, 24), [])}>b</button>
        <button data-testid="pick-10-15" onClick={() => p.onSelectRange(new Date(2027, 9, 10), new Date(2027, 9, 15), [])}>c</button>
      </>
    );
  },
}));

globalThis.fetch = (() =>
  Promise.resolve({ json: () => Promise.resolve({ USD: 35, EUR: 40, GBP: 45 }) })) as never;

const reloadSpy = vi.fn();
Object.defineProperty(window, "location", {
  configurable: true,
  value: { ...window.location, reload: reloadSpy },
});

import Page from "@/app/(admin)/maki-admin/reservations/[id]/page";

const summary = () => screen.getByLabelText("Canlı fiyat özeti");
const total = () => {
  const m = summary().textContent!.match(/Toplam Tutar₺([\d.]+)/);
  return m ? m[1] : null;
};

async function openDates(res: Record<string, unknown>) {
  state.res = res;
  const utils = render(<Page />);
  const step = await screen.findAllByText(/Mülk & Tarih/);
  fireEvent.click(step[0].closest("button")!);
  await screen.findByLabelText("Canlı fiyat özeti");
  return utils;
}
async function pick(testId: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
}

beforeEach(() => {
  patchBodies.length = 0;
  reloadSpy.mockClear();
  excludeSeen.length = 0;
});

describe("A) normal fiyat — orijinale dönüşte kayıtlı fiyat", () => {
  it("10–15 → 20–25 → 10–15 ⇒ 50.000 → 60.000 → 50.000", async () => {
    await openDates(RES());
    await waitFor(() => expect(total()).toBe("50.000"));

    await pick("pick-20-25");
    await waitFor(() => expect(total()).toBe("60.000"));
    expect(summary().textContent).toContain("₺12.000"); // ön ödeme %20

    await pick("pick-10-15");
    await waitFor(() => expect(total()).toBe("50.000"));
    /* ön ödeme / girişte de ORİJİNAL kayıtlı değerler */
    expect(summary().textContent).toContain("₺10.000");
    expect(summary().textContent).toContain("₺40.000");
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("tarih hiç değişmezse uyarı yok, kayıtlı fiyat gösterilir", async () => {
    await openDates(RES());
    await waitFor(() => expect(total()).toBe("50.000"));
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("fiyat kapsamı muafiyeti: kendi günleri ORİJİNAL tarihlerden (seçim değişse de)", async () => {
    await openDates(RES());
    await pick("pick-20-25");
    await waitFor(() => expect(total()).toBe("60.000"));
    const last = excludeSeen[excludeSeen.length - 1].map((d) => d.getDate());
    expect(last).toEqual([10, 11, 12, 13, 14, 15]);
  });
});

describe("B/C) özel fiyat — korunur, yalnız uyarı", () => {
  const CUSTOM = () => RES({ custom_price: true, total_price: 50000, total_price_try: 50000 });

  it("B) 10–15 → 20–25: değer aynı, motor çalışmaz, uyarı görünür, özel fiyat açık kalır", async () => {
    await openDates(CUSTOM());
    await waitFor(() => expect(total()).toBe("50.000"));
    expect(screen.queryByText(WARNING)).toBeNull();

    await pick("pick-20-25");
    await waitFor(() => expect(screen.getByText(WARNING)).toBeTruthy());
    expect(total()).toBe("50.000"); // 60.000 DEĞİL → motor çalışmadı
    expect(summary().textContent).toContain("Özel fiyat"); // rozet → kapanmadı
  });

  it("C) tekrar tarih değişince uyarı devam eder, değer değişmez", async () => {
    await openDates(CUSTOM());
    await pick("pick-20-25");
    await waitFor(() => expect(screen.getByText(WARNING)).toBeTruthy());
    await pick("pick-21-24");
    await waitFor(() => expect(summary().textContent).toContain("21 Eki"));
    expect(screen.getByText(WARNING)).toBeTruthy();
    expect(total()).toBe("50.000");
    /* orijinal tarihe dönünce uyarı kalkar (tarih değişikliği yok) */
    await pick("pick-10-15");
    await waitFor(() => expect(screen.queryByText(WARNING)).toBeNull());
    expect(total()).toBe("50.000");
  });

  it("B) kayıt payload'ı: özel fiyat açık + değer aynı, yeni tarihler", async () => {
    await openDates(CUSTOM());
    await pick("pick-20-25");
    await waitFor(() => expect(screen.getByText(WARNING)).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByText(/Değişiklikleri Kaydet/));
    });
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({
      custom_price: true,
      total_price_try: 50000,
      start_date: "2027-10-20",
      end_date: "2027-10-25",
    });
  });
});

describe("D) kayıt sonrası stale state yok", () => {
  it("kayıt güncel değerleri yollar, sayfa yenilenir; yeni oturumun orijinali kaydedilen değerlerdir", async () => {
    const first = await openDates(RES());
    await pick("pick-20-25");
    await waitFor(() => expect(total()).toBe("60.000"));
    await act(async () => {
      fireEvent.click(screen.getByText(/Değişiklikleri Kaydet/));
    });
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({
      start_date: "2027-10-20",
      end_date: "2027-10-25",
      total_price_try: 60000,
      prepayment_amount: 12000,
      paid_amount: 10000,
    });
    await waitFor(() => expect(reloadSpy).toHaveBeenCalledTimes(1));
    first.unmount();

    /* Yeniden yükleme = yeni oturum; DB artık kaydedilen değerleri döner. */
    await openDates(
      RES({
        start_date: "2027-10-20",
        end_date: "2027-10-25",
        total_price: 60000,
        total_price_try: 60000,
        prepayment_amount: 12000,
        remaining_payment: 48000,
      })
    );
    await waitFor(() => expect(total()).toBe("60.000"));
    await pick("pick-10-15");
    await waitFor(() => expect(total()).toBe("45.000")); // motor (9.000 × 5)
    await pick("pick-20-25");
    await waitFor(() => expect(total()).toBe("60.000")); // yeni kayıtlı değer
  });
});

describe("computeReservationPriceRecalc — originalSnapshot", () => {
  const base = RES() as unknown as ReservationDetailData;
  const common = {
    prices: PRICES,
    rates: { TRY: 1 },
    originalStartDate: "2027-10-10",
    originalEndDate: "2027-10-15",
    originalVillaId: "v1",
    selectedVilla: null,
    prepaymentRate: 20,
  };

  it("data önceki recalc değerlerini taşırken orijinale dönüş → snapshot + geri yükleme patch'i", () => {
    const stale = {
      ...base,
      start_date: "2027-10-20",
      end_date: "2027-10-25",
      total_price_try: 60000,
      total_price: 60000,
      prepayment_amount: 12000,
      remaining_payment: 48000,
    } as ReservationDetailData;
    const r = computeReservationPriceRecalc({
      ...common,
      data: stale,
      startDate: new Date(2027, 9, 10),
      endDate: new Date(2027, 9, 15),
      originalSnapshot: base,
    });
    expect(r.kind).toBe("snapshot");
    if (r.kind !== "snapshot") return;
    expect(r.priceDetail.total).toBe(50000);
    expect(r.dataPatch).toMatchObject({
      start_date: "2027-10-10",
      end_date: "2027-10-15",
      total_price_try: 50000,
      prepayment_amount: 10000,
      remaining_payment: 40000,
    });
    expect(r.dataPatch).not.toHaveProperty("paid_amount");
  });

  it("tarih hiç değişmediyse dataPatch YOK (eski davranış)", () => {
    const r = computeReservationPriceRecalc({
      ...common,
      data: base,
      startDate: new Date(2027, 9, 10),
      endDate: new Date(2027, 9, 15),
      originalSnapshot: base,
    });
    expect(r).toEqual({ kind: "snapshot", priceDetail: expect.any(Object) });
    expect(r.kind === "snapshot" && r.dataPatch).toBeFalsy();
  });

  it("originalSnapshot verilmezse eski davranış (data'dan okunur)", () => {
    const stale = { ...base, start_date: "2027-10-20", end_date: "2027-10-25", total_price_try: 60000 } as ReservationDetailData;
    const r = computeReservationPriceRecalc({
      ...common,
      data: stale,
      startDate: new Date(2027, 9, 10),
      endDate: new Date(2027, 9, 15),
    });
    expect(r.kind === "snapshot" && r.priceDetail.total).toBe(60000);
    expect(r.kind === "snapshot" && r.dataPatch).toBeFalsy();
  });

  it("özel fiyatta motor çalışmaz; değer korunur", () => {
    const custom = { ...base, custom_price: true } as ReservationDetailData;
    const r = computeReservationPriceRecalc({
      ...common,
      data: custom,
      startDate: new Date(2027, 9, 20),
      endDate: new Date(2027, 9, 25),
      originalSnapshot: custom,
    });
    expect(r.kind).toBe("custom_price");
    if (r.kind !== "custom_price") return;
    expect(r.priceDetail.total).toBe(50000);
    expect(r.dataPatch).toEqual({ start_date: "2027-10-20", end_date: "2027-10-25" });
  });
});
