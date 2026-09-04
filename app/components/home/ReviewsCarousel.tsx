"use client";

/* ===============================================================
   🛡️ ReviewsCarousel — "Guest Stories" editorial testimonial rail
   ===============================================================
   ÖNCEKİ TASARIM: klasik 3/2/1 sütun beyaz kart carousel'i (Embla).
   YENİ TASARIM: tek seferde TEK büyük "aktif" yorum, editorial
   tipografi + dekoratif büyük tırnak işareti; diğer misafirler
   altta minimal bir "story rail" (isim navigasyonu) olarak
   listelenir; aktif konum ince turuncu→mavi bir progress çizgisiyle
   gösterilir. Klasik "3 beyaz kart yan yana" + ağır border/shadow
   yapısı KALDIRILDI.

   KORUNAN (veri/mantık — DOKUNULMADI):
     - CarouselReview tipi ve tüm alanları (id/rating/comment/
       guest_name/created_at/villaTitle/villaCover) — HomepageReviewsSection
       tarafından aynen üretilip geçiliyor.
     - Embla carousel altyapısı (mevcut proje bağımlılığı; yeni
       dependency eklenmedi) — artık tek-slide (basis-full) modunda,
       isim rail'i + swipe (mobil native drag) ile senkron.
     - Yorum metni uzun ise "Devamını oku" genişletme davranışı
       (isLong / expanded state) AYNEN korundu — sadece stil.
     - Misafir avatarı (initials) — Avatar() fonksiyonu AYNEN.
     - Villa küçük görseli (villaCover) + fallback baş harfi — AYNEN,
       yalnızca konum/boyutu meta satırına taşındı.
     - Puan gösterimi (yıldız + sayı) — AYNEN, sadece minimal
       yerleşim.

   DEĞİŞEN (yalnız UX/etkileşim, açıkça istenen yön):
     - Agresif otomatik kayan autoplay KALDIRILDI (brief: "sürekli
       otomatik kayan agresif carousel yapma") — gezinme artık
       kullanıcı kontrolünde: isim rail'ine tıklama, swipe (mobil)
       veya klavye/tab ile rail butonları.
     - Sağ/sol ok butonları kaldırıldı; yerine isim rail'i + ince
       progress çizgisi geldi (brief'teki "story rail" alternatifi).

   prefers-reduced-motion: tüm geçişler zaten kısa/hafif (renk,
   width, opacity) — motion-reduce:transition-none ile tamamen
   durağan hale gelir, layout/behavior etkilenmez.
=============================================================== */

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Star } from "lucide-react";

import { formatDateTr } from "@/lib/date-format";

export type CarouselReview = {
  id: string;
  rating: number;
  comment: string;
  guest_name: string;
  created_at: string | null;
  /** Yorum yapılan villanın adı + cover URL (mevcut review datasından;
   *  yeni fetch yok). cover_image zaten resolve edilmiş absolute URL. */
  villaTitle: string;
  villaCover: string | null;
};

type Props = {
  reviews: CarouselReview[];
};

export default function ReviewsCarousel({ reviews }: Props) {
  const canNavigate = reviews.length > 1;

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: canNavigate,
    align: "start",
    slidesToScroll: 1,
  });

  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const scrollTo = useCallback(
    (idx: number) => emblaApi?.scrollTo(idx),
    [emblaApi]
  );

  const total = reviews.length;

  return (
    <div>
      {/* VIEWPORT — tek aktif yorum, tam genişlik editorial kompozisyon */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {reviews.map((r) => (
            <div key={r.id} className="shrink-0 grow-0 basis-full">
              <ActiveTestimonial review={r} />
            </div>
          ))}
        </div>
      </div>

      {canNavigate && (
        <>
          {/* PROGRESS — ince turuncu→mavi çizgi; aktif konumu gösterir */}
          <div
            aria-hidden="true"
            className="mt-9 md:mt-11 h-[2px] w-full max-w-[240px] bg-[var(--color-stone-100)] rounded-full overflow-hidden"
          >
            <div
              className="h-full bg-gradient-to-r from-[#ED7926] to-[#0973BA] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${((selectedIndex + 1) / total) * 100}%` }}
            />
          </div>

          {/* STORY RAIL — diğer misafirlerin isimleri, minimal navigasyon.
              Embla ile senkron: tıklama → scrollTo(idx); aktif seçim
              select event'i üzerinden geri yansır. */}
          <div
            className="mt-4 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1 py-1"
            aria-label="Diğer misafir yorumları arasında gezin"
          >
            {reviews.map((r, idx) => {
              const isActive = idx === selectedIndex;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => scrollTo(idx)}
                  aria-pressed={isActive}
                  aria-label={`${r.guest_name} yorumunu göster`}
                  className={
                    "shrink-0 px-3.5 py-2 rounded-full text-[13px] font-medium whitespace-nowrap " +
                    "transition-colors duration-200 motion-reduce:transition-none " +
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40 " +
                    (isActive
                      ? "text-white bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
                      : "text-[var(--color-stone-500)] hover:text-[var(--color-stone-800)] hover:bg-[var(--color-stone-50)]")
                  }
                >
                  {r.guest_name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ===============================================================
   ActiveTestimonial — büyük editorial yorum: dekoratif tırnak +
   büyük tipografi + minimal isim/tarih/puan/villa meta satırı.
   =============================================================== */
function ActiveTestimonial({ review }: { review: CarouselReview }) {
  const [expanded, setExpanded] = useState(false);
  const rating = Math.max(0, Math.min(5, Math.round(review.rating)));
  const comment = (review.comment || "").trim();
  const isLong = comment.length > 320;

  return (
    <div className="px-1">
      <div className="grid grid-cols-[auto_1fr] gap-3 md:gap-5">
        <span
          aria-hidden="true"
          className="font-display text-[56px] md:text-[84px] leading-[0.8] text-transparent bg-clip-text bg-gradient-to-br from-[#ED7926] to-[#0973BA] select-none"
        >
          &ldquo;
        </span>

        <div className="min-w-0 pt-2 md:pt-4">
          <blockquote
            className="font-display text-[19px] md:text-[27px] leading-[1.4] tracking-[-0.01em] text-[var(--color-stone-900)]"
            style={
              expanded
                ? undefined
                : {
                    display: "-webkit-box",
                    WebkitLineClamp: 6,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  }
            }
          >
            {comment}
          </blockquote>

          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="
                mt-3 text-[12.5px] font-medium
                text-[#0973BA] hover:text-[#ED7926]
                transition-colors motion-reduce:transition-none
                focus:outline-none focus-visible:underline
              "
              aria-expanded={expanded}
            >
              {expanded ? "Daha az göster" : "Devamını oku"}
            </button>
          )}

          {/* META — isim + tarih + puan + villa, minimal tek satır */}
          <div className="mt-7 md:mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="flex items-center gap-3">
              <Avatar name={review.guest_name} />
              <div className="min-w-0">
                <p className="font-display text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
                  {review.guest_name}
                </p>
                {review.created_at && (
                  <p className="text-[11.5px] text-[var(--color-stone-400)] tabular-nums mt-0.5">
                    {formatDateTr(review.created_at)}
                  </p>
                )}
              </div>
            </div>

            <span
              aria-hidden="true"
              className="hidden sm:block w-px h-9 bg-[var(--color-stone-100)]"
            />

            <span
              className="inline-flex items-center gap-1.5 text-[13px]"
              aria-label={`${rating} / 5 puan`}
            >
              <Star
                size={13}
                className="text-amber-500"
                fill="currentColor"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="font-medium text-[var(--color-stone-700)] tabular-nums">
                {rating}
              </span>
            </span>

            {review.villaTitle && (
              <span className="inline-flex items-center gap-2 text-[13px] text-[var(--color-stone-500)] min-w-0">
                <span className="relative shrink-0 w-7 h-7 overflow-hidden rounded-full bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]">
                  {review.villaCover ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={review.villaCover}
                      alt={review.villaTitle}
                      className="w-full h-full object-cover object-center"
                    />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center select-none font-display text-[11px] text-[var(--color-stone-300)]">
                      {(review.villaTitle?.[0] || "·").toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="truncate max-w-[160px]">{review.villaTitle}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/);
  const initials =
    parts.length === 0 || parts[0] === ""
      ? "·"
      : parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();

  return (
    <span
      className="
        w-10 h-10 rounded-full shrink-0
        bg-[var(--color-sand-100)]
        border border-[var(--color-stone-100)]
        flex items-center justify-center
        font-display text-[14px] text-[var(--color-champagne-700)]
        tracking-[-0.01em]
      "
      aria-hidden
    >
      {initials}
    </span>
  );
}
