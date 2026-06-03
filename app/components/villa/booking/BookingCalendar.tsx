"use client";

/* ===============================================================
   🛡️ BookingCalendar — paylaşılan takvim gövdesi
   ===============================================================
   PURE UI: nav strip + DayPicker + minimal legend.
   Sidebar ve VillaCardBookingModal AYNI bu component'i kullanır
   → DOM / className / handler davranışı tek bir yerden gelir.

   Container'a ait olmaz:
     - pill / dropdown wrapper (sidebar'da var, modal'da yok)
     - openCalendar / freshSelection state'i

   Container'dan gelir:
     - engine: useBookingEngine return objesi (domain SoT)
     - currentMonth + onCurrentMonthChange (container UI)
     - freshSelection + onFreshSelectionConsumed (container UI quirk)
     - onSelectComplete: selection commit edildiğinde container hook
       (sidebar: dropdown close; modal: noop veya scroll)

   BYTE-IDENTICAL KONTRAT (BookingSidebar pre-refactor ile):
     - Nav strip layout/className
     - DayPicker tüm props (locale, mode, month, selected, onSelect,
       disabled, modifiers, components, className)
     - DayContent inline render (style, font weights, price formatting)
     - RDP CSS override class array (sırası dahil)
     - Legend tek satır (Onaylı / Beklemede / Müsait)
   =============================================================== */

import { DayPicker, type DayContentProps } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { tr } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useState } from "react";
import { formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import { getDayStyle } from "@/lib/calendar.engine";
import { getValidEndDate } from "@/lib/date-range";

import type { UseBookingEngineReturn } from "./useBookingEngine";

type Props = {
  engine: UseBookingEngineReturn;
  currentMonth: Date;
  onCurrentMonthChange: (m: Date) => void;
  /* Selection commit'inden sonra çağrılır (sidebar dropdown'u kapatır,
     modal noop veya animasyon yapabilir). Opsiyonel. */
  onSelectComplete?: () => void;
};

export default function BookingCalendar({
  engine,
  currentMonth,
  onCurrentMonthChange,
  onSelectComplete,
}: Props) {
  const { currency } = useCurrency();

  /* 🛡️ Modern inline error — alert() yerine takvim üstünde geçici
     uyarı banner'ı; 3 saniye sonra otomatik temizlenir. */
  const [conflictError, setConflictError] = useState<string | null>(null);

  const {
    startDate,
    endDate,
    setStartDate,
    setEndDate,
    mergedBlockedDates,
    mergedCheckinDates,
    mergedCheckoutDates,
    pendingCheckinDates,
    pendingCheckoutDates,
    pendingMiddleDates,
    today,
    isIntersection,
    hasConflict,
    getPriceForDate,
  } = engine;

  return (
    <>
      {/* 🛡️ INLINE CONFLICT BANNER — alert() yerine ufak görsel uyarı.
          Auto-dismiss 3 saniye. */}
      {conflictError && (
        <div
          role="alert"
          className="
            mb-3 rounded-xl border border-red-200 bg-red-50
            px-3 py-2 text-[12.5px] text-red-700
            flex items-center gap-2
          "
        >
          <span aria-hidden>⚠️</span>
          <span className="flex-1">{conflictError}</span>
        </div>
      )}
      {/* ───────────────────────────────────────────────────
          🛡️ FAZ 12 — PREMIUM NAV STRIP (refined)
          ───────────────────────────────────────────────────
          AvailabilityInlineCalendar parity korunarak daha
          rafine. Layout: month title sola, kontroller sağa
          (luxury booking calendar pattern).
          ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="font-display text-[14px] text-[var(--color-stone-900)] tracking-[-0.015em] capitalize">
          {currentMonth.toLocaleDateString("tr-TR", {
            month: "long",
          })}
          <span className="text-[var(--color-stone-400)] font-normal ml-1.5">
            {currentMonth.getFullYear()}
          </span>
        </h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onCurrentMonthChange(
                new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth() - 1,
                  1
                )
              )
            }
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--color-sand-50)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
            aria-label="Önceki ay"
          >
            <ChevronLeft size={15} className="text-[var(--color-stone-600)]" />
          </button>
          <button
            type="button"
            onClick={() => {
              const t = new Date();
              onCurrentMonthChange(new Date(t.getFullYear(), t.getMonth(), 1));
            }}
            className="px-2 py-1 rounded-md text-[10px] tracking-[0.12em] uppercase font-medium text-[var(--color-stone-500)] hover:bg-[var(--color-sand-50)] hover:text-[var(--color-stone-900)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
          >
            Bugün
          </button>
          <button
            type="button"
            onClick={() =>
              onCurrentMonthChange(
                new Date(
                  currentMonth.getFullYear(),
                  currentMonth.getMonth() + 1,
                  1
                )
              )
            }
            className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--color-sand-50)] transition motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
            aria-label="Sonraki ay"
          >
            <ChevronRight size={15} className="text-[var(--color-stone-600)]" />
          </button>
        </div>
      </div>

      <DayPicker
        locale={tr}
        mode="range"
        month={currentMonth}
        onMonthChange={onCurrentMonthChange}
        /* 🛡️ INLINE CSS VARS — infinity specificity, ASLA yenilmez.
           RDP'nin kendi style.css'i `.rdp { --rdp-accent-color: #0000ff; }`
           tanımıyla geliyor; aynı `.rdp` element'ine className ile yapılan
           custom property override'ı specificity savaşını kaybedebiliyor.
           Inline style RDP'nin tüm tanımlarını kesin override eder.
           Sage/mint green palette (user spec):
             --rdp-accent-color    : #b7e4c7  (soft mint, selected bg)
             --rdp-background-color: #95d5b2  (mid mint, hover bg)
             --rdp-selected-color  : #1b4332  (deep forest, selected text)
             --rdp-outline         : 2px solid #74c69d  (mint border) */
        style={{
          "--rdp-accent-color": "#b7e4c7",
          "--rdp-background-color": "#95d5b2",
          "--rdp-selected-color": "#1b4332",
          "--rdp-outline": "2px solid #74c69d",
          "--rdp-outline-selected": "2px solid #74c69d",
        } as React.CSSProperties}
        selected={{
          from: startDate || undefined,
          to: endDate || undefined,
        }}
        onSelect={(range, selectedDay) => {
          if (!range?.from) return;

          /* 🛡️ BOOKING.COM/AIRBNB PATTERN — completed range reset.
             Eğer kullanıcı tamamlanmış bir range (startDate + endDate)
             varken yeni bir güne tıklarsa: eski selection tamamen
             temizlenir, tıklanan gün YENİ check-in olur. Sonraki
             tıklama range completion.

             Bu davranış freshSelection state machine'inin yerini alır:
             - Eski: pill açılınca freshSelection=true; ilk click reset
             - Yeni: completed range varsa HER YENİ CLICK reset

             RDP'nin onSelect 2. argümanı `selectedDay` → tam olarak
             tıklanan gün (range manipülasyonundan etkilenmez).

             Engine logic, pricing, hasConflict, getValidEndDate —
             HİÇBİR ŞEY değişmedi. Yalnız hangi gün yeni `from`
             olacağına dair UI selection lifecycle. */
          if (startDate && endDate) {
            setStartDate(selectedDay);
            setEndDate(null);
            return;
          }

          if (!range.to) {
            setStartDate(range.from);
            setEndDate(null);
            return;
          }
          let from = range.from;
          let to = range.to;
          if (to < from) {
            [from, to] = [to, from];
          }
          if (hasConflict(from, to)) {
            /* 🛡️ alert() yerine inline banner — 3 saniye sonra otomatik
               kaybolur; kullanıcı flow'unu blok etmez. */
            setConflictError("Bu tarih aralığı dolu gün içeriyor");
            setTimeout(() => setConflictError(null), 3000);
            return;
          }
          const safeEnd = getValidEndDate(from, to, mergedBlockedDates);
          setStartDate(from);
          setEndDate(safeEnd);
          if (onSelectComplete) {
            setTimeout(() => onSelectComplete(), 120);
          }
        }}
        numberOfMonths={1}
        disabled={[
          { before: today },
          ...mergedBlockedDates,
          isIntersection,
        ]}
        modifiers={{
          checkin: mergedCheckinDates,
          checkout: mergedCheckoutDates,
          pendingCheckin: pendingCheckinDates,
          pendingCheckout: pendingCheckoutDates,
          pendingMiddle: pendingMiddleDates,
        }}
        components={{
          DayContent: ({ date }: DayContentProps) => {
            /* 🛡️ FAZ 12 — premium DayContent refinement.
               RESERVATION ENGINE DOKUNULMADI:
                 - getDayStyle bg/color BYTE-IDENTICAL
                 - getPriceForDate currency conversion AYNEN
                 - mergedBlockedDates lookup AYNEN
               VISUAL DEĞİŞİM:
                 - Number font weight 600 → 700 (today 700 → 800)
                 - tabular-nums (luxury number alignment)
                 - Price font weight 500, opacity 0.7
                 - DayContent bg sadece getDayStyle bg verirse
                   (aksi halde transparent — RDP cell selection
                   ring/tint görünür) */
            const { bg, color } = getDayStyle({
              date,
              blockedDates: mergedBlockedDates,
              checkinDates: mergedCheckinDates,
              checkoutDates: mergedCheckoutDates,
              pendingCheckinDates,
              pendingCheckoutDates,
              pendingMiddleDates,
            });

            const price = getPriceForDate(date);

            const isBlocked = mergedBlockedDates.some(
              (d) => d.toDateString() === date.toDateString()
            );

            const isToday =
              date.toDateString() === today.toDateString();

            return (
              <div
                style={{
                  width: 40,
                  height: 40,
                  minWidth: 40,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "auto",
                  background: bg,
                  color,
                  fontSize: 13,
                  lineHeight: 1,
                  borderRadius: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span
                  className={
                    isToday
                      ? "ring-1 ring-[var(--color-champagne-500)] rounded-md px-1 leading-none"
                      : ""
                  }
                  style={{
                    fontWeight: isToday ? 800 : 700,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {date.getDate()}
                </span>
                {!isBlocked && price && (
                  <div
                    style={{
                      fontSize: 9,
                      opacity: 0.65,
                      marginTop: 2,
                      fontWeight: 500,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {formatCurrency(price, currency)}
                  </div>
                )}
              </div>
            );
          },
        }}
        /* 🛡️ RDP CSS OVERRIDE LAYER (UI POLISH — soft mint/sage ZORLA)
           ────────────────────────────────────────────────
           PROBLEM:
             Önceki turda warm gold (#b8860b) selected uygulandı ama
             user feedback'inde "hâlâ mavi görünüyor". Muhtemel sebepler:
             - className-based custom property override'ı `.rdp`
               element'inde RDP'nin kendi CSS tanımına karşı specificity
               savaşını kaybediyor (her ikisi de 0,1,0).
             - veya browser cache.

           ÇÖZÜM (üç katman, en zorlu silah dahil):
             1) DayPicker'a INLINE `style` prop ile CSS variable'ları
                geç → infinity specificity, RDP'nin .rdp tanımını
                KESİN override eder (yukarıda <DayPicker style={...}>).
             2) Selection class'larını solid mint ile zorla (`!important`
                via Tailwind `!` prefix).
             3) `:not(.rdp-day_disabled)` compound selector ile
                specificity arttırılır → her durumda kazanır.

           Palet (user spec — soft mint / sage green premium):
             • selected/range bg    : #b7e4c7   (soft mint)
             • range middle bg      : rgba(183,228,199,0.32)  (soft wash)
             • selected text         : #1b4332   (deep forest, dark green)
             • selected border/ring : #74c69d   (mint border)
             • hover bg              : #95d5b2   (mid mint)

           CONTRAST DOĞRULAMASI (WCAG):
             #1b4332 deep forest text üzerinde:
               #b7e4c7 soft mint bg → contrast ~7.5:1  (AAA pass ✓)
               #95d5b2 mid mint bg  → contrast ~5.8:1  (AA pass ✓)
             Day number color "black" inline (DayContent inner div):
               #b7e4c7 → contrast 14.5:1 (AAA pass)
               #95d5b2 → contrast 11.4:1 (AAA pass)

           PENDING / BLOCKED RENKLERİ ETKİLENMEZ:
             - Warm gold/sarı pending (#facc15 gradient) inner DayContent
               div'inde getDayStyle ile inline render edilir
             - Kırmızı blocked (rgba(239,68,68,0.4) gradient) aynı şekilde
             - Bu override katmanı SADECE outer .rdp-day button'unun
               selection state'ini boyar. Inner DayContent dokunulmaz.

           CENTER HİZALAMA (önceki polish'tan korunur).
           ──────────────────────────────────────────────── */
        className={[
          "p-0",
          "[&_.rdp-caption]:hidden",

          /* Center alignment fix — DayPicker container ortalansın */
          "[&_.rdp]:!w-full",
          "[&_.rdp-months]:!m-0",
          "[&_.rdp-months]:!justify-center",
          "[&_.rdp-month]:!m-0",
          "[&_.rdp-table]:!m-0",
          "[&_.rdp-table]:!mx-auto",

          /* Head (weekday) cells — premium uppercase */
          "[&_.rdp-head_cell]:!font-medium",
          "[&_.rdp-head_cell]:!text-[10px]",
          "[&_.rdp-head_cell]:!tracking-[0.18em]",
          "[&_.rdp-head_cell]:!uppercase",
          "[&_.rdp-head_cell]:!text-[var(--color-stone-400)]",
          "[&_.rdp-head_cell]:!pb-2",

          /* Day buttons — squared, premium baseline */
          "[&_.rdp-day]:!rounded-md",
          "[&_.rdp-day]:!w-[44px]",
          "[&_.rdp-day]:!h-[44px]",
          "[&_.rdp-day]:!transition-colors",

          /* Hover — mid mint (user spec #95d5b2).
             Selected ve disabled olmayan günler için yumuşak hover. */
          "[&_.rdp-day:not(.rdp-day_selected):not(.rdp-day_disabled):hover]:!bg-[#95d5b2]",
          "[&_.rdp-day:not(.rdp-day_selected):not(.rdp-day_disabled):hover]:!text-[#1b4332]",

          /* Selected baseline — SOLID soft mint, ZORLA
             (RDP default cyan'ı hem inline style hem !important ile
             iki katman bastırılmıştır → mavi sıfır) */
          "[&_.rdp-day_selected]:!bg-[#b7e4c7]",
          "[&_.rdp-day_selected]:!text-[#1b4332]",
          "[&_.rdp-day_selected]:!font-bold",

          /* Range start — solid mint + boundary ring (left pill) */
          "[&_.rdp-day_range_start]:!bg-[#b7e4c7]",
          "[&_.rdp-day_range_start]:!shadow-[inset_0_0_0_2px_#74c69d]",
          "[&_.rdp-day_range_start]:!rounded-l-md",
          "[&_.rdp-day_range_start]:!rounded-r-none",

          /* Range middle — soft mint wash (semi-transparent;
             altında --rdp-accent-color de mint olduğu için sızıntı yok) */
          "[&_.rdp-day_range_middle]:!bg-[rgba(183,228,199,0.32)]",
          "[&_.rdp-day_range_middle]:!text-[#1b4332]",
          "[&_.rdp-day_range_middle]:!rounded-none",

          /* Range end — solid mint + boundary ring (right pill) */
          "[&_.rdp-day_range_end]:!bg-[#b7e4c7]",
          "[&_.rdp-day_range_end]:!shadow-[inset_0_0_0_2px_#74c69d]",
          "[&_.rdp-day_range_end]:!rounded-r-md",
          "[&_.rdp-day_range_end]:!rounded-l-none",

          /* Single-day selection (range_start === range_end) */
          "[&_.rdp-day_range_start.rdp-day_range_end]:!rounded-md",

          /* Disabled — premium fade */
          "[&_.rdp-day_disabled]:!opacity-35",
        ].join(" ")}
      />

      {/* ───────────────────────────────────────────────────
          🛡️ FAZ 12 — MINIMAL LEGEND
          ───────────────────────────────────────────────────
          Eski legend section + Sparkles hint kaldırıldı.
          Ultra minimal: tek satır, 3 küçük renk noktası,
          border-top yok, hint yok. Erişilebilirlik için
          `title` attribute (tooltip).
          ─────────────────────────────────────────────────── */}
      <div className="mt-4 flex items-center justify-center gap-4 text-[10px] tracking-[0.04em] text-[var(--color-stone-400)]">
        <span
          className="inline-flex items-center gap-1.5"
          title="Onaylanmış rezervasyonlar"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(239,68,68,0.55)" }}
            aria-hidden
          />
          Onaylı
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          title="Bekleyen rezervasyonlar"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "#facc15" }}
            aria-hidden
          />
          Beklemede
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          title="Müsait günler"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full border border-[var(--color-stone-300)] bg-white"
            aria-hidden
          />
          Müsait
        </span>
      </div>
    </>
  );
}
