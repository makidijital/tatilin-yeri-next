/* ===============================================================
   🛡️ FİYAT KAPSAMI — REZERVASYON TAKVİMLERİ (public + admin)
   ===============================================================
   Ortak kural (lib/price-coverage.ts, motor semantiği):
     • günün KENDİ gecesi fiyatsızsa gün takvimde KAPALI (check-in yok)
     • YALNIZ check-in seçiliyken, [check-in, gün) tamamen fiyatlıysa
       o kapalı gün CHECKOUT olarak seçilebilir
     • [giriş, çıkış) içinde fiyatsız gece → aralık reddedilir
   Kapsam: BookingSidebar (villa detay + /v/[token]), /arama modalı,
   admin rezervasyon oluştur/düzenle (ReservationCalendar opt-in).
   Manuel blok (opt-in YOK) ve mevcut doluluk kuralları DEĞİŞMEZ.

   Ay: bugün + 2 ay (sistem saatinden bağımsız). Fiyatlar:
     01–10 fiyatlı · 11 satır yok · 12–13 fiyat 0 · 14 fiyat null
     15–28 fiyatlı
=============================================================== */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";

vi.mock("@/app/services/settings.action", () => ({
  getPublicSettingsAction: vi.fn(async () => ({ prepayment_rate: 0 })),
}));

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import VillaCardBookingModal from "@/app/components/villa/VillaCardBookingModal";
import ReservationCalendar from "@/app/components/admin/reservation-form/ReservationCalendar";
import type { ExternalCalendarStringArrays } from "@/lib/external-calendar.public.shared";

/* ---------------- tarih yardımcıları ---------------- */
const base = new Date();
base.setDate(1);
base.setMonth(base.getMonth() + 2);
const Y = base.getFullYear();
const M = base.getMonth();
const ymd = (day: number) =>
  `${Y}-${String(M + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const dt = (day: number) => new Date(Y, M, day);

const PRICES = [
  { price: 5000, currency: "TRY", start_date: ymd(1), end_date: ymd(10) },
  { price: 0, currency: "TRY", start_date: ymd(12), end_date: ymd(13) },
  { price: null as unknown as number, currency: "TRY", start_date: ymd(14), end_date: ymd(14) },
  { price: 6000, currency: "TRY", start_date: ymd(15), end_date: ymd(28) },
];

const TR_PRICE_NOTICE = /fiyat tanımlı değil/;

type Range = {
  kind: "reservation" | "manual";
  status: string | null;
  start_date: string;
  end_date: string;
};
let ranges: Range[] = [];
let external: ExternalCalendarStringArrays = { checkin: [], checkout: [], middle: [] };

const hrefSet = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  hrefSet.mockReset();
  ranges = [];
  external = { checkin: [], checkout: [], middle: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/availability")) {
        return {
          ok: true,
          json: async () => ({
            config: {
              deposit: 0,
              cleaning_fee: 0,
              cleaning_currency: "TRY",
              cleaning_limit: 0,
              custom_prepayment_rate: 0,
              minimum_stay_nights: null,
              pool_heating_fee: null,
              pool_heating_currency: "TRY",
              pool_heating_months: null,
            },
            prices: PRICES,
            externalBlocks: external,
          }),
        };
      }
      if (url.includes("/blocked-ranges")) {
        return { ok: true, json: async () => ({ ok: true, ranges }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch
  );
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...originalLocation,
      get href() {
        return "http://localhost/";
      },
      set href(v: string) {
        hrefSet(v);
      },
    },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  vi.unstubAllGlobals();
});

/* RDP gün hücresi: metin "9₺5.000" ya da fiyatsızsa yalnız "12". */
async function dayCell(n: number) {
  const cells = await screen.findAllByRole("gridcell");
  const cell = cells.find((el) =>
    new RegExp(`^${n}(?!\\d)`).test(el.textContent || "")
  );
  if (!cell) throw new Error(`gün ${n} yok`);
  return cell as HTMLButtonElement;
}
const isDisabled = (el: HTMLElement) =>
  el.hasAttribute("disabled") || el.className.includes("rdp-day_disabled");

/* ===============================================================
   ENGINE
   =============================================================== */
describe("useBookingEngine — ortak fiyat kuralı", () => {
  function engine(extra: Partial<Parameters<typeof useBookingEngine>[0]> = {}) {
    return renderHook(() =>
      useBookingEngine({ villaSlug: "v", villaId: "v1", prices: PRICES, ...extra })
    );
  }

  it("1/2/11/12/13) seçim yokken: fiyatsız gün kapalı (11 dahil), fiyatlı gün açık", () => {
    const { result } = engine();
    const closed = (n: number) => result.current.isPriceClosedDay(dt(n));
    expect(closed(9)).toBe(false);
    expect(closed(10)).toBe(false);
    expect(closed(11)).toBe(true); // sezon sonrası ilk gün → check-in KAPALI
    expect(closed(12)).toBe(true); // fiyat 0
    expect(closed(13)).toBe(true); // fiyat 0
    expect(closed(14)).toBe(true); // fiyat null
    expect(closed(15)).toBe(false);
  });

  it("7/14) check-in 10 seçiliyken 11 CHECKOUT için açılır; 12 kapalı kalır", async () => {
    const { result } = engine();
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    act(() => result.current.setStartDate(dt(10)));
    const closed = (n: number) => result.current.isPriceClosedDay(dt(n));
    expect(closed(11)).toBe(false);
    expect(closed(12)).toBe(true);
    expect(closed(9)).toBe(false); // fiyatlı gün her zaman açık
    /* check-in 9 → 11 de checkout olabilir (9, 10 geceleri fiyatlı) */
    act(() => result.current.setStartDate(dt(9)));
    expect(result.current.isPriceClosedDay(dt(11))).toBe(false);
    /* aralık tamamlanınca istisna biter → 11 yine kapalı */
    act(() => result.current.setEndDate(dt(11)));
    expect(result.current.isPriceClosedDay(dt(11))).toBe(true);
  });

  it("3/4/9) aralık kontrolü [giriş, çıkış)", () => {
    const { result } = engine();
    const bad = (a: number, b: number) =>
      result.current.rangeHasUnpricedNight(dt(a), dt(b));
    expect(bad(5, 10)).toBe(false);
    expect(bad(9, 11)).toBe(false); // çıkış 11 → geçerli
    expect(bad(11, 12)).toBe(true); // 11 gecesi fiyatsız
    expect(bad(9, 17)).toBe(true); // arada fiyatsız geceler
    expect(bad(15, 20)).toBe(false);
  });

  it("URL'den fiyatsız aralık: priceUnavailable, yönlendirme YOK, uyarı var", async () => {
    const { result } = engine({ initialStart: ymd(9), initialEnd: ymd(12) });
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.priceUnavailable).toBe(true);
    expect(result.current.result).toBeNull();
    result.current.handleReservation();
    expect(hrefSet).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(result.current.reservationError || "").toMatch(TR_PRICE_NOTICE)
    );
  });

  it("10) %100 indirimli gerçek fiyat → seçilebilir, hesap geçerli", async () => {
    const { result } = engine({
      initialStart: ymd(16),
      initialEnd: ymd(18),
      discounts: [
        {
          start_date: ymd(16),
          end_date: ymd(17),
          discount_type: "percent",
          discount_value: 100,
          currency: null,
        },
      ] as never,
    });
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.isPriceClosedDay(dt(17))).toBe(false);
    expect(result.current.priceUnavailable).toBe(false);
    expect(result.current.result).not.toBeNull();
  });
});

/* ===============================================================
   REFERANS ÖRNEK — 30 Kasım fiyatlı · 1 Aralık fiyatsız · 2 Aralık fiyatlı
   (gelecek yıl; ay sınırı geçişi dahil)
   =============================================================== */
describe("referans örnek (30 Kas / 1 Ara / 2 Ara) — useBookingEngine", () => {
  const YY = new Date().getFullYear() + 1;
  const k = (m: number, d: number) =>
    `${YY}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const REF = [
    { price: 7000, currency: "TRY", start_date: k(11, 1), end_date: k(11, 30) },
    { price: 9000, currency: "TRY", start_date: k(12, 2), end_date: k(12, 31) },
  ];
  const nov30 = new Date(YY, 10, 30);
  const dec1 = new Date(YY, 11, 1);
  const dec2 = new Date(YY, 11, 2);
  function eng(s?: string, e?: string) {
    return renderHook(() =>
      useBookingEngine({
        villaSlug: "v",
        villaId: "v1",
        prices: REF,
        initialStart: s ?? null,
        initialEnd: e ?? null,
      })
    );
  }

  it("1/2/6) seçim yokken: 30 Kas açık, 1 Ara KAPALI, 2 Ara açık", () => {
    const { result } = eng();
    expect(result.current.isPriceClosedDay(nov30)).toBe(false);
    expect(result.current.isPriceClosedDay(dec1)).toBe(true);
    expect(result.current.isPriceClosedDay(dec2)).toBe(false);
  });

  it("3/7) 30 Kas check-in seçiliyken 1 Ara checkout için açılır; 2 Ara açık ama 30→2 geçersiz", async () => {
    const { result } = eng();
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    act(() => result.current.setStartDate(nov30));
    expect(result.current.isPriceClosedDay(dec1)).toBe(false);
    expect(result.current.rangeHasUnpricedNight(nov30, dec1)).toBe(false);
    expect(result.current.rangeHasUnpricedNight(nov30, dec2)).toBe(true);
  });

  it("3/6/8) 30 Kas → 1 Ara geçerli; toplam YALNIZ 30 Kas gecesi", async () => {
    const { result } = eng(k(11, 30), k(12, 1));
    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.priceUnavailable).toBe(false);
    expect(result.current.selectedNights).toBe(1);
    expect(result.current.result!.stay).toBe(7000);
    result.current.handleReservation();
    expect(hrefSet).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["4) 1 Ara → 2 Ara", 12, 1, 12, 2],
    ["5) 1 Ara → 3 Ara", 12, 1, 12, 3],
  ])("%s geçersiz: uyarı + yönlendirme yok", async (_l, m1, d1, m2, d2) => {
    const { result } = eng(k(m1, d1), k(m2, d2));
    await waitFor(() => expect(result.current.availabilityPending).toBe(false));
    expect(result.current.priceUnavailable).toBe(true);
    expect(result.current.result).toBeNull();
    result.current.handleReservation();
    expect(hrefSet).not.toHaveBeenCalled();
  });
});

/* ===============================================================
   PUBLIC — BookingSidebar (villa detay + /v/[token])
   =============================================================== */
describe("BookingSidebar — fiyat kuralı + mevcut doluluk kuralları", () => {
  /* Takvim, seçili başlangıç tarihinin ayında açılır (mevcut davranış);
     fiyatlı 26→28 ön-seçimi takvimi fiyat ayına getirir. İlk tıklama
     tamamlanmış aralığı sıfırlar (mevcut "completed range reset"). */
  async function openCalendar(props: Record<string, unknown> = {}) {
    const utils = render(
      <BookingSidebar
        villaSlug="v"
        villaId="v1"
        prices={PRICES}
        initialStart={ymd(26)}
        initialEnd={ymd(28)}
        {...props}
      />
    );
    await screen.findByText(/Toplam Tutar/);
    fireEvent.click(utils.container.querySelector("#booking-date-field > div") as HTMLElement);
    const monthName = new Intl.DateTimeFormat("tr-TR", { month: "long" }).format(dt(1));
    await waitFor(() =>
      expect(utils.container.textContent || "").toMatch(
        new RegExp(`${monthName}\\s*${Y}`, "i")
      )
    );
    return utils;
  }

  it("14) fiyatsız günler (11 dahil) seçim yokken kapalı", async () => {
    await openCalendar();
    expect(isDisabled(await dayCell(9))).toBe(false);
    expect(isDisabled(await dayCell(11))).toBe(true);
    expect(isDisabled(await dayCell(12))).toBe(true);
    expect(isDisabled(await dayCell(13))).toBe(true);
    expect(isDisabled(await dayCell(14))).toBe(true);
    expect(isDisabled(await dayCell(15))).toBe(false);
  });

  it("8) 9 → 11 (çıkış sezon sonrası) geçerli: özet + yönlendirme", async () => {
    await openCalendar();
    expect(isDisabled(await dayCell(11))).toBe(true);
    fireEvent.click(await dayCell(9));
    /* check-in seçilince 11 checkout için açılır; 12 kapalı kalır */
    await waitFor(async () => expect(isDisabled(await dayCell(11))).toBe(false));
    expect(isDisabled(await dayCell(12))).toBe(true);
    fireEvent.click(await dayCell(11));
    await screen.findByText(/Toplam Tutar/);
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
    fireEvent.click(cta);
    expect(hrefSet.mock.calls[0][0]).toContain(`start=${ymd(9)}&end=${ymd(11)}`);
  });

  it("3/9) 9 → 16 (arada fiyatsız geceler) reddedilir: uyarı, seçim/özet yok, kısaltma yok", async () => {
    const { container } = await openCalendar();
    fireEvent.click(await dayCell(9));
    fireEvent.click(await dayCell(16));
    await screen.findByText(TR_PRICE_NOTICE);
    expect(screen.queryByText(/Toplam Tutar/)).toBeNull();
    /* Aralık tamamlanmadı: yalnız tıklanan giriş günü seçili (kısaltma YOK). */
    expect(container.querySelectorAll(".rdp-day_range_middle").length).toBe(0);
    expect(container.querySelectorAll(".rdp-day_selected").length).toBeLessThanOrEqual(1);
  });

  it("URL'den fiyatsız aralık: uyarı + CTA kapalı + yönlendirme yok", async () => {
    render(
      <BookingSidebar villaSlug="v" villaId="v1" prices={PRICES} initialStart={ymd(9)} initialEnd={ymd(12)} />
    );
    await screen.findByText(TR_PRICE_NOTICE);
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it("11/12/13) onaylı rezervasyon, manuel blok ve iCal ara günleri yine kapalı", async () => {
    ranges = [
      { kind: "reservation", status: "confirmed", start_date: ymd(16), end_date: ymd(19) },
      { kind: "manual", status: null, start_date: ymd(20), end_date: ymd(23) },
    ];
    await openCalendar({
      initialStart: ymd(2),
      initialEnd: ymd(4),
      externalBlocks: { checkin: [ymd(24)], checkout: [ymd(27)], middle: [ymd(25), ymd(26)] },
    });
    await waitFor(async () => expect(isDisabled(await dayCell(17))).toBe(true));
    expect(isDisabled(await dayCell(18))).toBe(true); // confirmed ara gün
    expect(isDisabled(await dayCell(21))).toBe(true); // manuel ara gün
    expect(isDisabled(await dayCell(25))).toBe(true); // iCal ara gün
    expect(isDisabled(await dayCell(15))).toBe(false); // fiyatlı + boş
  });

  it("15) /v/[token] pasif villa gövdesi (hideReservationCta) — aynı takvim kuralı", async () => {
    await openCalendar({ hideReservationCta: true });
    expect(isDisabled(await dayCell(12))).toBe(true);
    expect(isDisabled(await dayCell(11))).toBe(true);
    fireEvent.click(await dayCell(10));
    await waitFor(async () => expect(isDisabled(await dayCell(11))).toBe(false));
  });
});

/* ===============================================================
   PUBLIC — /arama VillaCardBookingModal
   =============================================================== */
describe("16) VillaCardBookingModal — fiyat kuralı", () => {
  function renderModal(start?: string, end?: string) {
    return render(
      <VillaCardBookingModal
        isOpen={true}
        onClose={vi.fn()}
        villaId="v1"
        villaSlug="v"
        villaTitle="Test Villa"
        initialStart={start}
        initialEnd={end}
      />
    );
  }

  it("fiyatsız aralık: uyarı + CTA kapalı + /rezervasyon'a gidilmez", async () => {
    renderModal(ymd(9), ymd(12));
    await screen.findByText(TR_PRICE_NOTICE);
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    fireEvent.click(cta);
    expect(hrefSet).not.toHaveBeenCalled();
  });

  it("16) sezon sonu çıkışı (9 → 11): sidebar ile AYNI — geçerli, 2 gece, uyarı yok", async () => {
    renderModal(ymd(9), ymd(11));
    await screen.findByText("Konaklama Tutarı (2 Gece)");
    expect(screen.queryByText(TR_PRICE_NOTICE)).toBeNull();
    const cta = screen.getByRole("button", { name: "Rezervasyon Yap" }) as HTMLButtonElement;
    expect(cta.disabled).toBe(false);
  });

  it("fiyatlı aralık: mevcut akış (özet + yönlendirme); fiyatsız gün kapalı", async () => {
    renderModal(ymd(15), ymd(18));
    await screen.findByText("Konaklama Tutarı (3 Gece)");
    expect(screen.queryByText(TR_PRICE_NOTICE)).toBeNull();
    expect(isDisabled(await dayCell(12))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Rezervasyon Yap" }));
    expect(hrefSet).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   ADMIN — ReservationCalendar (opt-in)
   =============================================================== */
describe("Admin ReservationCalendar", () => {
  function renderAdmin(extra: Record<string, unknown> = {}) {
    const onSelectRange = vi.fn();
    const utils = render(
      <ReservationCalendar
        startDate={null}
        endDate={null}
        freshSelection={false}
        setFreshSelection={vi.fn()}
        currentMonth={dt(1)}
        setCurrentMonth={vi.fn()}
        blockedDates={[]}
        checkinDates={[]}
        checkoutDates={[]}
        pendingCheckinDates={[]}
        pendingCheckoutDates={[]}
        pendingMiddleDates={[]}
        onSelectRange={onSelectRange}
        prices={PRICES}
        {...extra}
      />
    );
    const cell = (n: number) =>
      utils.container.querySelector(`[data-date="${ymd(n)}"]`) as HTMLElement;
    const drag = (a: number, b: number) => {
      fireEvent.mouseDown(cell(a));
      fireEvent.mouseEnter(cell(b));
      fireEvent.mouseUp(window);
    };
    const closed = (n: number) => cell(n).style.cursor === "not-allowed";
    return { ...utils, onSelectRange, cell, drag, closed };
  }

  it("17) rezervasyon oluştur (enforcePriceCoverage): fiyatsız gün (11 dahil) kapalı", () => {
    const { closed, cell } = renderAdmin({ enforcePriceCoverage: true });
    expect(closed(9)).toBe(false);
    expect(closed(11)).toBe(true);
    /* seçim sürerken (check-in 10) 11 checkout için açılır */
    fireEvent.mouseDown(cell(10));
    expect(closed(11)).toBe(false);
    expect(closed(12)).toBe(true);
    fireEvent.mouseUp(window);
    expect(closed(12)).toBe(true);
    expect(closed(14)).toBe(true);
    expect(closed(15)).toBe(false);
  });

  it("17) geçerli aralık onSelectRange'e gider; fiyatsız geceli aralık reddedilir", () => {
    const a = renderAdmin({ enforcePriceCoverage: true });
    a.drag(9, 11);
    expect(a.onSelectRange).toHaveBeenCalledTimes(1);
    expect(a.onSelectRange.mock.calls[0][0].getDate()).toBe(9);
    expect(a.onSelectRange.mock.calls[0][1].getDate()).toBe(11);
    a.drag(9, 16);
    expect(a.onSelectRange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toMatch(/fiyatı tanımlı olmayan gece/);
  });

  it("18) rezervasyon düzenle: kendi geceleri (excludeDisabledDates) fiyat kuralından muaf", () => {
    const a = renderAdmin({
      enforcePriceCoverage: true,
      excludeDisabledDates: [dt(11), dt(12), dt(13), dt(14)],
    });
    expect(a.closed(12)).toBe(false);
    a.drag(10, 15);
    expect(a.onSelectRange).toHaveBeenCalledTimes(1);
    /* muaf olmayan fiyatsız gece hâlâ reddedilir */
    const b = renderAdmin({
      enforcePriceCoverage: true,
      excludeDisabledDates: [dt(11)],
    });
    b.drag(10, 15);
    expect(b.onSelectRange).not.toHaveBeenCalled();
  });

  it("11/13) onaylı + iCal blokları opt-in açıkken de kapalı (mevcut kural)", () => {
    const a = renderAdmin({
      enforcePriceCoverage: true,
      blockedDates: [dt(17)],
      externalMiddleDates: [dt(22)],
    });
    expect(a.closed(17)).toBe(true);
    expect(a.closed(22)).toBe(true);
  });

  it("20) manuel blok formu (opt-in YOK): fiyatsız günler seçilebilir, aralık geçer", () => {
    const a = renderAdmin();
    expect(a.closed(12)).toBe(false);
    a.drag(11, 16);
    expect(a.onSelectRange).toHaveBeenCalledTimes(1);
  });
});

/* ===============================================================
   KAPSAM KİLİDİ — dahil olmayan ekranlar
   =============================================================== */
describe("19/20) kapsam: fiyat/indirim takvimi ve manuel blok etkilenmez", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf-8");
  it.each([
    "app/components/admin/villa/PricingCalendarCanvas.tsx",
    "app/components/admin/villa/pricing-calendar/_components/DayCell.tsx",
    "app/components/admin/villa-form/DiscountCalendarCanvas.tsx",
    "app/(admin)/maki-admin/manual-reservations/ekle/ManualReservationForm.tsx",
  ])("%s fiyat kapsamı kuralını kullanmaz", (rel) => {
    const src = read(rel);
    expect(src).not.toContain("enforcePriceCoverage");
    expect(src).not.toContain("price-coverage");
  });
  it.each([
    "app/(admin)/maki-admin/reservations/ekle/page.tsx",
    "app/(admin)/maki-admin/reservations/[id]/_components/DateRangeCard.tsx",
  ])("%s rezervasyon takvimi kuralı açar", (rel) => {
    expect(read(rel)).toMatch(/<ReservationCalendar[\s\S]*?enforcePriceCoverage[\s\S]*?\/>/);
  });
});
