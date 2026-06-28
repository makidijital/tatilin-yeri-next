"use client";

import { Calendar, Moon } from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import { formatDateTr } from "@/lib/date-format";

/* ===============================================================
   🛡️ PriceList — VERTICAL STACK + MIN STAY PILL
   ===============================================================
   Eski yapı: grid (1 col mobile / 2 col tablet+) — yan yana kartlar.
   Yeni yapı: tek kolon vertical stack (mobile + desktop).
     - Daha editorial / nefes alan layout
     - Geniş kart: solda date-range + min-stay pill, sağda büyük
       fiyat (md+); mobile'da yığılı (vertical block).
     - Min. X Gece pill kart içinde gösterilir (props.minimumStayNights
       set ve > 0 ise).

   PRICING ENGINE DOKUNULMADI:
     - `convertPrice(price, currency, target, rates)` — AYNEN
     - `formatCurrency(value, currency)` — AYNEN
     - `useCurrency()` context — AYNEN
     - prices array sırası — service `start_date ASC` korunur
     - `Price` shape (id, start_date, end_date, price, currency) —
       birebir aynı; map iterasyonu aynı

   MIN STAY KAYNAĞI:
     `props.minimumStayNights` — villa-level field
     (`villa.minimum_stay_nights`). Yeni hesap YOK; mevcut BookingSidebar
     `minimum_stay_nights` prop'u ile aynı kaynak. null/0 → pill
     gösterilmez (UI noise yok).

   TARIH FORMATI:
     `formatDateTr` (lib/date-format) → "11 May 2026" formatı.
   =============================================================== */

type Price = {
  id: string;
  start_date: string;
  end_date: string;
  price: number;
  currency: string;
};

export default function PriceList({
  prices,
  minimumStayNights = null,
}: {
  prices: Price[];
  /* Villa-level min stay. null veya 0 → pill render edilmez.
     Optional + default null → eski caller'lar backward-compat çalışır. */
  minimumStayNights?: number | null;
}) {
  const { currency, rates } = useCurrency();

  /* Boş array yine de gelirse defansif fallback (caller outer'da
     zaten ternary ile koruyor; bu inner guard backward-compat). */
  if (!prices || prices.length === 0) {
    return (
      <p className="text-[var(--color-stone-400)] text-sm italic">
        Fiyat bilgisi yok
      </p>
    );
  }

  /* Min stay pill: yalnız geçerli pozitif tam sayı için. */
  const hasMinStay =
    typeof minimumStayNights === "number" &&
    Number.isFinite(minimumStayNights) &&
    minimumStayNights > 0;

  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {prices.map((p) => {
        /* Currency conversion — eski mantık AYNEN. */
        const convertedPrice = convertPrice(
          Number(p.price || 0),
          p.currency || "TRY",
          currency,
          rates
        );

        return (
          <div
            key={p.id}
            className="
              group relative overflow-hidden
              rounded-3xl border border-[var(--color-stone-100)]
              bg-gradient-to-br from-[var(--color-sand-50)]/70 via-white to-white
              px-5 py-4 md:px-6 md:py-5
              shadow-[0_6px_18px_-14px_rgba(11,31,58,0.18)]
              hover:-translate-y-0.5 hover:border-[var(--color-champagne-300)]
              hover:shadow-[0_16px_34px_-18px_rgba(11,31,58,0.22)]
              transition-[transform,box-shadow,border-color] duration-300
              motion-reduce:transition-none motion-reduce:hover:translate-y-0
            "
          >
            {/* TOP ACCENT BAR — subtle premium detail */}
            <span
              aria-hidden
              className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[var(--color-champagne-400)] via-[var(--brand-coral)] to-[var(--color-champagne-400)] opacity-70"
            />
            <div
              className="
                flex flex-col gap-4
                md:flex-row md:items-center md:justify-between md:gap-6
              "
            >
              {/* LEFT — date range eyebrow + min stay pill */}
              <div className="min-w-0 flex flex-col gap-2.5">
                {/* DATE RANGE — eyebrow tipi, küçük calendar icon */}
                <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] flex items-center gap-1.5">
                  <Calendar
                    size={11}
                    className="text-[var(--color-champagne-500)]"
                    aria-hidden
                  />
                  <span className="tabular-nums">
                    {formatDateTr(p.start_date)}
                    <span className="text-[var(--color-stone-300)] mx-1.5">
                      —
                    </span>
                    {formatDateTr(p.end_date)}
                  </span>
                </p>

                {/* MIN STAY PILL — villa-level field; render
                    yalnız set ve > 0 ise. */}
                {hasMinStay && (
                  <span
                    className="
                      inline-flex items-center gap-1.5 self-start
                      rounded-full bg-[var(--color-sand-50)]
                      border border-[var(--color-stone-100)]
                      px-2.5 py-1
                      text-[11px] font-medium tracking-wide
                      text-[var(--color-stone-700)]
                    "
                  >
                    <Moon
                      size={11}
                      className="text-[var(--color-champagne-500)]"
                      aria-hidden
                    />
                    Min. {minimumStayNights} Gece
                  </span>
                )}
              </div>

              {/* RIGHT — büyük fiyat + caption */}
              <div className="md:text-right md:shrink-0">
                <p
                  className="font-display text-xl md:text-[22px] text-[var(--color-stone-900)] tracking-[-0.02em] leading-none"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatCurrency(convertedPrice, currency)}
                </p>
                <p
                  className="text-[9.5px] tracking-[0.18em] uppercase text-[var(--color-stone-400)] font-medium mt-1.5"
                  aria-hidden
                >
                  Gecelik
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
