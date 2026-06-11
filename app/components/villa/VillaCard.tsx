"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";

import {
  MapPin,
  BedDouble,
  Bath,
  Users,
  ArrowUpRight,
  Star,
  CalendarRange,
} from "lucide-react";

import { convertPrice, formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/app/context/CurrencyContext";
import {
  calculateNights,
  calculateGrandTotal,
} from "@/lib/price.engine";
/* 🛡️ FAZ 36 — Guest favorites button. localStorage-only;
   no DB / no API / no server action / no auth. */
import FavoriteButton from "@/app/components/favorites/FavoriteButton";

/* ===============================================================
   🛡️ VillaCardBookingModal — LAZY import
   ===============================================================
   ssr:false → modal closed iken bundle parse YOK, network YOK.
   Modal mount yalnız user "Müsaitlik / Tarih Seç" butonuna
   tıklayınca olur. Aynı useBookingEngine + child component'leri
   kullanır (BookingSidebar ile TEK source-of-truth).
   =============================================================== */
const VillaCardBookingModal = dynamic(
  () => import("./VillaCardBookingModal"),
  { ssr: false }
);

type StayPrice = {
  price: number;
  currency: string;
  start_date: string;
  end_date: string;
};

type Props = {
  /* 🛡️ FAZ 36 — villa.id (favorites identity).
     Eski caller'lar `id` geçmezse favorite buton render edilmez
     (defansif). Yeni caller'lar id'yi VillaDTO'dan geçer. */
  id?: string;
  slug: string;
  title: string;
  location: string;
  price?: number;
  currency?: string;
  images?: string[];
  badge?: string;
  bedrooms?: number;
  bathrooms?: number;
  guests?: number;
  /* 🛡️ DATE-SCOPED STAY PRICING — opsiyonel.
     Kullanıcı /arama'ya start+end ile geldiyse caller bu üçlüyü
     birlikte geçer; VillaCard mevcut pricing engine
     (lib/price.engine > calculateGrandTotal) ile aynı semantic'te
     toplam fiyat üretir (stay + cleaning_fee).
     VillaDetail/BookingSidebar/reservation create ile byte-identical
     hesap. Tarih yoksa eski "gecelik" davranış aynen devam eder. */
  stayStart?: string;
  stayEnd?: string;
  prices?: StayPrice[];
  /** Temizlik ücreti (orijinal currency). calculateGrandTotal kendi
   *  cleaning_limit kuralını uygular (nights >= limit ise muaf). */
  cleaningFee?: number;
  cleaningCurrency?: string;
  cleaningLimit?: number;
  /* 🛡️ FAZ 35 — REVIEW TRUST META (Airbnb / boutique hotel feel).
     Caller approved-only stats geçer; villa başına 1 tek meta satır.
     Eski caller'lar undefined geçerse hiçbir şey render edilmez —
     conditional, eski layout AYNEN korunur, layout shift YOK.
       reviewAverage: 1..5 (1 ondalık)
       reviewCount  : tamsayı; 0 ise hiç render etme (fake 5.0 yok). */
  reviewAverage?: number;
  reviewCount?: number;
  /* 🛡️ DISPLAY VARIANT — caller surface'ine göre layout density.
     "default" (eski + public davranış): editorial büyük kart,
       FavoriteButton + booking trigger + zengin tipografi.
     "curation" (admin Villa Listesi): compact taranabilir kart,
       FavoriteButton + booking trigger HIDE, küçük spacing/tipografi,
       daha sıkı image aspect. Logic (pricing/data/image selection)
       AYNEN — sadece presentation katmanı koşullu. */
  variant?: "default" | "curation";
  /* 🛡️ OPSİYONEL — "Müsaitlik / Tarih Seç" butonunun HEMEN ALTINA gap
     bilgi alanı (açık yeşil) + tam genişlik "Hemen Rezervasyon Yap" CTA
     için VERİ. Verilmezse HİÇBİR ŞEY render edilmez → /arama, homepage ve
     diğer VillaCard kullanımları AYNEN korunur. CTA bir <button>'dır
     (kart Link'i içinde nested <a> olmaması için) → onClick router.push +
     stopPropagation (kartın detay navigasyonu tetiklenmez). */
  reserveInfo?: { label: string; nights: number; href: string };
};

export default function VillaCard({
  id,
  slug,
  title,
  location,
  price,
  currency: villaCurrency = "TRY",
  images = [],
  badge,
  bedrooms = 1,
  bathrooms = 1,
  guests = 2,
  stayStart,
  stayEnd,
  prices,
  cleaningFee,
  cleaningCurrency,
  cleaningLimit,
  reviewAverage,
  reviewCount,
  variant = "default",
  reserveInfo,
}: Props) {
  const router = useRouter();
  /* Compact variant flag — curation flow için presentation density.
     Logic (price/state/handlers/modal) hiç dokunulmaz. */
  const isCuration = variant === "curation";
  /* Cover image: ilk geçerli URL'i seç.
     Supabase'den null/empty değerler gelebileceği için filter. */
  const cover = (images || []).find(
    (u): u is string => typeof u === "string" && u.trim().length > 0
  );

  /* Broken URL fallback: <img onError> tetiklenirse premium
     "Görsel yakında" state'ine geç. (onLoad opacity oyununa girmiyoruz
     — gradient bg zaten skeleton görevi görüyor, hydration-safe.) */
  const [imgFailed, setImgFailed] = useState(false);

  /* 🛡️ Booking modal — lazy mount. isOpen=false iken
     VillaCardBookingModal HİÇ mount edilmez (next/dynamic ssr:false +
     erken-return), bu yüzden fetch/engine de çalışmaz. */
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  const { currency, rates } = useCurrency();

  const convertedPrice = convertPrice(
    Number(price || 0),
    villaCurrency,
    currency,
    rates
  );

  /* 🛡️ GRAND TOTAL — mevcut price.engine reuse (calculateGrandTotal).
     Aktif olması için: stayStart + stayEnd + prices[] üçlüsü
     birlikte verilmeli ve nights > 0 olmalı.

     calculateGrandTotal:
       - stay     = günlük fiyatlar toplamı (user currency)
       - cleaning = calculateCleaningFee(nights, fee, limit)
                    convertPrice ile user currency'sine çevrilmiş
       - total    = stay + cleaning
     Yani temizlik ücreti AYNI semantic ile (cleaning_limit muafiyeti
     dahil) hesaba dahil. VillaDetail/BookingSidebar/reservation
     create ile byte-identical. cleaning_fee=0 ise total = stay
     (eski davranışla aynı sonuç). */
  let stayNights = 0;
  let stayTotal: number | null = null;
  let hasCleaning = false;
  if (stayStart && stayEnd && Array.isArray(prices) && prices.length > 0) {
    stayNights = calculateNights(stayStart, stayEnd);
    if (stayNights > 0) {
      const result = calculateGrandTotal({
        start: stayStart,
        end: stayEnd,
        prices,
        currency,
        rates,
        cleaning_fee: Number(cleaningFee || 0),
        cleaning_currency: cleaningCurrency || "TRY",
        cleaning_limit: Number(cleaningLimit || 0),
      });
      if (result.total > 0) {
        stayTotal = result.total;
        hasCleaning = result.cleaning > 0;
      }
    }
  }

  const showImage = !!cover && !imgFailed;
  const initial = (title?.trim()?.[0] || "·").toUpperCase();

  /* 🛡️ DATE CONTINUITY — /arama → detail geçişinde URL'de gelen
     start/end paramlarını detail href'ine append et. BookingSidebar
     URL'den initial state'i hydrate eder; refresh-safe. Tarih yoksa
     href eski formatta kalır (`/kiralik-villa/<slug>`). */
  let detailHref = `/kiralik-villa/${slug}`;
  if (stayStart && stayEnd) {
    const qs = new URLSearchParams();
    qs.set("start", stayStart);
    qs.set("end", stayEnd);
    detailHref = `${detailHref}?${qs.toString()}`;
  }

  /* 🛡️ Rezervasyon bilgi alanı + CTA — yalnız reserveInfo verilince
     (kısa-süreli tarihler sayfası). CTA <button> (kart Link'i içinde
     nested <a> olmasın) + preventDefault/stopPropagation → kartın detay
     navigasyonu tetiklenmez; router.push ile /rezervasyon'a gider. */
  const reserveBlock = reserveInfo ? (
    <div className="mt-2.5 flex flex-col gap-2">
      <div className="rounded-xl bg-emerald-50 px-3 py-2 text-center text-[13px] font-medium text-emerald-800">
        {reserveInfo.label} · {reserveInfo.nights} Gece
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          router.push(reserveInfo.href);
        }}
        aria-label="Hemen rezervasyon yap"
        className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-700 text-white uppercase font-medium text-[11px] tracking-[0.08em] hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 transition-colors duration-200 motion-reduce:transition-none"
      >
        Hemen Rezervasyon Yap
      </button>
    </div>
  ) : null;

  return (
    <>
    <CardOuter isCuration={isCuration} href={detailHref}>
      {/* ════════════════════════════════════════════════════
          🛡️ KART YAPISI — Variant dispatch
          ════════════════════════════════════════════════════
          Default variant (public list): yeni kompakt yapı —
            image aspect-[16/10] + alt content area + tek satır
            amenities. Kart yüksekliği ~%40 azaldı.
          Curation variant (admin curator): mevcut "image-dominant
            + amenity mini-cards" yapısı AYNEN korundu.
          State/props/handlers ve booking modal AYNI; sadece
          render path'i farklılaşır. ───────────────────────── */}
      {isCuration ? (
      <article
        className={
          "relative overflow-hidden bg-white " +
          /* Curation: static shadow, hover lift YOK — "selection
             workspace" UX'i. Image hover scale yine fire eder
             (image bloğunun kendi group-hover'ı). */
          "rounded-[20px] shadow-[0_8px_20px_-14px_rgba(27,26,23,0.18)] " +
          "transition-shadow duration-300 motion-reduce:transition-none"
        }
      >
        {/* ── IMAGE BLOCK with overlay content ────────────── */}
        <div
          className={
            "relative overflow-hidden " +
            "bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] " +
            (isCuration ? "aspect-[4/5]" : "aspect-[5/6]")
          }
        >
          {showImage ? (
            <>
              {/* 🛡️ SCALE HARDENING — next/Image (responsive + lazy +
                 WebP/AVIF auto). Eski `<img>` davranışı korunur:
                   - aspect-locked parent → CLS=0 (Image fill mode)
                   - object-cover, object-center, group-hover scale aynen
                   - onError → setImgFailed (premium fallback'e geç)
                   - lazy default (above-the-fold yalnız bir kart varsa
                     parent caller priority verir; bu turda priority YOK).
                 SIZES:
                   - Mobile (default ≤640px): 100vw (tek kolon)
                   - sm (≥640): 50vw (2 col)
                   - xl (≥1280): 33vw (3 col)
                 max-w ~1280px / 3 col ≈ 420px image gen; Supabase Storage
                 + Next image optimizer (cdn-image) bunları auto. */}
              <Image
                src={cover}
                alt={title || "Villa"}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                loading="lazy"
                onError={() => setImgFailed(true)}
                className="
                  object-cover object-center
                  transition-transform duration-[1200ms] ease-out
                  group-hover:scale-[1.04]
                  motion-reduce:transition-none motion-reduce:group-hover:scale-100
                "
              />
            </>
          ) : (
            /* PREMIUM FALLBACK — large serif initial */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[88px] md:text-[104px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-3 text-[10px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-400)]">
                Görsel yakında
              </p>
            </div>
          )}

          {/* Bottom editorial scrim — text readability */}
          <div
            aria-hidden="true"
            className="
              absolute inset-x-0 bottom-0 h-[65%]
              bg-gradient-to-t from-black/78 via-black/42 to-transparent
              pointer-events-none
            "
          />
          {/* Hover scrim deepen — subtle */}
          <div
            aria-hidden="true"
            className="
              absolute inset-x-0 bottom-0 h-[65%]
              bg-gradient-to-t from-black/14 to-transparent
              pointer-events-none
              opacity-0 group-hover:opacity-100
              transition-opacity duration-500 motion-reduce:transition-none
            "
          />
          {/* Top vignette — badge legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/[0.18] via-black/[0.04] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* BADGE — glass pill + coral indicator dot.
              🛡️ Curation variant: admin curator listesinde "Öne Çıkan"
              tarzı pazarlama etiketi görsel noise → render edilmez. */}
          {badge && !isCuration && (
            <span className="absolute top-4 left-4 z-10 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-[var(--color-stone-900)] text-[10px] tracking-[0.18em] uppercase font-medium px-3 py-1.5 rounded-full shadow-[0_6px_18px_-6px_rgb(27_26_23/0.30)] ring-1 ring-white/40">
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full bg-[var(--brand-coral)]"
              />
              {badge}
            </span>
          )}

          {/* FAV BUTTON — top-right (FAZ 36 white glass).
              🛡️ Curation variant: admin curator listesinde favori
              gereksiz → render edilmez. */}
          {id && !isCuration && <FavoriteButton villaId={id} variant="card" />}

          {/* ════════════════════════════════════════════════
              OVERLAY CONTENT (bottom editorial)
              location → title → review → price + arrow
              ════════════════════════════════════════════════ */}
          <div
            className={
              "absolute inset-x-0 bottom-0 z-10 " +
              (isCuration ? "p-4" : "p-5 md:p-6")
            }
          >
            {/* LOCATION */}
            <p className="flex items-center gap-1.5 text-[10.5px] tracking-[0.18em] uppercase font-medium text-white/75 min-w-0 truncate">
              <MapPin
                size={11}
                className="text-white/70 shrink-0"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="truncate">{location || "Lokasyon yok"}</span>
            </p>

            {/* TITLE — editorial white serif */}
            <h3
              className={
                "font-display text-white " +
                (isCuration
                  ? "text-[17px] md:text-[18px] mt-2 "
                  : "text-[22px] md:text-[26px] mt-2.5 ") +
                "leading-[1.08] tracking-[-0.022em] line-clamp-2 " +
                "group-hover:text-white/95 " +
                "transition-colors motion-reduce:transition-none " +
                "drop-shadow-[0_1px_2px_rgba(0,0,0,0.30)]"
              }
            >
              {title}
            </h3>

            {/* REVIEW META — amber star + compact */}
            {typeof reviewCount === "number" && reviewCount > 0 &&
              typeof reviewAverage === "number" && reviewAverage > 0 && (
                <div
                  className="flex items-center gap-1.5 mt-2 text-[12px] text-white/85"
                  aria-label={`Ortalama puan ${reviewAverage.toFixed(
                    1
                  )} / 5, ${reviewCount} misafir yorumu`}
                >
                  <Star
                    size={11}
                    className="text-amber-400 shrink-0"
                    fill="currentColor"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="font-display text-[13px] text-white tracking-[-0.01em] tabular-nums leading-none">
                    {reviewAverage.toFixed(1)}
                  </span>
                  <span aria-hidden="true" className="text-white/40">·</span>
                  <span className="text-white/70 tabular-nums">
                    {reviewCount} yorum
                  </span>
                </div>
              )}

            {/* PRICE LINE + glass arrow CTA.
                stayTotal branch: 2 satır editorial layout
                  Üst: TOPLAM eyebrow + büyük fiyat
                  Alt: "N gece · Temizlik dahil" meta
                Tek satır truncate (kırpılma) sorunu kapanır; kullanıcı
                breakdown'u net görür. Gecelik branch tek satır eski
                davranış. calculateGrandTotal/hasCleaning/stayNights
                değerleri aynen reuse — yeni hesap YOK. */}
            <div
              className={
                "flex items-center justify-between gap-3 " +
                (isCuration ? "mt-2.5" : "mt-3.5 md:mt-4")
              }
            >
              <div className="flex flex-col min-w-0">
                {stayTotal !== null ? (
                  <>
                    {/* Üst satır: eyebrow + büyük fiyat */}
                    <div className="flex items-baseline gap-2 min-w-0">
                      <span className="text-[10.5px] tracking-[0.14em] uppercase font-medium text-white/65">
                        Toplam
                      </span>
                      <span
                        className={
                          "font-display text-white tracking-[-0.015em] tabular-nums " +
                          (isCuration ? "text-[17px]" : "text-[22px]")
                        }
                      >
                        {formatCurrency(stayTotal, currency)}
                      </span>
                    </div>
                    {/* Alt satır: meta — gece + temizlik dahil bilgisi */}
                    <p
                      className={
                        "text-white/70 leading-snug " +
                        (isCuration ? "text-[11px] mt-0.5" : "text-[12px] mt-1")
                      }
                    >
                      <span className="tabular-nums">{stayNights} gece</span>
                      {hasCleaning ? (
                        <>
                          <span
                            aria-hidden
                            className="text-white/40 mx-1.5"
                          >
                            ·
                          </span>
                          <span className="text-white/65">
                            Temizlik dahil
                          </span>
                        </>
                      ) : null}
                    </p>
                  </>
                ) : (
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span
                      className={
                        "font-display text-white tracking-[-0.015em] tabular-nums " +
                        (isCuration ? "text-[17px]" : "text-[22px]")
                      }
                    >
                      {price
                        ? formatCurrency(convertedPrice, currency)
                        : "Fiyat sorunuz"}
                    </span>
                    {price ? (
                      <span
                        className={
                          "text-white/65 " +
                          (isCuration ? "text-[11px]" : "text-[12px]")
                        }
                      >
                        / gece
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              {/* Glass arrow CTA */}
              <span
                aria-hidden="true"
                className={
                  "inline-flex items-center justify-center rounded-full shrink-0 " +
                  (isCuration ? "w-8 h-8 " : "w-9 h-9 ") +
                  "bg-white/10 backdrop-blur-md ring-1 ring-inset ring-white/30 text-white " +
                  "group-hover:bg-[var(--brand-coral)] group-hover:ring-[var(--brand-coral)] " +
                  "transition-[background-color,color,box-shadow] duration-300 motion-reduce:transition-none"
                }
              >
                <ArrowUpRight size={isCuration ? 13 : 14} strokeWidth={1.75} />
              </span>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════
            🛡️ BOOKING TRIGGER — "Müsaitlik / Tarih Seç"
            ════════════════════════════════════════════════
            Card içinde tek booking entry point butonu. Tıklayınca:
              - e.preventDefault + stopPropagation → outer Link'in
                detail navigation'ı tetiklenmez
              - setIsBookingOpen(true) → lazy modal mount
            Modal kapalıyken VillaCardBookingModal HİÇ mount edilmez
            (next/dynamic ssr:false + erken-return).
            DOM konum: image bloğunun ALTINDA, amenity strip'in ÜSTÜNDE
            → mevcut layout'a dokunulmaz, sabit yükseklik. */}
        {/* 🛡️ Booking trigger — admin curation'da admin "müşterinin
            ne göreceğini" hızlıca önizleyebilsin diye CTA korunur,
            sadece sizing/spacing compact'lenir. */}
        <div
          className={
            "bg-white " + (isCuration ? "px-2 pt-2" : "px-3 pt-3")
          }
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsBookingOpen(true);
            }}
            aria-label="Müsaitlik ve tarih seçimi modalını aç"
            className={
              "w-full inline-flex items-center justify-center gap-2 " +
              "bg-[var(--color-stone-900)] text-white uppercase font-medium " +
              "hover:bg-[var(--color-stone-800)] " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
              "transition-colors duration-200 motion-reduce:transition-none " +
              (isCuration
                ? "h-9 rounded-xl text-[11px] tracking-[0.06em]"
                : "h-11 rounded-2xl text-[12px] tracking-[0.08em]")
            }
          >
            <CalendarRange
              size={isCuration ? 12 : 14}
              strokeWidth={1.75}
              aria-hidden
            />
            Müsaitlik / Tarih Seç
          </button>
        </div>

        {/* ════════════════════════════════════════════════
            🛡️ FAZ 39K — AMENITY MINI-CARDS (3 luxury pastel)
            ════════════════════════════════════════════════
            Image bloğunun altında, article içinde sabit
            yükseklikli (h-24) 3-col luxury amenity strip.
            Tonlar:
              - Yatak  : coral  (#FFF1EB · #c84a20)
              - Banyo  : green  (#EEF8F0 · #1f7a4d)
              - Kişi   : blue   (#EEF4FF · #1d6492)
            Hover: subtle brighten (-translate-y-[1px]).
            CSS soup yok — tek tone map + helper component. */}
        <div
          className={
            "grid grid-cols-3 bg-white " +
            (isCuration ? "gap-1.5 p-2" : "gap-2 p-3")
          }
        >
          <AmenityMini
            tone="coral"
            icon={<BedDouble size={18} strokeWidth={1.6} aria-hidden />}
            value={bedrooms}
            label="Yatak Odası"
          />
          <AmenityMini
            tone="green"
            icon={<Bath size={18} strokeWidth={1.6} aria-hidden />}
            value={bathrooms}
            label="Banyo"
          />
          <AmenityMini
            tone="blue"
            icon={<Users size={18} strokeWidth={1.6} aria-hidden />}
            value={guests}
            label="Kişi"
          />
        </div>
      </article>
      ) : (
      /* ════════════════════════════════════════════════════
         🛡️ DEFAULT (PUBLIC) — KOMPAKT KART
         ════════════════════════════════════════════════════
         Yapı:
           <article>
             ├─ image (aspect-[16/10]) + badge/fav overlay
             └─ content area
                 ├─ row 1: title (sol) + price (sağ)
                 ├─ row 2: location (📍)
                 ├─ row 3: review meta (opsiyonel)
                 └─ row 4: amenities ince satır (separator üstte)
         Booking modal'a kart üzerinden erişim YOK (detail
         sayfası BookingSidebar üzerinden açılır); modal state'i
         hâlâ mount edilebilir ama isOpen=false sabit → 0 maliyet.
         ──────────────────────────────────────────────────── */
      <article
        className={
          "relative overflow-hidden bg-white " +
          "rounded-[20px] shadow-[0_8px_20px_-14px_rgba(27,26,23,0.18)] " +
          "group-hover:shadow-[0_20px_36px_-18px_rgba(27,26,23,0.28)] " +
          "transition-[box-shadow,transform] duration-400 motion-reduce:transition-none " +
          "group-hover:-translate-y-[2px]"
        }
      >
        {/* ── IMAGE BLOCK — aspect-[16/10] (kompakt yatay) ── */}
        <div
          className={
            "relative overflow-hidden " +
            "aspect-[16/10] " +
            "bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]"
          }
        >
          {showImage ? (
            <Image
              src={cover}
              alt={title || "Villa"}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="
                object-cover object-center
                transition-transform duration-[900ms] ease-out
                group-hover:scale-[1.03]
                motion-reduce:transition-none motion-reduce:group-hover:scale-100
              "
            />
          ) : (
            /* PREMIUM FALLBACK — serif initial (kompakt boyut) */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[64px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-2 text-[10px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-400)]">
                Görsel yakında
              </p>
            </div>
          )}

          {/* Top vignette — badge legibility (subtle, kompakt) */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/[0.20] via-black/[0.04] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* BADGE — glass pill (kategori/lightning) */}
          {badge && (
            <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-sm text-[var(--color-stone-900)] text-[10px] tracking-[0.16em] uppercase font-medium px-2.5 py-1 rounded-full shadow-[0_4px_12px_-4px_rgb(27_26_23/0.30)] ring-1 ring-white/40">
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full bg-[var(--brand-coral)]"
              />
              {badge}
            </span>
          )}

          {/* FAV BUTTON — top-right */}
          {id && <FavoriteButton villaId={id} variant="card" />}
        </div>

        {/* ── CONTENT AREA — kart altı kompakt blok ── */}
        <div className="p-3.5 md:p-4">
          {/* ROW 1 — title (sol) + price (sağ) */}
          <div className="flex items-start justify-between gap-3">
            <h3
              className={
                "min-w-0 font-display text-[16px] md:text-[17px] " +
                "leading-[1.15] tracking-[-0.018em] text-[var(--color-stone-900)] " +
                "line-clamp-2 " +
                "group-hover:text-[var(--color-stone-800)] " +
                "transition-colors motion-reduce:transition-none"
              }
            >
              {title}
            </h3>
            <div className="shrink-0 text-right">
              {stayTotal !== null ? (
                <>
                  <div className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] tracking-[-0.012em] tabular-nums leading-none">
                    {formatCurrency(stayTotal, currency)}
                  </div>
                  <div className="mt-1 text-[10px] tracking-[0.06em] uppercase text-[var(--color-stone-500)] tabular-nums">
                    {stayNights} gece{hasCleaning ? " · Temizlik dahil" : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] tracking-[-0.012em] tabular-nums leading-none">
                    {price ? formatCurrency(convertedPrice, currency) : "Fiyat sorunuz"}
                  </div>
                  {price ? (
                    <div className="mt-1 text-[10px] tracking-[0.06em] uppercase text-[var(--color-stone-500)]">
                      / gece
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {/* ROW 2 — location */}
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--color-stone-500)] min-w-0">
            <MapPin
              size={12}
              className="text-[var(--color-stone-400)] shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="truncate">{location || "Lokasyon yok"}</span>
          </p>

          {/* ROW 3 — review meta (opsiyonel, kompakt) */}
          {typeof reviewCount === "number" && reviewCount > 0 &&
            typeof reviewAverage === "number" && reviewAverage > 0 && (
              <div
                className="mt-1.5 flex items-center gap-1 text-[11.5px] text-[var(--color-stone-600)]"
                aria-label={`Ortalama puan ${reviewAverage.toFixed(
                  1
                )} / 5, ${reviewCount} misafir yorumu`}
              >
                <Star
                  size={11}
                  className="text-amber-500 shrink-0"
                  fill="currentColor"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <span className="font-medium tabular-nums text-[var(--color-stone-700)]">
                  {reviewAverage.toFixed(1)}
                </span>
                <span aria-hidden="true" className="text-[var(--color-stone-300)] mx-0.5">·</span>
                <span className="tabular-nums">{reviewCount} yorum</span>
              </div>
            )}

          {/* ROW 4 — amenity tile grid (kompakt, dikey hizalı).
              3-kolonlu grid: her kutu kendi içinde center-aligned
              (icon üst, sayı orta, etiket alt). Tonlar curation
              AmenityMini ile birebir aynı: yatak coral, banyo green,
              kişi blue. Kart kompakt olsa bile kapasite bilgisi
              ilk bakışta görünür kalır.
              Yükseklik ~76-82px → mevcut h-24 (96px) tile'lardan
              daha kısa ama bilgi vurgusu daha güçlü (sayı + etiket
              birlikte ortalı). */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div
              className="rounded-xl bg-[#FFF1EB] px-2 py-2.5 flex flex-col items-center justify-center text-center"
              aria-label={`${bedrooms} yatak odası`}
            >
              <BedDouble size={16} strokeWidth={1.6} className="text-[#c84a20]" aria-hidden />
              <span className="mt-1 font-display text-[18px] leading-none tabular-nums font-semibold text-[#7a2c12]">
                {bedrooms}
              </span>
              <span className="mt-1 text-[10px] tracking-[0.04em] font-medium leading-tight text-[#c25a30]">
                Yatak Odası
              </span>
            </div>
            <div
              className="rounded-xl bg-[#EEF8F0] px-2 py-2.5 flex flex-col items-center justify-center text-center"
              aria-label={`${bathrooms} banyo`}
            >
              <Bath size={16} strokeWidth={1.6} className="text-[#1f7a4d]" aria-hidden />
              <span className="mt-1 font-display text-[18px] leading-none tabular-nums font-semibold text-[#0f4429]">
                {bathrooms}
              </span>
              <span className="mt-1 text-[10px] tracking-[0.04em] font-medium leading-tight text-[#36805a]">
                Banyo
              </span>
            </div>
            <div
              className="rounded-xl bg-[#EEF4FF] px-2 py-2.5 flex flex-col items-center justify-center text-center"
              aria-label={`${guests} kişi kapasitesi`}
            >
              <Users size={16} strokeWidth={1.6} className="text-[#1d6492]" aria-hidden />
              <span className="mt-1 font-display text-[18px] leading-none tabular-nums font-semibold text-[#0e3a59]">
                {guests}
              </span>
              <span className="mt-1 text-[10px] tracking-[0.04em] font-medium leading-tight text-[#356f96]">
                Kişi
              </span>
            </div>
          </div>

          {/* ROW 5 — BOOKING CTA (kompakt; curation ile aynı işlev,
              mevcut handler birebir aynı). h-9 + text-[11px] →
              card altında ince bar; modal lazy mount KORUNDU. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsBookingOpen(true);
            }}
            aria-label="Müsaitlik ve tarih seçimi modalını aç"
            className={
              "mt-3 w-full inline-flex items-center justify-center gap-2 " +
              "h-9 rounded-xl " +
              "bg-[var(--color-stone-900)] text-white uppercase font-medium " +
              "text-[11px] tracking-[0.08em] " +
              "hover:bg-[var(--color-stone-800)] " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
              "transition-colors duration-200 motion-reduce:transition-none"
            }
          >
            <CalendarRange size={13} strokeWidth={1.75} aria-hidden />
            Müsaitlik / Tarih Seç
          </button>
          {reserveBlock}
        </div>
      </article>
      )}

    </CardOuter>

    {/* ════════════════════════════════════════════════════
        🛡️ BOOKING MODAL — LAZY MOUNT (Link DIŞINDA)
        ════════════════════════════════════════════════════
        Modal Link'in dışında render edilir → `<a>` içine
        fixed-positioned interactive content nesting'i YOK,
        HTML semantic temiz, screen reader doğru announce.

        Performance:
          - isOpen=false iken VillaCardBookingModal erken-return
            yapar (early null) → engine YOK, fetch YOK, DOM YOK
          - next/dynamic ssr:false → modal bundle parse user
            tıklayana kadar gecikir
          - Modal kendi fixed inset-0 portal-like davranışıyla
            DOM hiyerarşisinden bağımsız render olur
        Erişim:
          - villaId yoksa modal hiç render edilmez (defansif).
            Trigger butonu da id yokken set state'i tetiklerse
            buton görsel olarak çalışır ama modal mount olmaz —
            UX'i bozmaz, sadece açılmaz.
        ──────────────────────────────────────────────────── */}
    {id && (
      /* Modal artık `prices` / `cleaning_*` prop'larını ALMAZ — kendi
         server-side API çağrısıyla (BookingSidebar ile birebir aynı
         kaynaktan) çeker. Bu drift kapatır: VillaCard caller'ları
         (anasayfa collection, favoriler, /arama-tarihsiz) bu prop'ları
         zaten geçmiyordu → eski implementasyonda engine boş prices
         ile mount oluyor, fiyat 0 görünüyordu. */
      <VillaCardBookingModal
        isOpen={isBookingOpen}
        onClose={() => setIsBookingOpen(false)}
        villaId={id}
        villaSlug={slug}
        villaTitle={title}
      />
    )}
    </>
  );
}

/* ===============================================================
   🛡️ CARD OUTER WRAPPER — variant-aware
   ===============================================================
   Default variant: <Link> — public detail page navigation aktif.
   Curation variant: <div> — admin "selection workspace" UX'i.
     - href yok → navigation YOK
     - cursor / focus ring YOK (clickable hissi vermez)
     - `group` class yine duruyor → image hover scale (group-hover:scale-[1.04])
       ve overlay scrim hover'ı korunur; sadece kart wrapper'ı interactive
       değil.
=============================================================== */
function CardOuter({
  isCuration,
  href,
  children,
}: {
  isCuration: boolean;
  href: string;
  children: React.ReactNode;
}) {
  if (isCuration) {
    return (
      <div className="block group rounded-[20px]">{children}</div>
    );
  }
  return (
    <Link
      href={href}
      className="
        block group rounded-[28px]
        focus:outline-none focus-visible:ring-2
        focus-visible:ring-[var(--brand-coral)]/40
      "
    >
      {children}
    </Link>
  );
}

/* ===============================================================
   🛡️ FAZ 39K — AMENITY MINI-CARD (luxury pastel tile)
   ===============================================================
   3 tone variant — VillaCard bottom strip. Sabit yükseklik (h-24),
   kompakt typography hierarchy: büyük tabular sayı + küçük label.
   No hover scale (cinematic restraint); subtle brighten only.
=============================================================== */
type AmenityTone = "coral" | "green" | "blue";

const AMENITY_TONE: Record<
  AmenityTone,
  { surface: string; icon: string; numText: string; label: string }
> = {
  coral: {
    surface: "bg-[#FFF1EB] group-hover:bg-[#FFE6D9]",
    icon: "text-[#c84a20]",
    numText: "text-[#7a2c12]",
    label: "text-[#c25a30]",
  },
  green: {
    surface: "bg-[#EEF8F0] group-hover:bg-[#E2F2E6]",
    icon: "text-[#1f7a4d]",
    numText: "text-[#0f4429]",
    label: "text-[#36805a]",
  },
  blue: {
    surface: "bg-[#EEF4FF] group-hover:bg-[#E1ECFB]",
    icon: "text-[#1d6492]",
    numText: "text-[#0e3a59]",
    label: "text-[#356f96]",
  },
};

function AmenityMini({
  tone,
  icon,
  value,
  label,
}: {
  tone: AmenityTone;
  icon: React.ReactNode;
  value: number | string;
  label: string;
}) {
  const t = AMENITY_TONE[tone];
  return (
    <div
      className={
        "h-24 rounded-2xl px-3.5 py-3 flex flex-col justify-between " +
        "transition-colors duration-300 motion-reduce:transition-none " +
        t.surface
      }
    >
      <span className={t.icon}>{icon}</span>
      <div className="leading-none">
        <p
          className={
            "font-display text-[22px] tracking-[-0.015em] tabular-nums " +
            t.numText
          }
        >
          {value}
        </p>
        <p
          className={
            "text-[10.5px] tracking-[0.06em] mt-1 font-medium " + t.label
          }
        >
          {label}
        </p>
      </div>
    </div>
  );
}
