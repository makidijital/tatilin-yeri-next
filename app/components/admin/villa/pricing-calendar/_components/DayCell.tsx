import { compactPrice as sharedCompactPrice } from "@/lib/format";

import { priceColorTone } from "../_helpers/color-tone";

import type {
  PricingCanvasRange,
  RangeBoundary,
} from "../_types/pricing-calendar";

// formatTRY / compactPrice → lib/format (TEK source-of-truth).
const compactPrice = sharedCompactPrice;

/* ===============================================================
   🛡️ FAZ 3 — DayCell (PURE PRESENTATIONAL)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde local function DayCell
   (L857-965) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL — INLINE STYLE alan-alan AYNEN:
     - height: 58
     - borderRadius: 8
     - background: baseBg
     - color: baseText
     - cursor: ternary
     - outline: 2px ya da 1px ternary (renk: champagne ya da rgba)
     - outlineOffset: -2 ya da -1 ternary
     - boxShadow: ternary string (champagne 0.45 alpha) ya da "none"
     - transition: EXACT-STRING
         "outline 0.12s ease, box-shadow 0.18s ease, transform 0.12s ease, background 0.18s ease"
     - transform: scale(1.02) ya da scale(1)
     - zIndex: 2 ya da 1
     - opacity: 1 ya da 0.35

   ⚠️ KESIN KURAL — TONE LOGIC:
     baseBg = !inCurrentMonth ? "transparent" : tone ? tone.bg : "#ffffff"
     baseText = !inCurrentMonth ? "#cbd5e1" : tone ? tone.text : "#475569"

   ⚠️ KESIN KURAL — ABSOLUTE INNER CHILDREN:
     - Date number top-1 left-1.5 absolute, opacity 0.8
     - Price label absolute inset-0 flex centered, paddingTop:10
     - compactPrice ile fontSize:12 fontWeight:700
     - "—" fallback fontSize:10 color:#cbd5e1

   ⚠️ KESIN KURAL — MOUSE EVENTS:
     - onMouseDown: e.preventDefault() + onCellDown(d)
     - onMouseEnter: onCellEnter(d)
     - inCurrentMonth=false durumunda her ikisi de no-op
=============================================================== */

export default function DayCell({
  date,
  inCurrentMonth,
  priceRange,
  isInActiveRange,
  boundary,
  isDraggingNow,
  minPrice,
  maxPrice,
  onCellDown,
  onCellEnter,
}: {
  date: Date;
  inCurrentMonth: boolean;
  priceRange: PricingCanvasRange | null;
  isInActiveRange: boolean;
  boundary: RangeBoundary;
  isDraggingNow: boolean;
  minPrice: number;
  maxPrice: number;
  onCellDown: (d: Date) => void;
  onCellEnter: (d: Date) => void;
}) {
  const tone = priceRange
    ? priceColorTone(priceRange.price, minPrice, maxPrice)
    : null;
  const baseBg = !inCurrentMonth
    ? "transparent"
    : tone
      ? tone.bg
      : "#ffffff";
  const baseText = !inCurrentMonth
    ? "#cbd5e1"
    : tone
      ? tone.text
      : "#475569";

  return (
    <div
      onMouseDown={(e) => {
        if (!inCurrentMonth) return;
        e.preventDefault();
        onCellDown(date);
      }}
      onMouseEnter={() => {
        if (!inCurrentMonth) return;
        onCellEnter(date);
      }}
      className="relative"
      style={{
        height: 58,
        borderRadius: 8,
        background: baseBg,
        color: baseText,
        cursor: inCurrentMonth ? "pointer" : "default",
        outline: isInActiveRange
          ? "2px solid var(--color-champagne-500, #c89b3c)"
          : "1px solid rgba(15,23,42,0.05)",
        outlineOffset: isInActiveRange ? -2 : -1,
        boxShadow:
          isInActiveRange && (boundary || isDraggingNow)
            ? "0 5px 14px -8px rgba(200,155,60,0.45)"
            : "none",
        transition:
          "outline 0.12s ease, box-shadow 0.18s ease, transform 0.12s ease, background 0.18s ease",
        transform:
          isInActiveRange && boundary ? "scale(1.02)" : "scale(1)",
        zIndex: isInActiveRange && boundary ? 2 : 1,
        opacity: inCurrentMonth ? 1 : 0.35,
      }}
    >
      <span
        className="absolute top-1 left-1.5 text-[10px] font-semibold leading-none tabular-nums"
        style={{ color: baseText, opacity: 0.8 }}
      >
        {date.getDate()}
      </span>

      {inCurrentMonth && (
        <div
          className="absolute inset-0 flex items-center justify-center px-1"
          style={{ paddingTop: 10 }}
        >
          {priceRange ? (
            <span
              className="font-display tabular-nums"
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "-0.01em",
                color: baseText,
              }}
            >
              {compactPrice(priceRange.price, priceRange.currency)}
            </span>
          ) : (
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "#cbd5e1" }}
            >
              —
            </span>
          )}
        </div>
      )}

    </div>
  );
}
