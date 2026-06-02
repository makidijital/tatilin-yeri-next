"use client";

/* ===============================================================
   🛡️ BookingMinStayWarning — minimum konaklama uyarı kartı
   ===============================================================
   PURE UI: BookingSidebar'daki "MINIMUM STAY WARNING CARD"
   bloğunun birebir karşılığı.

   Görünüm koşulu (caller karar verir):
     threshold>0 + BOTH dates selected + nights<threshold

   Bu component sadece koşulun true olduğu durumda mount edilir
   (sidebar'da olduğu gibi). İçeride ek conditional yok.
   =============================================================== */

import { CalendarDays } from "lucide-react";

type Props = {
  minStayThreshold: number;
  selectedNights: number;
};

export default function BookingMinStayWarning({
  minStayThreshold,
  selectedNights,
}: Props) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="
        fade-in
        rounded-2xl border border-[var(--color-champagne-200)]
        bg-[var(--color-champagne-50)] px-4 py-3.5
        flex items-start gap-3
      "
    >
      <span
        className="
          w-9 h-9 shrink-0 rounded-xl
          bg-white border border-[var(--color-champagne-200)]
          flex items-center justify-center
          text-[var(--color-champagne-700)]
        "
        aria-hidden
      >
        <CalendarDays size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--color-champagne-700)]">
          Minimum Konaklama
        </p>
        <p className="text-[13.5px] text-[var(--color-stone-800)] mt-1 leading-snug">
          Bu villa için minimum konaklama süresi{" "}
          <span className="font-semibold tabular-nums">
            {minStayThreshold}
          </span>{" "}
          gecedir.
        </p>
        <p className="text-[11.5px] text-[var(--color-stone-500)] mt-1 tabular-nums">
          Seçilen: {selectedNights} gece — lütfen daha uzun bir
          aralık seçin.
        </p>
      </div>
    </div>
  );
}
