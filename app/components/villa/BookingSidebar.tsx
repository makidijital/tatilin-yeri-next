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
     - DayPicker handler davranışı (BookingCalendar içinde)
     - Selection lifecycle (freshSelection / hasConflict / getValidEndDate)
     - Half-open `[)` semantic, adjacent reservation rule
     - alert davranışı
     - Network query'leri (engine içinde, aynı SQL)
     - Navigation URL formatı
     - Currency / pricing / prepayment hesap sonuçları
     - onClick/disabled/submit/validation handler'ları

   🎨 UI REVİZYONU (bu tur): "Booking Desk" editorial tasarım — sticky
   kaldırıldı (page.tsx'te), ağır kart yerine soft/minimal panel, ince
   separator'lar, CHECK-IN/CHECK-OUT kompozisyonu, marka gradienti CTA'da.
   Yalnız JSX/className; state/handler/prop kontratı DEĞİŞMEDİ.
   =============================================================== */

import { useEffect, useRef, useState } from "react";

import { ChevronDown } from "lucide-react";

import { type VillaPriceEmbed } from "@/lib/villa-row.types";
import {
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.shared";

import { useBookingEngine } from "@/app/components/villa/booking/useBookingEngine";
import BookingCalendar from "@/app/components/villa/booking/BookingCalendar";
import BookingSummary from "@/app/components/villa/booking/BookingSummary";
import BookingMinStayWarning from "@/app/components/villa/booking/BookingMinStayWarning";

/* "Öne Çıkan" bilgi kartı metinleri — statik; API/DB/sayı/emoji YOK.
   Sayfa açılışında rastgele biri seçilir (client mount), sonra sabit. */
const FEATURED_NOTES = [
  "Bu bölgenin öne çıkan villa seçeneklerinden biri.",
  "Misafirlerin en çok ilgi gösterdiği villalar arasında yer alıyor.",
  "Son dönemde en çok incelenen villalar arasında.",
] as const;

/* 🛡️ PURE UI FORMAT HELPER — CHECK-IN/CHECK-OUT pill'lerinde tek bir
   tarihin gösterim biçimi. Eski tek-pill kodundaki
   `toLocaleDateString("tr-TR", { day: "numeric", month: "short" })`
   çağrısıyla BİREBİR aynı; state/hesaplama YOK, yalnız display format. */
function formatDatePillLabel(date: Date): string {
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "short",
  });
}

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
  /* 🛡️ Orphan-gap kuralı (admin ayarı). Default false → geçilmezse
     mevcut davranış. Villa page settings'ten değeri geçer. */
  orphanGapRuleEnabled?: boolean;
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
  orphanGapRuleEnabled = false,
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
    orphanGapRuleEnabled,
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
    isGapOverride,
    result,
    prepayment,
    convertedDeposit,
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

  /* Öne Çıkan bilgi kartı — sayfa ilk açıldığında rastgele TEK metin
     seçilir (client mount → SSR/hydration mismatch yok) ve sayfa boyunca
     sabit kalır. Business logic / fiyat / API / storage YOK. */
  const [featuredNote, setFeaturedNote] = useState<string | null>(null);
  useEffect(() => {
    /* Client-only rastgele seçim (SSR'de null → hydration-safe). Bu
       yüzden set-state-in-effect bilinçli ve gerekli. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFeaturedNote(
      FEATURED_NOTES[Math.floor(Math.random() * FEATURED_NOTES.length)]
    );
  }, []);

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
        relative rounded-[28px]
        bg-white border border-[var(--color-stone-100)]
        shadow-[0_1px_2px_rgba(11,31,58,0.05)]
        px-6 py-7 md:px-7 md:py-8
        space-y-6
      "
    >
      {/* ═══ EDİTORYAL GİRİŞ — "Booking Desk" başlığı (yeni, kısa/genel
          UI metni; gerçek işlev/metinlere dokunulmadı). ═══ */}
      <div>
        <span className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
          <span
            aria-hidden="true"
            className="inline-block w-3.5 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
          />
          Rezervasyon
        </span>
        <h2 className="mt-2 font-display text-[21px] md:text-[23px] leading-tight tracking-[-0.02em] text-[var(--color-stone-900)]">
          Konaklamanızı planlayın
        </h2>
        <p className="mt-1.5 text-[13px] text-[var(--color-stone-500)] leading-relaxed">
          Uygun tarihleri seçin, konaklama detaylarını hemen görüntüleyin.
        </p>
      </div>

      <div aria-hidden="true" className="h-px bg-[var(--color-stone-100)]" />

      {/* DATE — mevcut tarih seçim state/behavior/handler AYNEN; yalnız
         CHECK-IN / CHECK-OUT kompozisyonuna çevrildi. */}
      {/* 🛡️ id="booking-date-field" — MobileBookingCta scroll hedefi.
         Yalnız anchor; tasarım/tarih-seçim mantığı DEĞİŞMEZ. */}
      <div ref={ref} id="booking-date-field" className="relative">
        <div
          onClick={() => {
            const targetMonth = endDate || startDate || new Date();
            setCurrentMonth(targetMonth);
            setOpenCalendar(true);
          }}
          className="group flex items-center gap-4 cursor-pointer"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-400)] group-hover:text-[#ED7926] transition-colors duration-200 motion-reduce:transition-none">
              Check-in
            </div>
            <div className="mt-1 text-[15px] font-medium text-[var(--color-stone-900)] truncate">
              {startDate ? formatDatePillLabel(startDate) : "Tarih seç"}
            </div>
          </div>

          <span
            aria-hidden="true"
            className="w-px h-9 bg-[var(--color-stone-100)] shrink-0"
          />

          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-400)] group-hover:text-[#0973BA] transition-colors duration-200 motion-reduce:transition-none">
              Check-out
            </div>
            <div className="mt-1 text-[15px] font-medium text-[var(--color-stone-900)] truncate">
              {endDate ? formatDatePillLabel(endDate) : "Tarih seç"}
            </div>
          </div>

          <ChevronDown
            size={15}
            className={`shrink-0 text-[var(--color-stone-400)] transition-transform duration-200 motion-reduce:transition-none ${
              openCalendar ? "rotate-180" : ""
            }`}
          />
        </div>

        {openCalendar && (
          <div
            className="
              absolute right-0 z-[999] mt-4 bg-white border border-[var(--color-stone-100)]
              rounded-2xl shadow-[0_16px_40px_-16px_rgba(11,31,58,0.16)]
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

      <div aria-hidden="true" className="h-px bg-[var(--color-stone-100)]" />

      {/* GUESTS — mevcut guest selector state/behavior/handler AYNEN. */}
      <div ref={guestsRef} className="relative">
        <div
          onClick={() => setOpenGuests(!openGuests)}
          className="group flex items-center gap-4 cursor-pointer"
        >
          <div className="flex-1 min-w-0">
            <div className="text-[10px] tracking-[0.18em] uppercase font-semibold text-[var(--color-stone-400)] group-hover:text-[#ED7926] transition-colors duration-200 motion-reduce:transition-none">
              Misafir
            </div>
            <div className="mt-1 text-[15px] font-medium text-[var(--color-stone-900)]">
              {adults} yetişkin · {children} çocuk
            </div>
          </div>
          <ChevronDown
            size={15}
            className={`shrink-0 text-[var(--color-stone-400)] transition-transform duration-200 motion-reduce:transition-none ${
              openGuests ? "rotate-180" : ""
            }`}
          />
        </div>

        {openGuests && (
          <div className="absolute z-50 mt-3 w-full bg-white border border-[var(--color-stone-100)] rounded-2xl shadow-[0_16px_40px_-16px_rgba(11,31,58,0.16)] p-5 space-y-4">
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
              className="w-full rounded-full bg-[var(--color-stone-900)] hover:bg-[var(--color-stone-800)] text-white text-[13px] font-semibold py-2.5 transition-colors duration-200 motion-reduce:transition-none"
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
          shift YOK (warning ile summary mutually exclusive). Koşul AYNEN. */}
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

      {/* 🛡️ GAP OVERRIDE bilgi metni — koşul AYNEN. */}
      {isGapOverride && (
        <p className="text-[12px] text-emerald-700 bg-emerald-50/70 border border-emerald-100 rounded-xl px-3 py-2">
          Kısa süreli boşluk fırsatı nedeniyle bu tarih aralığı rezerve
          edilebilir.
        </p>
      )}

      {/* SUMMARY — minimum stay valid + result mevcut ise (koşul AYNEN).
         İnce üst-ayraç ile akışa entegre; BookingSummary'nin kendi
         içeriğine/hesabına dokunulmadı. */}
      {startDate && endDate && result && (
        <div>
          <div aria-hidden="true" className="h-px bg-[var(--color-stone-100)] mb-6" />
          <BookingSummary
            result={result}
            prepayment={prepayment}
            prepaymentRate={prepaymentRate}
            convertedDeposit={convertedDeposit}
            deposit={deposit}
          />
        </div>
      )}

      {/* 🛡️ INLINE RESERVATION ERROR — alert() yerine modern banner
          (koşul AYNEN). */}
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

      <div aria-hidden="true" className="h-px bg-[var(--color-stone-100)]" />

      {/* CTA — FAZ 26B: minimum stay invalid → disabled (koşul AYNEN).
          onClick/disabled/handler DEĞİŞMEDİ; yalnız görünüm yenilendi. */}
      <div className="space-y-3">
        <button
          onClick={handleReservation}
          disabled={!minimumStayValid}
          className={`
            w-full rounded-full py-4
            text-[14px] font-semibold tracking-[0.01em] text-white
            transition-all duration-200 motion-reduce:transition-none
            ${
              !minimumStayValid
                ? "bg-[var(--color-stone-300)] cursor-not-allowed"
                : "bg-gradient-to-r from-[#ED7926] to-[#0973BA] shadow-[0_16px_32px_-12px_rgba(9,115,186,0.45)] hover:shadow-[0_20px_40px_-12px_rgba(9,115,186,0.55)] hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            }
          `}
        >
          Rezervasyon Yap
        </button>

        <p className="text-[11px] text-[var(--color-stone-400)] text-center leading-relaxed">
          Ücret seçilen tarihlere göre otomatik hesaplanır
        </p>
      </div>

      {/* ÖNE ÇIKAN — bağımsız minimal bilgi notu (statik/rastgele metin,
         seçim mantığı AYNEN; yalnız görünüm yenilendi). */}
      {featuredNote && (
        <div className="pt-5 border-t border-[var(--color-stone-100)]">
          <p className="inline-flex items-center gap-1.5 text-[10.5px] tracking-[0.2em] uppercase text-[#0973BA] font-semibold">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-[#ED7926]"
            />
            Öne Çıkan
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--color-stone-600)]">
            {featuredNote}
          </p>
        </div>
      )}
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
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-[#ED7926]/60 hover:text-[#ED7926] transition disabled:opacity-30"
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
          className="w-8 h-8 rounded-full border border-[var(--color-stone-200)] flex items-center justify-center text-[var(--color-stone-700)] hover:border-[#ED7926]/60 hover:text-[#ED7926] transition"
        >
          +
        </button>
      </div>
    </div>
  );
}
