"use client";

/* ===============================================================
   🛡️ useBookingEngine — TEK BOOKING STATE MACHINE
   ===============================================================
   AMAÇ:
     BookingSidebar'ın domain logic'i (selection state, availability
     fetch + parse, merged arrays, pricing pipeline, prepayment,
     minimum stay, navigation URL inşası) bu hook'a taşındı.
     BookingSidebar yalnız container/render katmanı; bu hook'tan
     gelen değerleri ve handler'ları kullanır.

     Aynı hook VillaCardBookingModal tarafından da kullanılır →
     codebase'de **TEK** booking state machine.

   BYTE-IDENTICAL KONTRAT:
     - useState init values: AYNI
     - useEffect deps + body: AYNI
     - Supabase query'leri: AYNI
       (reservations.in(['pending','confirmed']) + manual_reservations
        — Faz 2B allow-list contract)
     - parse/merge/expand logic: AYNI
     - hasConflict / isIntersection / getValidEndDate: AYNI
     - calculateGrandTotal / calculatePrepayment çağrı semantic: AYNI
     - handleReservation URL formatı: AYNI
     - alert davranışı: AYNI

   DOKUNULMAYAN PURE HELPER'LAR (re-used aynen):
     - lib/date-range > getValidEndDate
     - lib/price.engine > calculateGrandTotal, calculateNights,
       calculatePrepayment
     - lib/currency > convertPrice, formatCurrency
     - lib/villa-row.types > normalizePriceRanges
     - lib/external-calendar.public.helper > externalStringsToDateArrays,
       EMPTY_EXTERNAL_STRING_ARRAYS
     - app/services/settings.service > getSettings
   =============================================================== */

import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";

/* 🛡️ FAZ 2 frontend purge — `import { supabase }` KALDIRILDI.
   `get_villa_blocked_ranges` RPC artık /api/public/villas/[id]/blocked-ranges
   fetch boundary'sinden çekilir; SECURITY DEFINER semantic ve PII-safe
   payload aynen korunur. */
import { useCurrency } from "@/app/context/CurrencyContext";
import { convertPrice, formatCurrency } from "@/lib/currency";

import { getPublicSettingsAction as getPublicSettings } from "@/app/services/settings.action";

import {
  calculateGrandTotal,
  calculateNights,
  calculatePrepayment,
  accommodationBase,
} from "@/lib/price.engine";

/* getValidEndDate → lib/date-range (TEK source-of-truth).
   BookingSidebar'da kullanıldığı şekliyle aynen burada da
   re-export edilir; consumer'lar engine üzerinden alabilir. */
import { getValidEndDate } from "@/lib/date-range";

import {
  normalizePriceRanges,
  type VillaPriceEmbed,
  type PriceRange,
} from "@/lib/villa-row.types";

import {
  externalStringsToDateArrays,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

/* 🛡️ Orphan-gap kontrolü — SAF helper (availability toplamaz; occupied
   gece kümesi + minStay + today verilir, karar döner). Mevcut min-stay/
   gap-fill mantığını BOZMAZ; yalnız orphan bırakan seçimi ek olarak eler. */
import { evaluateOrphanGap } from "@/lib/stay-rules.helper";

/* ===============================================================
   INPUT KONTRAT
   ===============================================================
   BookingSidebar Props ile birebir aynı shape.
   externalBlocks default EMPTY → backward-compat. */
export type UseBookingEngineInput = {
  villaSlug: string;
  villaId: string;
  prices: VillaPriceEmbed[];
  deposit?: number;
  cleaning_fee?: number;
  cleaning_currency?: string;
  cleaning_limit?: number;
  custom_prepayment_rate?: number | null;
  minimum_stay_nights?: number | null;
  /* 🛡️ Orphan-gap kuralı (admin ayarı) — açıksa min-stay'den kısa
     kullanılamaz boşluk bırakan seçim engellenir. Default false (hook
     seviyesi); gerçek değer settings'ten prop olarak geçilir (villa page). */
  orphanGapRuleEnabled?: boolean;
  externalBlocks?: ExternalCalendarStringArrays;
  initialStart?: string | null;
  initialEnd?: string | null;
};

/* ===============================================================
   GRAND TOTAL RESULT (calculateGrandTotal return shape mirror).
   `null` ise: minimum stay invalid veya tarih seçimi tamamlanmadı.
   Engine'in kendi return tipini referans alıyoruz → drift yok. */
export type BookingResult = ReturnType<typeof calculateGrandTotal>;

export type UseBookingEngineReturn = {
  /* Selection state — React.Dispatch sığasıyla aynı (functional update
     desteği dahil). Narrowing yok → BookingSidebar'ın setStartDate
     kullanım yüzeyi bire bir korunur. */
  startDate: Date | null;
  endDate: Date | null;
  setStartDate: Dispatch<SetStateAction<Date | null>>;
  setEndDate: Dispatch<SetStateAction<Date | null>>;
  adults: number;
  children: number;
  setAdults: Dispatch<SetStateAction<number>>;
  setChildren: Dispatch<SetStateAction<number>>;

  /* Merged availability arrays
     (confirmed + manual + external — 3 source concat) */
  mergedBlockedDates: Date[];
  mergedCheckinDates: Date[];
  mergedCheckoutDates: Date[];

  /* Pending arrays (single source, no manual/external pending) */
  pendingCheckinDates: Date[];
  pendingCheckoutDates: Date[];
  pendingMiddleDates: Date[];

  /* Derived (calc engine + helpers) */
  normalizedPrices: PriceRange[];
  prepaymentRate: number;
  today: Date;
  selectedNights: number;
  minStayThreshold: number;
  minimumStayValid: boolean;
  /* Orphan-gap kuralı: seçim min-stay'den kısa kullanılamaz boşluk
     bırakmıyor mu. Kural kapalıysa / min-stay<2 ise her zaman true. */
  orphanGapValid: boolean;
  /* 🛡️ Gap override aktif mi? (seçim, mevcut rezervasyonlar arasındaki
     gerçek bir gap'in tamamını dolduruyor → min_stay esnetildi). UI bunu
     kullanarak min-stay uyarısını bastırır + bilgi metni gösterir. */
  isGapOverride: boolean;
  result: BookingResult | null;
  prepayment: number;
  convertedDeposit: number;
  startingPrice: string;

  /* Pure helpers (closure over engine state) */
  parseLocalDate: (s: string) => Date;
  formatDate: (d: Date) => string;
  isIntersection: (date: Date) => boolean;
  hasConflict: (start: Date, end: Date) => boolean;
  getPriceForDate: (date: Date) => number | null;

  /* Submit — navigation URL inşası + window.location.href.
     BookingSidebar'daki davranışla birebir aynı; eski alert()
     çağrıları yerine `reservationError` state'i set edilir. */
  handleReservation: () => void;

  /* 🛡️ Modern feedback layer — alert() yerine inline banner state.
     null → gizli; string → banner gösterilir; 3sn sonra auto-clear. */
  reservationError: string | null;
};

/* ===============================================================
   HOOK BODY
   =============================================================== */
export function useBookingEngine(
  input: UseBookingEngineInput
): UseBookingEngineReturn {
  const {
    villaSlug,
    villaId,
    prices,
    deposit = 0,
    cleaning_fee = 0,
    cleaning_currency = "TRY",
    cleaning_limit = 0,
    custom_prepayment_rate = null,
    minimum_stay_nights = null,
    orphanGapRuleEnabled = false,
    externalBlocks = EMPTY_EXTERNAL_STRING_ARRAYS,
    initialStart = null,
    initialEnd = null,
  } = input;

  const { currency, rates } = useCurrency();

  /* 🛡️ FAZ 55K — Data boundary normalization (currency garantisi).
     `prices` raw DB-shape; normalizePriceRanges null start/end
     satırlarını eler ve currency null/empty → "TRY" fallback uygular.
     calculateGrandTotal ve getPriceForDate aynı normalize edilmiş
     array'i okur → tutarlı + TS-strict. */
  const normalizedPrices = useMemo(
    () => normalizePriceRanges(prices),
    [prices]
  );

  /* 🛡️ parseLocalDate — hook-lokal helper.
     useState lazy initializer'lar bu fonksiyonu çağırdığı için
     declaration sırası ÖNEMLİ: tüm useState bloklarından ÖNCE
     tanımlı olmalı, yoksa TDZ ("can't access ... before
     initialization") hatası. Davranış AYNI: "YYYY-MM-DD" →
     LOCAL midnight Date. */
  const parseLocalDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split("T")[0].split("-");
    return new Date(Number(year), Number(month) - 1, Number(day));
  };

  /* 🛡️ Lazy initializer — sadece ilk render'da hidrate; sonraki
     re-render'larda hesaplama yeniden yapılmaz. parseLocalDate
     LOCAL midnight üretir; UTC drift yok. */
  const [startDate, setStartDate] = useState<Date | null>(() =>
    initialStart ? parseLocalDate(initialStart) : null
  );
  const [endDate, setEndDate] = useState<Date | null>(() =>
    initialEnd ? parseLocalDate(initialEnd) : null
  );

  const [blockedDates, setBlockedDates] = useState<Date[]>([]);
  const [checkinDates, setCheckinDates] = useState<Date[]>([]);
  const [checkoutDates, setCheckoutDates] = useState<Date[]>([]);

  const [manualBlockedDates, setManualBlockedDates] = useState<Date[]>([]);
  const [manualCheckinDates, setManualCheckinDates] = useState<Date[]>([]);
  const [manualCheckoutDates, setManualCheckoutDates] = useState<Date[]>([]);

  const [pendingCheckinDates, setPendingCheckinDates] = useState<Date[]>([]);
  const [pendingCheckoutDates, setPendingCheckoutDates] = useState<Date[]>([]);
  const [pendingMiddleDates, setPendingMiddleDates] = useState<Date[]>([]);

  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);

  const [prepaymentRate, setPrepaymentRate] = useState(0);

  /* 🛡️ FAZ 56H-C — External iCal 3. kaynak olarak merge edilir.
     `useMemo` gerekmez — bu inline merge zaten her render'da çalışıyordu
     (BookingSidebar mevcut pattern); ek concat O(n) trivial. External
     arrays prop referansı stabil (server-fetched), state değişiminde
     rebuild yine ucuz. Davranış BookingSidebar ile birebir aynı. */
  const externalDates = externalStringsToDateArrays(externalBlocks);
  const mergedBlockedDates = [
    ...blockedDates,
    ...manualBlockedDates,
    ...externalDates.externalMiddleDates,
  ];
  const mergedCheckinDates = [
    ...checkinDates,
    ...manualCheckinDates,
    ...externalDates.externalCheckinDates,
  ];
  const mergedCheckoutDates = [
    ...checkoutDates,
    ...manualCheckoutDates,
    ...externalDates.externalCheckoutDates,
  ];

  const [today] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  /* 🛡️ Modern feedback layer — handleReservation içindeki alert()
     çağrıları yerine state-driven mesaj. Consumer (BookingSidebar)
     bu state'i inline banner olarak gösterir; null → gizli. */
  const [reservationError, setReservationError] = useState<string | null>(
    null
  );

  const isIntersection = (date: Date) => {
    return (
      mergedCheckinDates.some(
        (d) => d.toDateString() === date.toDateString()
      ) &&
      mergedCheckoutDates.some(
        (d) => d.toDateString() === date.toDateString()
      )
    );
  };

  const hasConflict = (start: Date, end: Date) => {
    /* `const` — `current` referansı yeniden atanmaz; sadece Date
       instance'ı setDate ile mutate edilir (BookingSidebar pre-refactor
       davranışıyla birebir aynı: gün gün loop). */
    const current = new Date(start);
    while (current <= end) {
      const isBlocked = mergedBlockedDates.some(
        (d) => d.toDateString() === current.toDateString()
      );
      if (isBlocked) return true;
      current.setDate(current.getDate() + 1);
    }
    return false;
  };

  const formatDate = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getPriceForDate = (date: Date) => {
    const target = formatDate(date);
    /* 🛡️ FAZ 55K — normalizedPrices üzerinden ara: start/end string
       garantili. */
    const found = normalizedPrices.find(
      (p) => target >= p.start_date && target <= p.end_date
    );
    if (!found) return null;
    return convertPrice(
      found.price,
      found.currency || "TRY",
      currency,
      rates
    );
  };

  /* ---------------------------------------------
     🔥 EFFECTIVE PREPAYMENT RATE
     - villa.custom_prepayment_rate varsa → onu kullan
     - yoksa global settings.prepayment_rate
     - yoksa 0 (initial state)
     custom_prepayment_rate değişince yeniden çalışır.
     BookingSidebar'daki davranışla birebir aynı.
  ---------------------------------------------- */
  useEffect(() => {
    if (
      custom_prepayment_rate !== null &&
      custom_prepayment_rate !== undefined &&
      (custom_prepayment_rate as unknown as string) !== ""
    ) {
      /* BookingSidebar pre-refactor davranışı: override mevcutsa
         setState ile prepaymentRate'i senkron set et. React 19'un
         `set-state-in-effect` rule'u bu pattern'i flagliyor ama
         davranış BYTE-IDENTICAL korunmak için aynı kalır — alternatif
         derived-state refactor ilk-render flicker'ını değiştirir.
         (Trivial cascading render; tek setState, deps custom_prepayment_rate). */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrepaymentRate(Number(custom_prepayment_rate));
      return;
    }

    // 🛡️ MEMORY-LEAK HARDENING (Faz 2A):
    //   getSettings async; hızlı navigasyon sırasında stale setState
    //   önlenir. Davranış: aynı settings prepayment_rate yüklemesi.
    let cancelled = false;
    getPublicSettings().then((data) => {
      if (cancelled) return;
      if (data?.prepayment_rate) {
        setPrepaymentRate(data.prepayment_rate);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [custom_prepayment_rate]);

  /* ---------------------------------------------
     🔥 RESERVATIONS + MANUAL RESERVATIONS FETCH
     ---------------------------------------------
     BookingSidebar'daki effect ile birebir aynı:
     - Faz 2B allow-list: pending + confirmed
     - confirmed: firstDay=checkin, lastDay=checkout, mid=blocked
     - pending  : firstDay=pendingCheckin, lastDay=pendingCheckout, mid=pendingMiddle
     - manual   : firstDay=manualCheckin, lastDay=manualCheckout,
                  single-day=manualBlocked, mid=manualBlocked
     - unique() dedup by toDateString()
  ---------------------------------------------- */
  useEffect(() => {
    const fetchReservations = async () => {
      /* 🛡️ AVAILABILITY ALLOW-LIST (Faz 2B):
         Public booking sidebar'ı yalnız `pending`+`confirmed`
         rezervasyonların tarihlerini calendar'da blocking olarak
         göstermeli. `rejected` / `cancelled` müsait sayılır. */
      /* 🛡️ PII-SAFE AVAILABILITY — SECURITY DEFINER RPC (migration 039).
         ESKİ: anon `supabase.from("reservations"/"manual_reservations")
         .select(...)`. 040 admin-only RLS sonrası anon SELECT reddedilir.
         YENİ: `get_villa_blocked_ranges` — yalnız kind/status/start_date/
         end_date döner; PII browser'a ASLA gelmez. Allow-list (pending+
         confirmed) + manual ayrımı RPC içinde. Aşağıdaki expansion mantığı
         `data` (reservation) ve `manual` shape'leri üzerinden BYTE-IDENTICAL
         çalışır. */
      /* 🛡️ FAZ 2 frontend purge — public fetch /api/public/villas/[id]/blocked-ranges.
         Eski anon `supabase.rpc("get_villa_blocked_ranges", { p_villa_id })`
         route içinde delege; aynı RPC, aynı return shape. Davranış
         BYTE-IDENTICAL: empty array fallback aynen, error path da. */
      type BlockedRange = {
        kind: "reservation" | "manual";
        status: string | null;
        start_date: string;
        end_date: string;
      };
      let ranges: BlockedRange[] = [];
      try {
        const res = await fetch(
          `/api/public/villas/${encodeURIComponent(villaId)}/blocked-ranges`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          ranges?: BlockedRange[];
        };
        if (!res.ok || !json.ok) {
          console.error(
            "❌ rezervasyon çekme:",
            new Error(`HTTP ${res.status}`)
          );
          return;
        }
        ranges = json.ranges || [];
      } catch (err) {
        console.error("❌ rezervasyon çekme:", err);
        return;
      }
      const data = ranges
        .filter((r) => r.kind === "reservation")
        .map((r) => ({
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status ?? "",
        }));
      const manual = ranges
        .filter((r) => r.kind === "manual")
        .map((r) => ({ start_date: r.start_date, end_date: r.end_date }));

      const blocked: Date[] = [];
      const checkin: Date[] = [];
      const checkout: Date[] = [];

      const manualBlocked: Date[] = [];
      const manualCI: Date[] = [];
      const manualCO: Date[] = [];

      const pendingCheckin: Date[] = [];
      const pendingCheckout: Date[] = [];
      const pendingMiddle: Date[] = [];

      type ReservationRow = {
        start_date: string;
        end_date: string;
        status: string;
      };

      (data as ReservationRow[] | null)?.forEach((r) => {
        if (r.status === "confirmed") {
          /* 🛡️ LOCAL DATE SEMANTIC: parseLocalDate ile LOCAL midnight;
             setDate(+1) LOCAL gün adımıyla zincirlenir. Last-day eşitliği
             toDateString() (LOCAL gün eşitliği). */
          const current = parseLocalDate(r.start_date);
          const end = parseLocalDate(r.end_date);
          let isFirst = true;
          while (current <= end) {
            const d = new Date(current);
            if (isFirst) {
              checkin.push(d);
              isFirst = false;
            } else if (current.toDateString() === end.toDateString()) {
              checkout.push(d);
            } else {
              blocked.push(d);
            }
            current.setDate(current.getDate() + 1);
          }
        }

        if (r.status === "pending") {
          const current = parseLocalDate(r.start_date);
          const end = parseLocalDate(r.end_date);
          while (current <= end) {
            const d = new Date(current);
            const isStart =
              current.toDateString() ===
              parseLocalDate(r.start_date).toDateString();
            const isEnd = current.toDateString() === end.toDateString();
            if (isStart) pendingCheckin.push(d);
            else if (isEnd) pendingCheckout.push(d);
            else pendingMiddle.push(d);
            current.setDate(current.getDate() + 1);
          }
        }
      });

      type ManualRow = { start_date: string; end_date: string };

      (manual as ManualRow[] | null)?.forEach((r) => {
        const current = parseLocalDate(r.start_date);
        const end = parseLocalDate(r.end_date);
        while (current <= end) {
          const d = new Date(current);
          const startDateLocal = parseLocalDate(r.start_date);
          const endDateLocal = parseLocalDate(r.end_date);
          const isFirstDay =
            current.toDateString() === startDateLocal.toDateString();
          const isLastDay =
            current.toDateString() === endDateLocal.toDateString();
          if (isFirstDay && isLastDay) manualBlocked.push(d);
          else if (isFirstDay) manualCI.push(d);
          else if (isLastDay) manualCO.push(d);
          else manualBlocked.push(d);
          current.setDate(current.getDate() + 1);
        }
      });

      const unique = (arr: Date[]) =>
        Array.from(
          new Map(arr.map((d) => [d.toDateString(), d])).values()
        );

      setBlockedDates(unique(blocked));
      setCheckinDates(unique(checkin));
      setCheckoutDates(unique(checkout));
      setPendingCheckinDates(unique(pendingCheckin));
      setPendingCheckoutDates(unique(pendingCheckout));
      setPendingMiddleDates(unique(pendingMiddle));

      setManualBlockedDates(unique(manualBlocked));
      setManualCheckinDates(unique(manualCI));
      setManualCheckoutDates(unique(manualCO));
    };

    fetchReservations();
  }, [villaId]);

  /* ═══════════════════════════════════════════════════════════
     🛡️ FAZ 26B — MINIMUM STAY VALIDATION
     ═══════════════════════════════════════════════════════════
     KURAL:
       - minimum_stay_nights null veya <=1 → enforcement YOK
       - startDate/endDate ikisinden biri null → seçim yarım → valid kabul
       - Aksi halde: calculateNights ile gece sayısı; minimum'dan
         azsa → invalid
     `calculateNights` mevcut helper (lib/price.engine).
     ═══════════════════════════════════════════════════════════ */
  const minStayThreshold =
    typeof minimum_stay_nights === "number" &&
    Number.isFinite(minimum_stay_nights) &&
    minimum_stay_nights >= 2
      ? minimum_stay_nights
      : 0;

  const selectedNights =
    startDate && endDate
      ? calculateNights(formatDate(startDate), formatDate(endDate))
      : 0;

  /* ═══════════════════════════════════════════════════════════
     🛡️ GAP OVERRIDE — Dynamic Effective Minimum Stay
     ═══════════════════════════════════════════════════════════
     Seçim, mevcut rezervasyonlar arasındaki GERÇEK bir gap'in
     TAMAMINI dolduruyorsa minimum_stay esnetilir.
       - Gap boundary'leri HAM aralık uçlarıdır:
           start = bir bloğun ÇIKIŞ günü (end_date → mergedCheckoutDates)
           end   = bir bloğun GİRİŞ günü (start_date → mergedCheckinDates)
         (expanded middle dizileri KULLANILMAZ → ±1 gün hatası yok)
       - `!hasConflict` araya blok girmesini dışlar → kısmi/atlamalı
         seçim override ALMAZ (15→16, 16→17 reddedilir; 15→17 kabul).
       - Yalnız normalde reddedilecek (selectedNights < threshold)
         seçimde devreye girer → diğer tüm tarihlerde min_stay AYNEN.
       - `minimum_stay_nights` verisi DEĞİŞMEZ; yalnız doğrulama eşiği
         bu seçim için dinamikleşir.
       - GAP BAŞLANGICI GENİŞLETİLDİ: sol sınır ya bir bloğun ÇIKIŞ günü
         (mevcut davranış), YA DA `today`'dir. Geçmiş tarihler satılamadığı
         için "bugün" de rezervasyon checkout'u gibi KAPALI SINIR sayılır →
         "bugün → sonraki checkin" boşluğu da gap kabul edilir. Sağ sınır
         yine mutlaka gerçek checkin; rezervasyon↔rezervasyon dalı AYNEN. */
  const isExactGapFill =
    !!startDate &&
    !!endDate &&
    minStayThreshold > 0 &&
    selectedNights > 0 &&
    selectedNights < minStayThreshold &&
    !hasConflict(startDate, endDate) &&
    (mergedCheckoutDates.some(
      (d) => d.toDateString() === startDate.toDateString()
    ) ||
      startDate.toDateString() === today.toDateString()) &&
    mergedCheckinDates.some(
      (d) => d.toDateString() === endDate.toDateString()
    );

  const effectiveMinStay = isExactGapFill ? selectedNights : minStayThreshold;

  const minimumStayValid =
    effectiveMinStay === 0 ||
    !startDate ||
    !endDate ||
    selectedNights >= effectiveMinStay;

  /* ═══════════════════════════════════════════════════════════
     🛡️ ORPHAN GAP VALIDATION (admin ayarı ile aç/kapa)
     ═══════════════════════════════════════════════════════════
     Min-stay + exact gap-fill mantığı YUKARIDA AYNEN durur; bu yalnız
     EK bir eleme. Occupied gece kümesi = mevcut merged availability
     (confirmed+manual+external; kaynak birleştirme DEĞİŞMEZ):
       occupied nights = mergedBlockedDates ∪ mergedCheckinDates
       (checkout günleri boş → dahil edilmez; daterange [) semantiği).
     Helper SAF: yalnız kümeyi + minStay + today alır. Ayar kapalıysa
     veya min-stay<2 ise helper her zaman valid döner (no-op). */
  const orphanGapValid = (() => {
    if (!orphanGapRuleEnabled || !startDate || !endDate) return true;
    const occupied = new Set<string>();
    for (const d of mergedBlockedDates) occupied.add(formatDate(d));
    for (const d of mergedCheckinDates) occupied.add(formatDate(d));
    return evaluateOrphanGap({
      fromKey: formatDate(startDate),
      toKey: formatDate(endDate),
      minStayNights: minimum_stay_nights,
      occupiedNightKeys: occupied,
      todayKey: formatDate(today),
      orphanRuleEnabled: orphanGapRuleEnabled,
    }).valid;
  })();

  /* 🛡️ FAZ 26B — minimum stay invalid → result hesaplama atla.
     calculateGrandTotal eski davranış aynen. */
  const result =
    startDate && endDate && minimumStayValid && orphanGapValid
      ? calculateGrandTotal({
          start: formatDate(startDate),
          end: formatDate(endDate),
          prices: normalizedPrices,
          currency,
          rates,
          cleaning_fee,
          cleaning_currency,
          cleaning_limit,
        })
      : null;

  const prepayment = result
    ? calculatePrepayment(
        accommodationBase(result.total, result.cleaning),
        prepaymentRate
      )
    : 0;

  const convertedDeposit = convertPrice(deposit, "TRY", currency, rates);

  const startingPrice = formatCurrency(
    convertPrice(
      Number(prices[0]?.price || 0),
      prices[0]?.currency || "TRY",
      currency,
      rates
    ),
    currency
  );

  /* ---------------------------------------------
     handleReservation — navigation URL inşası.
     BookingSidebar ile birebir aynı:
       - alert davranışı korunur
       - URL formatı korunur
       - window.location.href hard navigation
  ---------------------------------------------- */
  const handleReservation = () => {
    if (!startDate || !endDate) {
      /* 🛡️ alert() yerine inline state — consumer banner gösterir.
         3sn sonra otomatik temizlenir, kullanıcı UX'i blok etmez. */
      setReservationError("Lütfen tarih seçiniz.");
      setTimeout(() => setReservationError(null), 3000);
      return;
    }
    if (!minimumStayValid) {
      setReservationError(
        `Minimum konaklama süresi ${minStayThreshold} gecedir.`
      );
      setTimeout(() => setReservationError(null), 3000);
      return;
    }
    if (!orphanGapValid) {
      /* Orphan gap: seçim, min-stay'den kısa kullanılamaz bir boşluk
         bırakıyor → engelle (mevcut error mekanizması). */
      setReservationError(
        `Bu tarih aralığı, minimum ${minStayThreshold} gecelik kuralı ` +
          `karşılamayan kısa bir boşluk bırakıyor. Lütfen boşluğun tamamını ` +
          `kapsayan veya uygun bir aralık seçin.`
      );
      setTimeout(() => setReservationError(null), 5000);
      return;
    }
    setReservationError(null);

    const format = (date: Date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    const start = format(startDate);
    const end = format(endDate);

    const url = `/rezervasyon/${villaSlug}?start=${start}&end=${end}&adults=${adults}&children=${children}`;

    window.location.href = url;
  };

  return {
    /* Selection state */
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    adults,
    children,
    setAdults,
    setChildren,

    /* Merged availability */
    mergedBlockedDates,
    mergedCheckinDates,
    mergedCheckoutDates,

    /* Pending raw */
    pendingCheckinDates,
    pendingCheckoutDates,
    pendingMiddleDates,

    /* Derived */
    normalizedPrices,
    prepaymentRate,
    today,
    selectedNights,
    minStayThreshold,
    minimumStayValid,
    orphanGapValid,
    isGapOverride: isExactGapFill,
    result,
    prepayment,
    convertedDeposit,
    startingPrice,

    /* Helpers */
    parseLocalDate,
    formatDate,
    isIntersection,
    hasConflict,
    getPriceForDate,

    /* Submit */
    handleReservation,

    /* 🛡️ Modern feedback layer — consumer'a expose. Banner display
       BookingSidebar tarafında inline gösterilir; alert() kaldırıldı. */
    reservationError,
  };
}

/* getValidEndDate re-export — consumer'lar (BookingCalendar, modal)
   tek bir entry point'ten alabilsin. Lib davranışı AYNEN. */
export { getValidEndDate };
