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
       yalnız satır içindeki KONUMU ve GÖRSEL stili değişti.

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

   🛡️ GÖRSEL REVİZYON (yalnız bu tur — data/state/handler DEĞİŞMEDİ):
     - Ana kart: sade beyazdan, çok hafif sıcak gradient zemin + ince
       turuncu→mavi üst accent çizgisi + iki-tonlu (turuncu/mavi) soft
       ambient box-shadow'a geçti. Container'a `overflow-hidden`
       BİLEREK eklenmedi — Bilgi popover'ı (son satırda) absolute
       olarak container sınırının altına taşabilir, kırpılmamalı.
     - Her sezon satırı artık kendi ince border'ı + sol turuncu→mavi
       accent çubuğu olan ayrı bir "satır kartı"; hover'da hafif
       yükselir (translateY) ve iki-tonlu glow şiddetlenir.
     - Fiyat rakamı: font-bold + `#ED7926`, bir kademe büyütüldü.
     - Tarih: takvim ikonu artık mavi tonlu bir rozet içinde; tire
       ayracı turuncu tonda ince bir vurgu.
     - Bilgi butonu ve popover paneli aynı iki-tonlu palete taşındı;
       popover'ın konumlanması/instant-toggle davranışı DEĞİŞMEDİ,
       yalnız açılışta çok hafif fade+scale animasyonu eklendi.
     - Satır girişinde hafif stagger fade/translate animasyonu
       (`idx * 70ms` gecikme) — yalnızca dekoratif, veri/sıralamaya
       dokunmuyor.
     - Tüm özel animasyonlar `@media (prefers-reduced-motion:
       no-preference)` guard'lı; Tailwind `motion-reduce:` varyantları
       hover transform'ları da reduced-motion'da sıfırlıyor.
     - Animasyon/keyframe'ler yalnız bu dosyada scoped `<style>` ile —
       globals.css'e dokunulmadı.
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
    <div
      className="
        relative mt-5 rounded-[20px]
        border border-[var(--color-stone-100)]
        bg-gradient-to-br from-white via-white to-[#FFF7F0]
        shadow-[0_20px_48px_-30px_rgba(237,121,38,0.22),0_24px_54px_-32px_rgba(9,115,186,0.18)]
        p-6 md:p-7
      "
    >
      {/* 🛡️ Scoped animasyon — yalnız bu component. globals.css'e
          dokunulmadı; class isimleri (pl-*) proje genelinde eşsiz. */}
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .pl-row-in {
            animation: pl-row-in-kf 500ms cubic-bezier(0.16, 1, 0.3, 1) both;
          }
          .pl-popover-in {
            animation: pl-popover-in-kf 180ms ease-out both;
          }
        }
        @keyframes pl-row-in-kf {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pl-popover-in-kf {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* İnce üst accent çizgisi — turuncu → mavi (marka imzası) */}
      <span
        aria-hidden="true"
        className="absolute inset-x-6 md:inset-x-7 top-0 h-[2.5px] rounded-full bg-gradient-to-r from-[#ED7926] via-[#ED7926]/50 to-[#0973BA]"
      />

      {prices.map((p, idx) => {
        /* Currency conversion — eski mantık AYNEN. */
        const convertedPrice = convertPrice(
          Number(p.price || 0),
          p.currency || "TRY",
          currency,
          rates
        );
        const isOpen = openId === p.id;
        /* Son sezon satırı — popover'ı yukarı doğru aç (aşağıda
           içerik/viewport sonu olabilir). Salt render-time hesap;
           yeni state veya JS ölçüm YOK. */
        const isLastRow = idx === prices.length - 1;

        return (
          <div
            key={p.id}
            className={
              "pl-row-in group/row relative rounded-2xl border border-[var(--color-stone-100)] bg-white/60 hover:bg-white px-4 py-4 md:px-5 md:py-5 mt-3 first:mt-0 transition-[transform,box-shadow,border-color,background-color] duration-300 motion-reduce:transition-none hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 hover:border-[var(--color-stone-200)] hover:shadow-[0_18px_38px_-24px_rgba(237,121,38,0.4),0_16px_34px_-24px_rgba(9,115,186,0.32)] " +
              /* 🛡️ Açık olan satır (isOpen) her zaman diğer satırların
                 üstünde kalsın diye EXPLICIT z-index — auto DEĞİL, bu
                 yüzden satır kendi stacking context'ini garanti kurar
                 (hover-transform'un tesadüfen oluşturduğu context'e
                 bağımlı kalmadan). */
              (isOpen ? "z-20" : "z-0")
            }
            style={{ animationDelay: `${idx * 70}ms` }}
          >
            {/* Sol accent çubuğu — turuncu → mavi, hover'da belirginleşir. */}
            <span
              aria-hidden="true"
              className="absolute left-1.5 md:left-2 top-3 bottom-3 w-[3px] rounded-full bg-gradient-to-b from-[#ED7926] to-[#0973BA] opacity-60 group-hover/row:opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
            />

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6 pl-3">
              {/* LEFT — tarih aralığı, büyük/güçlü, ana bilgi. */}
              <p className="min-w-0 font-display text-[19px] md:text-[22px] text-[var(--color-stone-900)] tracking-[-0.01em] leading-snug flex items-center gap-2.5">
                <span
                  aria-hidden="true"
                  className="hidden md:inline-flex items-center justify-center w-7 h-7 rounded-full bg-[#0973BA]/[0.09] text-[#0973BA] shrink-0"
                >
                  <Calendar size={14} strokeWidth={1.9} />
                </span>
                <span className="tabular-nums">
                  {formatDateTr(p.start_date)}
                  <span className="mx-2 text-[#ED7926]/55 font-medium">
                    —
                  </span>
                  {formatDateTr(p.end_date)}
                </span>
              </p>

              {/* RIGHT — fiyat (dikkat çekici marka turuncusu) + kompakt Bilgi toggle. */}
              <div className="flex items-center gap-4 md:gap-5 shrink-0">
                <div className="text-left md:text-right">
                  <p
                    className="font-display font-bold text-2xl md:text-[26px] text-[#ED7926] tracking-[-0.02em] leading-none"
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
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-wide transition-all duration-200 motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40 " +
                        (isOpen
                          ? "border-[#0973BA]/40 bg-[#0973BA]/[0.08] text-[#0973BA] shadow-[0_4px_14px_-6px_rgba(9,115,186,0.35)]"
                          : "border-[var(--color-stone-200)] text-[var(--color-stone-500)] hover:border-[#ED7926]/40 hover:text-[#ED7926] hover:bg-[#ED7926]/[0.05]")
                      }
                    >
                      <Info size={12} strokeWidth={2} aria-hidden />
                      Bilgi
                    </button>

                    {isOpen && (
                      <div
                        role="note"
                        className={
                          "pl-popover-in absolute right-0 z-20 w-60 overflow-hidden rounded-2xl border border-[var(--color-stone-100)] bg-white p-4 shadow-[0_18px_40px_-18px_rgba(11,31,58,0.28)] " +
                          (isLastRow ? "bottom-full mb-2" : "top-full mt-2")
                        }
                      >
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-0 top-0 h-[2.5px] bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
                        />
                        <ul className="mt-1 space-y-2.5">
                          {hasMinStay && (
                            <li className="flex items-center gap-2.5 text-[12.5px] text-[var(--color-stone-700)]">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#ED7926]/10 text-[#ED7926] shrink-0">
                                <Moon size={12} strokeWidth={1.9} aria-hidden />
                              </span>
                              Min. {minimumStayNights} Gece
                            </li>
                          )}
                          {hasDeposit && (
                            <li className="flex items-center gap-2.5 text-[12.5px] text-[var(--color-stone-700)]">
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#0973BA]/10 text-[#0973BA] shrink-0">
                                <ShieldCheck size={12} strokeWidth={1.9} aria-hidden />
                              </span>
                              Hasar Depozitosu: {formatCurrency(convertedDeposit, currency)}
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
