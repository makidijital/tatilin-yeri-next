"use client";

/* ===============================================================
   🛡️ VillaCardBookingModal — villa kartından booking experience
   ===============================================================
   AMAÇ:
     Villa detail sayfasına gitmeden, villa kartı üzerinden premium
     booking flow başlat. BookingSidebar ile AYNI useBookingEngine
     + AYNI child component'leri (BookingCalendar / BookingSummary /
     BookingMinStayWarning) kullanır → codebase'de TEK booking
     state machine.

   DATA PIPELINE (DRIFT-PROOF):
     Modal, engine input setinin %100'ünü SERVER-SIDE API route'tan
     alır (/api/public/villas/[id]/availability). VillaCard caller'ları
     prices/cleaning_* prop'larını her zaman geçmediği için (örn.
     anasayfa collection, favoriler), bu prop'lar engine'e
     gönderilmez — API response source-of-truth'tur.

     BookingSidebar prop                 ↔  Modal kaynağı
     ────────────────────────────────────────────────────────
     prices                               ↔  apiData.prices
     deposit                              ↔  apiData.config.deposit
     cleaning_fee                         ↔  apiData.config.cleaning_fee
     cleaning_currency                    ↔  apiData.config.cleaning_currency
     cleaning_limit                       ↔  apiData.config.cleaning_limit
     custom_prepayment_rate               ↔  apiData.config.custom_prepayment_rate
     minimum_stay_nights                  ↔  apiData.config.minimum_stay_nights
     externalBlocks                       ↔  apiData.externalBlocks
     villaId / villaSlug                  ↔  Parent (VillaCard) prop

   PERFORMANCE:
     - Lazy mount: parent (VillaCard) bu component'i next/dynamic
       (ssr:false) ile import eder; isOpen=false iken bundle parse
       gecikir.
     - Modal kapalıyken NETWORK YOK: bu component yalnız mount
       olduğunda fetch eder.
     - Engine yalnız apiData hazır olduğunda mount olur (flicker yok:
       boş prices ile 0-fiyatlı kısa-flash engellenir).
     - Engine kendi reservations fetch'ini villaId değişince
       tetikler (BookingSidebar ile aynı pattern).
     - Toplam mount-açılış: 1 API round-trip + engine'in 1 reservations
       round-trip'i.

   UX:
     - Mobile: bottom drawer (slide-up, full width, rounded-t)
     - Desktop: centered modal
     - Backdrop click → close
     - ESC → close
     - Body scroll lock (mount/unmount cleanup)
     - role="dialog" aria-modal
     - Keyboard accessible
     - apiData yüklenirken minimal skeleton (header + spinner)

   DOMAIN:
     - useBookingEngine return değerleri BookingSidebar ile birebir
     - Selection / pricing / prepayment / minimum stay /
       availability merge — hepsi hook'tan
     - CTA "Rezervasyon Yap" → engine.handleReservation()
       → /rezervasyon/[slug]?... navigation (aynı URL formatı)

   ARCHITECTURE BOUNDARY:
     `fetchExternalCalendarStringsForVilla` SERVER-ONLY (getSupabaseAdmin
     kullanır). Modal client component olduğu için bu helper'ı doğrudan
     import EDEMEZ — service role key client bundle'a sızar / browser'da
     "SUPABASE_SERVICE_ROLE_KEY tanımlı değil" exception atar.
     Çözüm: yalnız TYPE + EMPTY constant import. Veri için server-side
     API route çağrılır.
   =============================================================== */

import { useEffect, useState } from "react";

import {
  X,
  Calendar,
  Users,
  ChevronDown,
} from "lucide-react";

import type { VillaPriceEmbed } from "@/lib/villa-row.types";
import {
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import BookingCalendar from "@/app/components/villa/booking/BookingCalendar";
import BookingSummary from "@/app/components/villa/booking/BookingSummary";
import BookingMinStayWarning from "@/app/components/villa/booking/BookingMinStayWarning";

type Props = {
  /* Modal open/close (parent owned). false ise content render
     edilmez → mount maliyeti yok. */
  isOpen: boolean;
  onClose: () => void;

  /* VillaCard'dan zaten geçilen identity — fetch yok. */
  villaId: string;
  villaSlug: string;
  villaTitle: string;
};

/* API response shape — /api/public/villas/[id]/availability. */
type VillaConfig = {
  deposit: number | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  custom_prepayment_rate: number | null;
  minimum_stay_nights: number | null;
};

const EMPTY_CONFIG: VillaConfig = {
  deposit: null,
  cleaning_fee: null,
  cleaning_currency: null,
  cleaning_limit: null,
  custom_prepayment_rate: null,
  minimum_stay_nights: null,
};

type AvailabilityApiResponse = {
  config: VillaConfig;
  prices: VillaPriceEmbed[];
  externalBlocks: ExternalCalendarStringArrays;
};

const EMPTY_API_DATA: AvailabilityApiResponse = {
  config: EMPTY_CONFIG,
  prices: [],
  externalBlocks: EMPTY_EXTERNAL_STRING_ARRAYS,
};

export default function VillaCardBookingModal({
  isOpen,
  onClose,
  villaId,
  villaSlug,
  villaTitle,
}: Props) {
  /* === Modal mount sonrası TEK API fetch ===
     Response = BookingSidebar'ın aldığı tüm engine input'ları
     (drift-proof). isOpen=false iken fetch ASLA çalışmaz. */
  const [apiData, setApiData] = useState<AvailabilityApiResponse | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;

    /* Her açılışta state reset — eski (stale) veri ile yeni villa
       fetch'i karışmasın. Farklı villaId ile yeniden açılırsa
       önceki villa'nın engine input'ları kısa süreliğine render
       edilirdi (flicker). null'a setlemek skeleton'a düşürür.
       React 19 `set-state-in-effect` rule trivial cascade'i flag
       eder; burada KASITLI reset — apiData prev ile next villa
       arasında karışmasın diye gerekli. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiData(null);

    let cancelled = false;
    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(
          `/api/public/villas/${encodeURIComponent(villaId)}/availability`,
          {
            method: "GET",
            cache: "no-store",
            signal: ac.signal,
          }
        );
        if (!res.ok) {
          console.error(
            "[VillaCardBookingModal] availability HTTP",
            res.status
          );
          /* Defansif fallback: engine yine mount olsun (boş inputs
             ile), UI tamamen kilitlenmesin. Kullanıcı tarih seçer,
             pricing 0 görünür → en azından feedback verir. */
          if (!cancelled) setApiData(EMPTY_API_DATA);
          return;
        }
        const data = (await res.json()) as Partial<AvailabilityApiResponse>;

        if (cancelled) return;

        const sanitizedConfig: VillaConfig = {
          deposit:
            typeof data?.config?.deposit === "number"
              ? data.config.deposit
              : null,
          cleaning_fee:
            typeof data?.config?.cleaning_fee === "number"
              ? data.config.cleaning_fee
              : null,
          cleaning_currency:
            typeof data?.config?.cleaning_currency === "string"
              ? data.config.cleaning_currency
              : null,
          cleaning_limit:
            typeof data?.config?.cleaning_limit === "number"
              ? data.config.cleaning_limit
              : null,
          custom_prepayment_rate:
            typeof data?.config?.custom_prepayment_rate === "number"
              ? data.config.custom_prepayment_rate
              : null,
          minimum_stay_nights:
            typeof data?.config?.minimum_stay_nights === "number"
              ? data.config.minimum_stay_nights
              : null,
        };

        setApiData({
          config: sanitizedConfig,
          prices: Array.isArray(data?.prices) ? data.prices : [],
          externalBlocks:
            data?.externalBlocks || EMPTY_EXTERNAL_STRING_ARRAYS,
        });
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        console.error(
          "[VillaCardBookingModal] availability EXCEPTION:",
          err
        );
        if (!cancelled) setApiData(EMPTY_API_DATA);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [isOpen, villaId]);

  /* === ESC tuşu → close === */
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  /* === Body scroll lock === */
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  /* Modal kapalıyken HİÇBİR ŞEY render etme. */
  if (!isOpen) return null;

  /* API hazır değilken minimal skeleton — backdrop + header + spinner.
     Engine ASLA mount olmaz (boş prices ile 0-fiyat flicker'ı önlenir). */
  if (!apiData) {
    return <ModalSkeleton villaTitle={villaTitle} onClose={onClose} />;
  }

  return (
    <ModalContent
      onClose={onClose}
      villaId={villaId}
      villaSlug={villaSlug}
      villaTitle={villaTitle}
      apiData={apiData}
    />
  );
}

/* ───────────────────────────────────────────────────────────────
   ModalSkeleton — API yüklenirken backdrop + header + minimal spinner.
   Aynı outer DOM yapısı → açılış-anı layout shift YOK.
─────────────────────────────────────────────────────────────── */
function ModalSkeleton({
  villaTitle,
  onClose,
}: {
  villaTitle: string;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Müsaitlik ve rezervasyon yükleniyor"
      className="fade-in fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
    >
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />
      <div
        className="
          relative
          w-full sm:w-[min(28rem,calc(100vw-2.5rem))]
          bg-white
          rounded-t-3xl sm:rounded-3xl
          border-t sm:border border-[var(--color-stone-100)]
          shadow-[0_-24px_48px_-16px_rgb(27_26_23/0.24)] sm:shadow-[0_24px_48px_-16px_rgb(27_26_23/0.24)]
          p-5 md:p-6
          space-y-5
        "
      >
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--color-stone-100)]">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
              Müsaitlik / Rezervasyon
            </p>
            <h2 className="font-display text-xl text-[var(--color-stone-900)] tracking-[-0.02em] mt-1 line-clamp-2">
              {villaTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 shrink-0 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <span
            className="w-8 h-8 rounded-full border-2 border-[var(--color-stone-200)] border-t-[var(--color-champagne-500)] animate-spin motion-reduce:animate-none"
            aria-hidden
          />
          <p className="text-[12px] tracking-[0.04em] text-[var(--color-stone-500)]">
            Müsaitlik yükleniyor…
          </p>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────────
   ModalContent — useBookingEngine'i kullanan iç render layer.
   Yalnızca apiData hazır olunca mount edilir.
─────────────────────────────────────────────────────────────── */
type ContentProps = {
  onClose: () => void;
  villaId: string;
  villaSlug: string;
  villaTitle: string;
  apiData: AvailabilityApiResponse;
};

function ModalContent({
  onClose,
  villaId,
  villaSlug,
  villaTitle,
  apiData,
}: ContentProps) {
  /* === DOMAIN — AYNI engine, TEK source-of-truth ===
     Input set BookingSidebar ile birebir aynı kaynaktan (API). */
  const engine = useBookingEngine({
    villaSlug,
    villaId,
    prices: apiData.prices,
    deposit: apiData.config.deposit ?? 0,
    cleaning_fee: apiData.config.cleaning_fee ?? 0,
    cleaning_currency: apiData.config.cleaning_currency ?? "TRY",
    cleaning_limit: apiData.config.cleaning_limit ?? 0,
    custom_prepayment_rate: apiData.config.custom_prepayment_rate,
    minimum_stay_nights: apiData.config.minimum_stay_nights,
    externalBlocks: apiData.externalBlocks,
  });

  const {
    startDate,
    endDate,
    adults,
    children,
    setAdults,
    setChildren,
    prepaymentRate,
    selectedNights,
    minStayThreshold,
    minimumStayValid,
    isGapOverride,
    result,
    prepayment,
    convertedDeposit,
    startingPrice,
    handleReservation,
  } = engine;

  /* Calendar always-visible (modal'da popup pattern yok).
     currentMonth — modal local UI state. freshSelection state'i
     UX polish ile kaldırıldı (BookingCalendar onSelect kendi
     içinde completed-range-reset davranışı uygular). */
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => new Date()
  );

  /* Guests popover — modal içinde inline dropdown. */
  const [openGuests, setOpenGuests] = useState(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Müsaitlik ve rezervasyon"
      className="fade-in fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
    >
      {/* Backdrop */}
      <div
        aria-hidden
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
      />

      {/* Panel */}
      <div
        className="
          relative
          w-full sm:w-[min(28rem,calc(100vw-2.5rem))]
          max-h-[92vh] sm:max-h-[88vh]
          overflow-y-auto
          bg-white
          rounded-t-3xl sm:rounded-3xl
          border-t sm:border border-[var(--color-stone-100)]
          shadow-[0_-24px_48px_-16px_rgb(27_26_23/0.24)] sm:shadow-[0_24px_48px_-16px_rgb(27_26_23/0.24)]
          p-5 md:p-6
          space-y-5
        "
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-[var(--color-stone-100)]">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
              Müsaitlik / Rezervasyon
            </p>
            <h2 className="font-display text-xl text-[var(--color-stone-900)] tracking-[-0.02em] mt-1 line-clamp-2">
              {villaTitle}
            </h2>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="font-display text-2xl text-[var(--color-stone-900)] tracking-[-0.02em]">
                {startingPrice}
              </span>
              <span className="text-[var(--color-stone-500)] text-sm">
                / gece
              </span>
              {/* Premium chip kaldırıldı (UI polish — user request).
                  Spacing: gap-1.5 + mt-2 layout korunur. */}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="w-9 h-9 shrink-0 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-600)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          >
            <X size={16} />
          </button>
        </div>

        {/* DATE display */}
        <div
          className="
            border border-[var(--color-stone-100)] rounded-xl
            px-4 py-3
            flex items-center gap-3
            bg-white
          "
        >
          <Calendar size={16} className="text-[var(--color-champagne-500)]" />
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
              Tarih
            </div>
            <div className="text-sm font-medium text-[var(--color-stone-900)] truncate">
              {startDate && endDate
                ? `${startDate.toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                })} – ${endDate.toLocaleDateString("tr-TR", {
                  day: "numeric",
                  month: "short",
                })}`
                : "Tarih seç"}
            </div>
          </div>
        </div>

        {/* Calendar — paylaşılan component, AYNI engine.
            UI Polish #3: wrapper w-full + box-border, padding eşit.
            BookingCalendar internally `.rdp-months !justify-center`
            kullanır → desktop + mobile DayPicker ortalanır. */}
        <div className="w-full box-border rounded-2xl border border-[var(--color-stone-100)] p-3 md:p-4">
          <BookingCalendar
            engine={engine}
            currentMonth={currentMonth}
            onCurrentMonthChange={setCurrentMonth}
            /* onSelectComplete verilmedi → modal calendar açık kalır,
               selection sonrası popup close DAVRANIŞI sidebar'a özgü. */
          />
        </div>

        {/* GUESTS */}
        <div className="relative">
          <div
            onClick={() => setOpenGuests(!openGuests)}
            className="
              border border-[var(--color-stone-100)] rounded-xl
              px-4 py-3
              flex items-center gap-3
              hover:border-[var(--color-champagne-500)] transition cursor-pointer
              bg-white
            "
          >
            <Users size={16} className="text-[var(--color-champagne-500)]" />
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
                Misafir
              </div>
              <div className="text-sm font-medium text-[var(--color-stone-900)]">
                {adults} yetişkin · {children} çocuk
              </div>
            </div>
            <ChevronDown
              size={14}
              className={`text-[var(--color-stone-400)] transition ${openGuests ? "rotate-180" : ""
                }`}
            />
          </div>

          {openGuests && (
            <div className="absolute z-50 mt-2 w-full bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_24px_48px_-16px_rgb(27_26_23/0.18)] p-5 space-y-4">
              <Counter
                label="Yetişkin"
                value={adults}
                min={1}
                onChange={setAdults}
              />
              <Counter
                label="Çocuk"
                value={children}
                min={0}
                onChange={setChildren}
              />
              <button
                onClick={() => setOpenGuests(false)}
                className="btn-dark w-full !py-2.5 mt-2"
              >
                Tamam
              </button>
            </div>
          )}
        </div>

        {minStayThreshold > 0 &&
          !!startDate &&
          !!endDate &&
          selectedNights < minStayThreshold &&
          !isGapOverride && (
            <BookingMinStayWarning
              minStayThreshold={minStayThreshold}
              selectedNights={selectedNights}
            />
          )}

        {/* 🛡️ GAP OVERRIDE bilgi metni — gerçek boşluğun tamamı dolduruluyor →
            min_stay esnetildi. Yeni kart/modal yok; sade inline not. */}
        {isGapOverride && (
          <p className="text-[12px] text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2">
            Kısa süreli boşluk fırsatı nedeniyle bu tarih aralığı rezerve
            edilebilir.
          </p>
        )}

        {startDate && endDate && result && (
          <BookingSummary
            result={result}
            prepayment={prepayment}
            prepaymentRate={prepaymentRate}
            convertedDeposit={convertedDeposit}
            deposit={apiData.config.deposit ?? 0}
          />
        )}

        <button
          onClick={handleReservation}
          disabled={!minimumStayValid}
          className={`btn-primary w-full !py-3.5 !text-sm ${
            !minimumStayValid ? "!opacity-50 !cursor-not-allowed" : ""
          }`}
        >
          Rezervasyon Yap
        </button>

        <p className="text-[11px] text-[var(--color-stone-400)] text-center leading-relaxed">
          Ücret seçilen tarihlere göre otomatik hesaplanır
        </p>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-sm font-medium text-[var(--color-stone-700)]">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-champagne-600)] transition disabled:opacity-30"
          disabled={value <= min}
        >
          −
        </button>
        <span className="w-6 text-center font-medium text-[var(--color-stone-900)]">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-[var(--color-champagne-500)] hover:text-[var(--color-champagne-600)] transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
