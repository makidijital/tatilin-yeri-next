"use client";

import { useState } from "react";
import { Calendar, Moon, ShieldCheck, Info } from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import { formatDateTr } from "@/lib/date-format";

/* ===============================================================
   🛡️ PriceList — EDITORIAL LIST (klasik kart/tablo DEĞİL)
   ===============================================================
   Her sezon ince bir border-bottom ile ayrılan yatay bir satır:
   solda büyük/güçlü tipografiyle tarih aralığı, sağda (aynı stille
   korunan) fiyat + kompakt bir "Bilgi" toggle. Bilgi paneli hover
   (desktop) veya tap (mobile — hover yok) ile açılır; absolute
   positioned popover olduğu için satırlar YER DEĞİŞTİRMEZ (layout
   jump yok).

   PRICING ENGINE DOKUNULMADI:
     - `convertPrice(price, currency, target, rates)` — AYNEN
     - `formatCurrency(value, currency)` — AYNEN
     - `useCurrency()` context — AYNEN
     - prices array sırası — service `start_date ASC` korunur
     - `Price` shape (id, start_date, end_date, price, currency) —
       birebir aynı; map iterasyonu aynı
     - Fiyat gösterimi (büyük rakam + "Gecelik" caption) AYNEN —
       yalnız satır içindeki KONUMU değişti.

   MIN STAY KAYNAĞI (değişmedi):
     `props.minimumStayNights` — villa-level field
     (`villa.minimum_stay_nights`). Yeni hesap YOK; mevcut
     BookingSidebar `minimum_stay_nights` prop'u ile aynı kaynak.
     null/0 → Bilgi panelinde satır gösterilmez.

   DEPOZİTO (yeni prop, mevcut veri):
     `props.deposit` — villa-level field (`villa.deposit`), TRY
     cinsinden DB'de tutuluyor (bkz. useBookingEngine.ts:
     `convertPrice(deposit, "TRY", currency, rates)`). AYNI
     dönüşüm burada birebir tekrarlanıyor — yeni DB alanı / yeni
     hesap YOK, sadece BookingSidebar'ın zaten kullandığı villa-level
     depozito değeri, aynı yöntemle bu bilgi panelinde de gösteriliyor.
     null/0/negatif → Bilgi panelinde satır gösterilmez.

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
  deposit = null,
}: {
  prices: Price[];
  /* Villa-level min stay. null veya 0 → Bilgi panelinde satır yok.
     Optional + default null → eski caller'lar backward-compat çalışır. */
  minimumStayNights?: number | null;
  /* Villa-level depozito (TRY). null/0 → Bilgi panelinde satır yok.
     Optional + default null → eski caller'lar backward-compat çalışır. */
  deposit?: number | null;
}) {
  const { currency, rates } = useCurrency();
  const [openId, setOpenId] = useState<string | null>(null);

  /* Boş array yine de gelirse defansif fallback (caller outer'da
     zaten ternary ile koruyor; bu inner guard backward-compat). */
  if (!prices || prices.length === 0) {
    return (
      <p className="text-[var(--color-stone-400)] text-sm italic">
        Fiyat bilgisi yok
      </p>
    );
  }

  /* Bilgi panelinde gösterilecek veriler — yalnız GERÇEKTEN mevcutsa. */
  const hasMinStay =
    typeof minimumStayNights === "number" &&
    Number.isFinite(minimumStayNights) &&
    minimumStayNights > 0;

  const hasDeposit =
    typeof deposit === "number" && Number.isFinite(deposit) && deposit > 0;

  const convertedDeposit = hasDeposit
    ? convertPrice(deposit as number, "TRY", currency, rates)
    : 0;

  const hasInfo = hasMinStay || hasDeposit;

  return (
    <div className="bg-white">
      {prices.map((p) => {
        /* Currency conversion — eski mantık AYNEN. */
        const convertedPrice = convertPrice(
          Number(p.price || 0),
          p.currency || "TRY",
          currency,
          rates
        );
        const isOpen = openId === p.id;

        return (
          <div
            key={p.id}
            className="border-b border-[var(--color-stone-100)] py-4 md:py-5 last:border-b-0"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
              {/* LEFT — tarih aralığı, büyük/güçlü, ana bilgi. */}
              <p className="min-w-0 font-display text-[19px] md:text-[22px] text-[var(--color-stone-900)] tracking-[-0.01em] leading-snug flex items-center gap-2">
                <Calendar
                  size={15}
                  strokeWidth={1.8}
                  className="hidden md:inline text-[#0973BA] shrink-0"
                  aria-hidden
                />
                <span className="tabular-nums">
                  {formatDateTr(p.start_date)}
                  <span className="mx-2 text-[var(--color-stone-300)]">
                    —
                  </span>
                  {formatDateTr(p.end_date)}
                </span>
              </p>

              {/* RIGHT — fiyat (mevcut stil AYNEN) + kompakt Bilgi toggle. */}
              <div className="flex items-center gap-4 md:gap-5 shrink-0">
                <div className="text-left md:text-right">
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

                {/* BILGI — yalnız gösterilecek gerçek veri varsa render
                    edilir. Desktop: hover ile açılır/kapanır. Mobile
                    (hover yok): tap ile toggle. Panel absolute
                    positioned → satır yüksekliği değişmez, layout
                    zıplamaz. */}
                {hasInfo && (
                  <div
                    className="relative"
                    onMouseEnter={() => setOpenId(p.id)}
                    onMouseLeave={() =>
                      setOpenId((cur) => (cur === p.id ? null : cur))
                    }
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenId((cur) => (cur === p.id ? null : p.id))
                      }
                      aria-expanded={isOpen}
                      className={
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium tracking-wide transition-colors duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40 " +
                        (isOpen
                          ? "border-[#0973BA]/30 bg-[#0973BA]/[0.06] text-[#0973BA]"
                          : "border-[var(--color-stone-200)] text-[var(--color-stone-500)] hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-700)]")
                      }
                    >
                      <Info size={12} strokeWidth={2} aria-hidden />
                      Bilgi
                    </button>

                    {isOpen && (
                      <div
                        role="note"
                        className="absolute right-0 top-full z-10 mt-2 w-60 rounded-xl border border-[var(--color-stone-100)] bg-white p-3.5 shadow-[0_10px_24px_-14px_rgba(11,31,58,0.22)]"
                      >
                        <ul className="space-y-2">
                          {hasMinStay && (
                            <li className="flex items-center gap-2 text-[12.5px] text-[var(--color-stone-700)]">
                              <Moon
                                size={13}
                                strokeWidth={1.8}
                                className="text-[#ED7926] shrink-0"
                                aria-hidden
                              />
                              Min. {minimumStayNights} Gece
                            </li>
                          )}
                          {hasDeposit && (
                            <li className="flex items-center gap-2 text-[12.5px] text-[var(--color-stone-700)]">
                              <ShieldCheck
                                size={13}
                                strokeWidth={1.8}
                                className="text-[#0973BA] shrink-0"
                                aria-hidden
                              />
                              Depozito: {formatCurrency(convertedDeposit, currency)}
                            </li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
