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
  Sparkles,
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
  variant?: "default" | "curation" | "discount";
  /* 🛡️ OPSİYONEL — "Müsaitlik / Tarih Seç" butonunun HEMEN ALTINA gap
     bilgi alanı (açık yeşil) + tam genişlik "Hemen Rezervasyon Yap" CTA
     için VERİ. Verilmezse HİÇBİR ŞEY render edilmez → /arama, homepage ve
     diğer VillaCard kullanımları AYNEN korunur. CTA bir <button>'dır
     (kart Link'i içinde nested <a> olmaması için) → onClick router.push +
     stopPropagation (kartın detay navigasyonu tetiklenmez). */
  reserveInfo?: { label: string; nights: number; href: string };
  /** 🛡️ ADDITIVE — /arama "esnek" EK sonuç işareti. true ise fiyat
   *  GÖSTERİLMEZ (villa ana tarihte müsait değil); yerine "Esnek Tarih
   *  Fırsatı · ±3 gün içinde müsait" premium etiketi. Ana tarih/fiyat/
   *  href akışı DEĞİŞMEZ (yalnız bu kartın fiyat sunumu). Default false
   *  → mevcut kartlar birebir aynı. Yalnız default (public) variant. */
  isFlexible?: boolean;
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
  isFlexible = false,
}: Props) {
  const router = useRouter();
  /* Compact variant flag — curation flow için presentation density.
     Logic (price/state/handlers/modal) hiç dokunulmaz. */
  const isCuration = variant === "curation";
  /* 🛡️ Discount variant — default editorial layout + İndirimli badge +
     soft coral/turquoise accent. Logic (pricing/data/handlers) AYNEN. */
  const isDiscount = variant === "discount";
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
          {id && !isCuration && (
            <FavoriteButton villaId={id} variant="card" alwaysVisible />
          )}

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
                  <div className="flex flex-col min-w-0">
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
                        Başlayan Fiyatlarla
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
      isDiscount ? (
      <div
        className={
          "relative rounded-[28px] p-[1.5px] overflow-hidden dc-glow-ring " +
          "shadow-[0_14px_34px_-18px_rgba(11,31,58,0.24)] " +
          "group-hover:shadow-[0_28px_54px_-22px_rgba(9,115,186,0.32)] " +
          "transition-[box-shadow,transform] duration-500 motion-reduce:transition-none " +
          "group-hover:-translate-y-[3px]"
        }
      >
      <article className="relative overflow-hidden bg-white rounded-[26.5px]">
        {/* ── IMAGE BLOCK — aspect-[4/3], premium showcase, dominant görsel ── */}
        <div className="relative overflow-hidden aspect-[4/3] bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]">
          {showImage ? (
            <Image
              src={cover}
              alt={title || "Villa"}
              fill
              sizes="(max-width: 640px) 78vw, (max-width: 1024px) 340px, 380px"
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="
                object-cover object-center
                transition-transform duration-[900ms] ease-out
                group-hover:scale-[1.05]
                motion-reduce:transition-none motion-reduce:group-hover:scale-100
              "
            />
          ) : (
            /* PREMIUM FALLBACK — serif initial */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[64px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-2 text-[10px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-400)]">
                Görsel yakında
              </p>
            </div>
          )}

          {/* Bottom scrim — başlık/bölge legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/[0.78] via-black/[0.28] to-transparent pointer-events-none"
          />
          {/* Top vignette — badge legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/[0.24] via-black/[0.04] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* DISCOUNT BADGE — gerçek veri: bu kart discount koleksiyonunda küratörlü.
              Shimmer sweep + soft pulse halo — çok yavaş, premium, ucuz neon değil.
              prefers-reduced-motion → DiscountCollection'daki scoped style bloku
              animasyonları kapatır/azaltır. */}
          {isDiscount && (
            <span className="absolute top-3.5 left-3.5 z-10 dc-badge-pulse">
              <span className="dc-badge-shimmer relative overflow-hidden inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_20px_-6px_rgba(9,115,186,0.55)] ring-1 ring-white/30">
                <Sparkles size={12} strokeWidth={2.2} aria-hidden />
                Özel Fırsat · İndirimli
              </span>
            </span>
          )}

          {/* FAV BUTTON — top-right */}
          {id && <FavoriteButton villaId={id} variant="card" alwaysVisible />}

          {/* TITLE + LOCATION — görsel üzerinde alt overlay, brand accent çizgisi.
              Normal public karttan (VillaCard default) ayırt etmek için altina
              turuncu→mavi ince accent çizgisi eklendi. */}
          <div className="absolute inset-x-0 bottom-0 p-4 pointer-events-none">
            <h3 className="font-display text-[19px] md:text-[20px] font-semibold leading-[1.15] tracking-[-0.02em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] line-clamp-1">
              {title}
            </h3>
            <p className="mt-1 inline-flex items-center gap-1 text-[11.5px] text-white/85 uppercase tracking-[0.05em]">
              <MapPin size={11} className="shrink-0" strokeWidth={2} aria-hidden />
              <span className="truncate">{location || "Lokasyon yok"}</span>
            </p>
            <div
              aria-hidden="true"
              className="mt-2 h-[3px] w-12 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
            />
          </div>
        </div>

        {/* ── CONTENT AREA — kampanya hissi veren hafif gradient wash ── */}
        <div className="p-3.5 md:p-4 bg-gradient-to-br from-[#FFF6F0] via-white to-[#F0F8FC]">
          {/* REVIEW META — opsiyonel, mevcut veri, format AYNEN korunur */}
          {typeof reviewCount === "number" && reviewCount > 0 &&
            typeof reviewAverage === "number" && reviewAverage > 0 && (
              <div
                className="flex items-center gap-1 text-[11.5px] text-[var(--color-stone-600)]"
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

          {/* AMENITIES — inline icon+text satır, aynı veri (guests/bedrooms/bathrooms) */}
          <div
            className={
              (typeof reviewCount === "number" &&
              reviewCount > 0 &&
              typeof reviewAverage === "number" &&
              reviewAverage > 0
                ? "mt-3 "
                : "") +
              "flex items-center justify-center gap-x-4 gap-y-1.5 flex-wrap text-[12.5px] font-medium text-[var(--color-stone-800)]"
            }
          >
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={`${guests} kişi kapasitesi`}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-[#0973BA]/10 text-[#0973BA] shrink-0" aria-hidden>
                <Users size={17} strokeWidth={2.2} />
              </span>
              <span className="tabular-nums">{guests} Kişi</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={`${bedrooms} yatak odası`}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-[#0973BA]/10 text-[#0973BA] shrink-0" aria-hidden>
                <BedDouble size={17} strokeWidth={2.2} />
              </span>
              <span className="tabular-nums">{bedrooms} Yatak Odası</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={`${bathrooms} banyo`}
            >
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-[#0973BA]/10 text-[#0973BA] shrink-0" aria-hidden>
                <Bath size={17} strokeWidth={2.2} />
              </span>
              <span className="tabular-nums">{bathrooms} Banyo</span>
            </span>
          </div>

          {/* Divider */}
          <div aria-hidden="true" className="mt-3.5 h-px bg-[var(--color-stone-200)]/70" />

          {/* BOTTOM ROW — price (sol) + booking CTA (sağ).
              Fiyat hesabı (stayTotal / convertedPrice) ve booking trigger
              handler'i birebir aynı; yalnız stil/konum değişti. */}
          <div className="mt-3.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {stayTotal !== null ? (
                <>
                  <div className="font-display text-[18px] md:text-[19px] text-[var(--color-stone-900)] tracking-[-0.015em] tabular-nums leading-none">
                    {formatCurrency(stayTotal, currency)}
                  </div>
                  <div className="mt-1 text-[10.5px] tracking-[0.04em] uppercase text-[var(--color-stone-500)] tabular-nums">
                    {stayNights} gece{hasCleaning ? " · Temizlik dahil" : ""}
                  </div>
                </>
              ) : (
                <>
                  <div className="font-display text-[18px] md:text-[19px] text-[var(--color-stone-900)] tracking-[-0.015em] tabular-nums leading-none">
                    {price ? formatCurrency(convertedPrice, currency) : "Fiyat sorunuz"}
                  </div>
                  {price ? (
                    <div className="mt-1 text-[10.5px] tracking-[0.04em] uppercase text-[var(--color-stone-500)]">
                      Başlayan Fiyatlarla
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsBookingOpen(true);
              }}
              aria-label="Müsaitlik ve tarih seçimi modalını aç"
              className={
                "shrink-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap " +
                "h-9 px-3.5 rounded-xl " +
                "bg-gradient-to-r from-[#ED7926] to-[#0973BA] text-white " +
                "uppercase font-medium text-[11px] tracking-[0.06em] " +
                "shadow-[0_6px_16px_-6px_rgba(9,115,186,0.45)] " +
                "hover:shadow-[0_10px_22px_-6px_rgba(9,115,186,0.55)] hover:-translate-y-px " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40 " +
                "transition-[box-shadow,transform] duration-200 motion-reduce:transition-none"
              }
            >
              <CalendarRange size={13} strokeWidth={1.75} aria-hidden />
              Müsaitlik / Tarih Seç
            </button>
          </div>
          {reserveBlock}
        </div>
      </article>
      </div>
      ) : (
      <article
        className={
          "relative overflow-hidden bg-white " +
          "rounded-[22px] border border-[var(--color-stone-100)] " +
          "shadow-[0_14px_34px_-22px_rgba(11,31,58,0.22)] " +
          "group-hover:shadow-[0_28px_56px_-24px_rgba(11,31,58,0.32),0_0_0_1px_rgba(9,115,186,0.14)] " +
          "group-hover:border-[#0973BA]/25 " +
          "transition-[box-shadow,transform,border-color] duration-500 motion-reduce:transition-none " +
          "group-hover:-translate-y-[3px]"
        }
      >
        {/* ── IMAGE BLOCK — aspect-[4/3] (büyük, premium) ── */}
        <div
          className={
            "relative overflow-hidden " +
            "aspect-[4/3] " +
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
                transition-transform duration-[1000ms] ease-out
                group-hover:scale-[1.06]
                motion-reduce:transition-none motion-reduce:group-hover:scale-100
              "
            />
          ) : (
            /* PREMIUM FALLBACK — serif initial */
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
              <div className="font-display text-[72px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
                {initial}
              </div>
              <p className="mt-2 text-[10px] tracking-[0.24em] uppercase font-medium text-[var(--color-stone-400)]">
                Görsel yakında
              </p>
            </div>
          )}

          {/* Top vignette — badge/fav buton legibility */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/[0.22] via-black/[0.05] to-transparent pointer-events-none"
          />
          {/* Inner premium ring stroke */}
          <div
            aria-hidden="true"
            className="absolute inset-0 ring-1 ring-inset ring-white/15 pointer-events-none"
          />

          {/* BADGE — glass pill + turuncu→mavi gradient indicator dot. */}
          {badge && (
            <span className="absolute top-3.5 left-3.5 z-10 inline-flex items-center gap-1.5 bg-white/95 backdrop-blur-md text-[var(--color-stone-900)] text-[10px] tracking-[0.16em] uppercase font-semibold px-2.5 py-1.5 rounded-full shadow-[0_6px_18px_-6px_rgb(27_26_23/0.28)] ring-1 ring-white/50">
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-1.5 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
              />
              {badge}
            </span>
          )}

          {/* FAV BUTTON — top-right (mevcut FavoriteButton, davranış/API AYNEN) */}
          {id && <FavoriteButton villaId={id} variant="card" alwaysVisible />}

          {/* ════════════════════════════════════════════════
              🛡️ OVERLAY — villa adı + bölge, görselin sol altında.
              Public kart redesign: eskiden CONTENT AREA'nın (beyaz
              panel) en üstünde ayrı satırlardı; şimdi görsel üzerinde,
              okunabilirlik için zarif koyu gradient scrim üzerinde.
              Diğer her şey (review/amenities/fiyat/CTA/favori) AYNEN
              CONTENT AREA'da kalmaya devam ediyor — yalnız bu iki alan
              taşındı. Discount/curation variant'ları ETKİLENMEDİ. */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-black/75 via-black/30 to-transparent pointer-events-none"
          />
          <div className="absolute inset-x-0 bottom-0 z-10 p-3.5 md:p-4 pr-20 md:pr-24">
            <h3
              className={
                "font-display text-white font-semibold " +
                "text-[17px] md:text-[19px] leading-[1.15] tracking-[-0.02em] " +
                "line-clamp-1 group-hover:text-white/90 " +
                "transition-colors duration-300 motion-reduce:transition-none " +
                "drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
              }
            >
              {title}
            </h3>
            <p className="mt-1 flex items-center gap-1.5 text-[10.5px] tracking-[0.14em] uppercase font-medium text-white/80 min-w-0">
              <MapPin
                size={11}
                className="text-white/75 shrink-0"
                strokeWidth={1.9}
                aria-hidden
              />
              <span className="truncate">{location || "Lokasyon yok"}</span>
            </p>
          </div>

          {/* REVIEW BADGE — görselin sağ altı (villa adı/bölge sol altta
              olduğu için ayrık köşe). Zarif glass pill; format birebir
              korunur ("X.X · N yorum"), gerçek reviewAverage/reviewCount —
              0/undefined'da render edilmez (eski davranışla aynı guard).
              CONTENT AREA'daki eski REVIEW META bloğunun YERİNE bu geldi
              (aşağıda o blok kaldırılıp price satırına dönüştürüldü). */}
          {typeof reviewCount === "number" && reviewCount > 0 &&
            typeof reviewAverage === "number" && reviewAverage > 0 && (
              <div
                className="absolute bottom-3.5 md:bottom-4 right-3.5 md:right-4 z-10 inline-flex items-center gap-1 bg-white/90 backdrop-blur-md text-[var(--color-stone-900)] text-[11px] font-medium px-2.5 py-1 rounded-full shadow-[0_4px_14px_-4px_rgba(0,0,0,0.28)] ring-1 ring-white/50"
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
                <span className="tabular-nums">{reviewAverage.toFixed(1)}</span>
                <span aria-hidden="true" className="text-[var(--color-stone-400)]">·</span>
                <span className="tabular-nums">{reviewCount} yorum</span>
              </div>
            )}
        </div>

        {/* ── CONTENT AREA ── */}
        <div className="p-4 md:p-5">
          {/* PRICE — "X başlayan fiyatlarla" sade satırı; REVIEW META'nın
              eski konumu (review artık görsel üzerinde sağ altta, bkz.
              yukarıdaki REVIEW BADGE). Aynı convertedPrice/formatCurrency/
              currency BOTTOM ROW'daki mevcut hesaptan reuse edilir — yeni
              fiyat hesabı YOK. Yalnız stayTotal===null (tarih aralığı
              seçilmemiş "başlangıç fiyatı" senaryosu) VE isFlexible===false
              iken render edilir; BOTTOM ROW'daki aynı metin ÇİFT gösterim
              olmasın diye oradan kaldırıldı (stayTotal!==null tarih-seçili
              toplam ve isFlexible esnek-sonuç senaryoları BOTTOM ROW'da
              AYNEN kalmaya devam ediyor — mutually exclusive, çakışma yok). */}
          {!isFlexible && stayTotal === null && (
            <p className="mt-2 text-[13px] text-[var(--color-stone-500)]">
              {price ? (
                <>
                  <span className="font-display text-[15px] font-medium text-[var(--color-stone-900)] tabular-nums">
                    {formatCurrency(convertedPrice, currency)}
                  </span>{" "}
                  başlayan fiyatlarla
                </>
              ) : (
                "Fiyat sorunuz"
              )}
            </p>
          )}

          {/* Divider — üst bilgi bloğu ↔ özellikler */}
          <div aria-hidden="true" className="mt-3.5 h-px bg-[var(--color-stone-100)]" />

          {/* AMENITIES — guests / bedrooms / bathrooms, marka rengi ikon vurgusu */}
          <div className="mt-3.5 flex items-center gap-x-4 gap-y-1.5 flex-wrap text-[12.5px] font-medium text-[var(--color-stone-800)]">
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={`${guests} kişi kapasitesi`}
            >
              <Users size={15} className="text-[#0973BA]" strokeWidth={1.9} aria-hidden />
              <span className="tabular-nums">{guests} Kişi</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={`${bedrooms} yatak odası`}
            >
              <BedDouble size={15} className="text-[#0973BA]" strokeWidth={1.9} aria-hidden />
              <span className="tabular-nums">{bedrooms} Yatak Odası</span>
            </span>
            <span
              className="inline-flex items-center gap-1.5"
              aria-label={`${bathrooms} banyo`}
            >
              <Bath size={15} className="text-[#0973BA]" strokeWidth={1.9} aria-hidden />
              <span className="tabular-nums">{bathrooms} Banyo</span>
            </span>
          </div>

          {/* Marka rengi imza çizgisi — küçük vurgu */}
          <div
            aria-hidden="true"
            className="mt-3.5 h-[2px] w-10 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
          />

          {/* BOTTOM ROW — fiyat (sol, varsa) + booking CTA. Handler/aria-label/
              lazy modal mantığı AYNEN; fiyat hesabı (stayTotal / convertedPrice)
              üst tanımdan BİREBİR reuse — yeni hesap YOK.
              🛡️ CTA HİZALAMA — justify-between kaldırıldı; buton `mx-auto`
              ile fiyat/chip bloğunun (varsa) SAĞINDAKİ boşlukta ortalanır.
              Fiyat/chip bloğu solda AYNI konumunda kalır (taşınmadı); boş
              olduğu yaygın durumda (stayTotal===null, isFlexible=false)
              satırın tamamı boş kaldığı için buton satırın tam ortasına
              gelir. Buton genişlik/yükseklik/renk/hover/metin AYNEN. */}
          <div className="mt-3.5 flex items-end gap-3">
            {isFlexible ? (
              /* 🛡️ ESNEK EK SONUÇ — fiyat gösterilmez; fiyat motoru
                 çağrılmaz, ana tarih/href akışı korunur. */
              <div className="min-w-0">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#ED7926]/10 to-[#0973BA]/10 ring-1 ring-[#0973BA]/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#0973BA]">
                  <Sparkles size={11} strokeWidth={2} className="text-[#ED7926]" aria-hidden />
                  Esnek Tarih Fırsatı
                </div>
                <div className="mt-1 text-[11px] font-medium text-[var(--color-stone-600)]">
                  ±3 gün içinde müsait
                </div>
              </div>
            ) : (
              /* 🛡️ stayTotal===null durumunda (tarih seçilmemiş) fiyat
                 artık CONTENT AREA'nın üstünde ("X başlayan fiyatlarla",
                 review'ın eski konumu) gösteriliyor — burada ÇİFT
                 gösterim olmasın diye boş bırakıldı. stayTotal!==null
                 (tarih seçili gerçek toplam) AYNEN korunuyor, taşınmadı. */
              <div className="min-w-0">
                {stayTotal !== null ? (
                  <>
                    <div className="font-display text-[19px] md:text-[20px] text-[var(--color-stone-900)] tracking-[-0.015em] tabular-nums leading-none">
                      {formatCurrency(stayTotal, currency)}
                    </div>
                    <div className="mt-1 text-[10.5px] tracking-[0.04em] uppercase text-[var(--color-stone-500)] tabular-nums">
                      {stayNights} gece{hasCleaning ? " · Temizlik dahil" : ""}
                    </div>
                  </>
                ) : null}
              </div>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsBookingOpen(true);
              }}
              aria-label="Müsaitlik ve tarih seçimi modalını aç"
              className={
                "shrink-0 mx-auto inline-flex items-center justify-center gap-1.5 whitespace-nowrap " +
                "h-9 px-4 rounded-full " +
                "text-white uppercase font-medium text-[11px] tracking-[0.06em] " +
                "bg-gradient-to-r from-[#ED7926] to-[#0973BA] " +
                "shadow-[0_10px_22px_-10px_rgba(9,115,186,0.45)] " +
                "hover:shadow-[0_14px_28px_-10px_rgba(9,115,186,0.55)] hover:-translate-y-[1px] " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40 focus-visible:ring-offset-1 " +
                "transition-[box-shadow,transform] duration-300 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
              }
            >
              <CalendarRange size={13} strokeWidth={1.9} aria-hidden />
              Müsaitlik / Tarih Seç
            </button>
          </div>
          {reserveBlock}
        </div>
      </article>
      )
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
