import { useMemo } from "react";

import {
  buildMonthGrid,
  dayKey,
  MONTH_NAMES_TR,
  WEEKDAY_TR,
} from "../_helpers/date-math";
import { isInRange, isRangeBoundary } from "../_helpers/range-predicate";

import DayCell from "./DayCell";

import type { PricingCanvasRange } from "../_types/pricing-calendar";

/* ===============================================================
   🛡️ FAZ 3 — MonthBlock (PURE PRESENTATIONAL)
   ===============================================================
   Eski `PricingCalendarCanvas.tsx` içinde local function MonthBlock
   (L787-852) BYTE-IDENTICAL kopyası.

   ⚠️ KESIN KURAL:
     - `useMemo(() => buildMonthGrid(monthStart), [monthStart])`
       dep array AYNEN.
     - 42 cell render order AYNEN.
     - monthLabel = `${MONTH_NAMES_TR[idx]} ${year}`
     - weekday header: WEEKDAY_TR.map() — Mon→Paz order.
     - grid-cols-7 gap-1 mb-1 sınıfları aynen.
=============================================================== */

export default function MonthBlock({
  monthStart,
  dayPriceMap,
  minPrice,
  maxPrice,
  activeFrom,
  activeTo,
  isDraggingNow,
  onCellDown,
  onCellEnter,
}: {
  monthStart: Date;
  dayPriceMap: Map<string, PricingCanvasRange>;
  minPrice: number;
  maxPrice: number;
  activeFrom: Date | null;
  activeTo: Date | null;
  isDraggingNow: boolean;
  onCellDown: (d: Date) => void;
  onCellEnter: (d: Date) => void;
}) {
  const cells = useMemo(
    () => buildMonthGrid(monthStart),
    [monthStart]
  );
  const monthLabel = `${MONTH_NAMES_TR[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
  const monthIdx = monthStart.getMonth();

  return (
    <div className="min-w-0">
      <h3 className="font-display text-base text-[var(--color-stone-900)] tracking-[-0.015em] mb-2">
        {monthLabel}
      </h3>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_TR.map((w) => (
          <div
            key={w}
            className="text-[9px] tracking-[0.14em] uppercase font-bold text-[var(--color-stone-400)] text-center py-0.5"
          >
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const inCurrentMonth = d.getMonth() === monthIdx;
          return (
            <DayCell
              key={i}
              date={d}
              inCurrentMonth={inCurrentMonth}
              priceRange={dayPriceMap.get(dayKey(d)) || null}
              isInActiveRange={isInRange(d, activeFrom, activeTo)}
              boundary={isRangeBoundary(d, activeFrom, activeTo)}
              isDraggingNow={isDraggingNow}
              minPrice={minPrice}
              maxPrice={maxPrice}
              onCellDown={onCellDown}
              onCellEnter={onCellEnter}
            />
          );
        })}
      </div>
    </div>
  );
}
