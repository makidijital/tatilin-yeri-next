"use client";

/* ===============================================================
   🛡️ BookingSidebar — CONTAINER/RENDER LAYER
   ===============================================================
   Domain logic'i (selection state, availability fetch, merged
   arrays, pricing, prepayment, minimum stay, navigation URL inşası)
   `useBookingEngine` hook'una delege edildi → codebase'de TEK booking
   state machine.

   Bu container yalnız:
     - UI state'i (openCalendar, openGuests, currentMonth, freshSelection)
     - DOM refs (click-outside)
     - Üst-seviye layout (price head + date pill + guests pill +
       summary + warning + CTA)

   Calendar/summary/warning gövdeleri paylaşılan child component'lere
   delege edildi (BookingCalendar, BookingSummary, BookingMinStayWarning)
   → modal aynı component'leri kullanır, drift YOK.

   DOKUNULMAYAN ÖZELLİKLER (BYTE-IDENTICAL kontrat):
     - DOM hiyerarşisi ve className string'leri
     - DayPicker handler davranışı (BookingCalendar içinde)
     - Selection lifecycle (freshSelection / hasConflict / getValidEndDate)
     - Half-open `[)` semantic, adjacent reservation rule
     - alert davranışı
     - Network query'leri (engine içinde, aynı SQL)
     - Navigation URL formatı
     - Currency / pricing / prepayment hesap sonuçları
   =============================================================== */

import { useEffect, useRef, useState } from "react";

import {
  Calendar,
  Users,
  ChevronDown,
  Sparkles,
} from "lucide-react";

import { type VillaPriceEmbed } from "@/lib/villa-row.types";
import {
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import BookingCalendar from "@/app/components/villa/booking/BookingCalendar";
import BookingSummary from "@/app/components/villa/booking/BookingSummary";
import BookingMinStayWarning from "@/app/components/villa/booking/BookingMinStayWarning";

type Props = {
  villaSlug: string;
  villaId: string;
  prices: VillaPriceEmbed[];
  deposit?: number;
  cleaning_fee?: number;
  cleaning_currency?: string;
  cleaning_limit?: number;
  /* Villaya özel ön ödeme oranı (override).
     null/undefined ise global settings kullanılır. */
  custom_prepayment_rate?: number | null;
  /* Minimum konaklama gece sayısı.
     null veya <=1 → enforcement YOK. Detay: useBookingEngine. */
  minimum_stay_nights?: number | null;
  /* /arama → detail navigasyonunda URL üzerinden gelen tarihler.
     Engine ilk render'da hidrate eder (lazy initializer). */
  initialStart?: string | null;
  initialEnd?: string | null;
  /* External iCal block date strings (server-fetched).
     Engine reservation/manual array'leriyle merge eder. */
  externalBlocks?: ExternalCalendarStringArrays;
};

export default function BookingSidebar({
  villaSlug,
  villaId,
  prices,
  deposit = 0,
  cleaning_fee = 0,
  cleaning_currency = "TRY",
  cleaning_limit = 0,
  custom_prepayment_rate = null,
  minimum_stay_nights = null,
  externalBlocks = EMPTY_EXTERNAL_STRING_ARRAYS,
  initialStart = null,
  initialEnd = null,
}: Props) {
  /* === DOMAIN — TEK SOURCE-OF-TRUTH === */
  const engine = useBookingEngine({
    villaSlug,
    villaId,
    prices,
    deposit,
    cleaning_fee,
    cleaning_currency,
    cleaning_limit,
    custom_prepayment_rate,
    minimum_stay_nights,
    externalBlocks,
    initialStart,
    initialEnd,
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
    result,
    prepayment,
    convertedDeposit,
    startingPrice,
    parseLocalDate,
    handleReservation,
    /* 🛡️ alert() yerine inline banner — null → gizli. */
    reservationError,
  } = engine;

  /* === UI STATE — CONTAINER OWNS === */
  const [openGuests, setOpenGuests] = useState(false);
  const [openCalendar, setOpenCalendar] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const guestsRef = useRef<HTMLDivElement>(null);

  /* currentMonth: takvim ilk açıldığında hangi ayı göstereceği.
     initialStart varsa o ay açılır → kullanıcı tarihlerini
     hemen görür. Yoksa bugünün ayı (eski davranış). */
  const [currentMonth, setCurrentMonth] = useState<Date>(() =>
    initialStart ? parseLocalDate(initialStart) : new Date()
  );
  /* freshSelection state'i kaldırıldı (UX polish — Booking.com pattern).
     Eskiden: pill açılışında freshSelection=true → calendar ilk click
     reset yapardı. Karmaşık state machine'di.
     Yeni: completed range varsa BookingCalendar onSelect kendi içinde
     resetler (selectedDay yeni `from` olur). Pill açılışında özel state
     gerekmiyor — kullanıcı önceki range'i görür, yeni güne tıklayınca
     reset olur (Booking.com/Airbnb davranışı). */

  /* === CLICK-OUTSIDE — UI dropdown close === */
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (ref.current && target && !ref.current.contains(target)) {
        setOpenCalendar(false);
      }
      if (
        guestsRef.current &&
        target &&
        !guestsRef.current.contains(target)
      ) {
        setOpenGuests(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () =>
      document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className="
        rounded-3xl border border-[var(--color-stone-100)]
        bg-white p-5 md:p-6
        shadow-[0_24px_48px_-16px_rgb(27_26_23/0.16)]
        space-y-5
      "
    >
      {/* PRICE HEAD */}
      <div className="flex items-end justify-between pb-5 border-b border-[var(--color-stone-100)]">
        <div>
          <p className="text-[10.5px] tracking-[0.16em] uppercase font-semibold text-[var(--color-stone-400)]">
            Başlangıç
          </p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="font-display text-3xl text-[var(--color-stone-900)] tracking-[-0.02em]">
              {startingPrice}
            </span>
            <span className="text-[var(--color-stone-500)] text-sm">
              / gece
            </span>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] tracking-[0.06em] uppercase font-medium text-[var(--color-champagne-600)] bg-[var(--color-sand-100)] rounded-full px-2.5 py-1">
          <Sparkles size={11} />
          Premium
        </span>
      </div>

      {/* DATE */}
      <div ref={ref} className="relative">
        <div
          onClick={() => {
            const targetMonth = endDate || startDate || new Date();
            setCurrentMonth(targetMonth);
            setOpenCalendar(true);
          }}
          className="
            border border-[var(--color-stone-100)] rounded-xl
            px-4 py-3
            flex items-center gap-3
            hover:border-[var(--color-champagne-500)] transition cursor-pointer
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
          <ChevronDown
            size={14}
            className={`text-[var(--color-stone-400)] transition ${openCalendar ? "rotate-180" : ""
              }`}
          />
        </div>

        {openCalendar && (
          <div
            className="
              absolute right-0 z-[999] mt-3 bg-white border border-[var(--color-stone-100)]/80
              rounded-2xl shadow-[0_12px_32px_-12px_rgb(27_26_23/0.12)]
              p-4 md:p-5
              w-[min(22rem,calc(100vw-2.5rem))]
            "
          >
            <BookingCalendar
              engine={engine}
              currentMonth={currentMonth}
              onCurrentMonthChange={setCurrentMonth}
              onSelectComplete={() => setOpenCalendar(false)}
            />
          </div>
        )}
      </div>

      {/* GUESTS */}
      <div ref={guestsRef} className="relative">
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

      {/* ═══════════════════════════════════════════════════════
          🛡️ FAZ 26B — MINIMUM STAY WARNING CARD
          ═══════════════════════════════════════════════════════
          Yalnız: threshold>0 + BOTH dates selected + nights<threshold.
          Konum: SUMMARY yerine aynı blokta render olur → layout
          shift YOK (warning ile summary mutually exclusive).
          Premium amber/champagne luxury warning dili. */}
      {minStayThreshold > 0 &&
        !!startDate &&
        !!endDate &&
        selectedNights < minStayThreshold && (
          <BookingMinStayWarning
            minStayThreshold={minStayThreshold}
            selectedNights={selectedNights}
          />
        )}

      {/* SUMMARY — minimum stay valid + result mevcut ise */}
      {startDate && endDate && result && (
        <BookingSummary
          result={result}
          prepayment={prepayment}
          prepaymentRate={prepaymentRate}
          convertedDeposit={convertedDeposit}
          deposit={deposit}
        />
      )}

      {/* 🛡️ INLINE RESERVATION ERROR — alert() yerine modern banner.
          useBookingEngine'in handleReservation içinde set ettiği
          reservationError state'i; 3sn sonra otomatik temizlenir. */}
      {reservationError && (
        <div
          role="alert"
          className="
            rounded-xl border border-red-200 bg-red-50
            px-3 py-2 text-[12.5px] text-red-700
            flex items-center gap-2
          "
        >
          <span aria-hidden>⚠️</span>
          <span className="flex-1">{reservationError}</span>
        </div>
      )}

      {/* CTA — FAZ 26B: minimum stay invalid → disabled.
          handleReservation içinde de defansif short-circuit
          var (state guard + return) — UI disable + handler guard double-layer. */}
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
