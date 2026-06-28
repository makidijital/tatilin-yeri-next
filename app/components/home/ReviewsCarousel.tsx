"use client";

/* ===============================================================
   🛡️ ReviewsCarousel — Embla tabanlı premium yorum carousel'i
   ===============================================================
   Sabit yükseklik: 5 yorum da olsa 500 yorum da olsa homepage
   büyümez; tüm yorumlar bu carousel içinde döner.

   - Desktop 3 / Tablet 2 / Mobil 1 slide (CSS flex-basis ile;
     Embla slidesToShow yerine slide genişliğini kontrol eder).
   - Sol/sağ ok, infinite loop (yeterli slide varsa), autoplay 5sn,
     hover'da autoplay durur, mobilde swipe (Embla drag native).
   - SSR uyumlu: viewport overflow-hidden + slide'lar flex row →
     ilk paint statik kartları gösterir, hydration sonrası
     interaktif olur. CLS yok.

   Kart UI: beyaz, rounded-2xl, border, premium shadow, hover lift.
     ⭐ üstte · yorum ortada (Devamını Oku) · isim + tarih altta.
=============================================================== */

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

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
  /* Loop yalnız desktop per-view (3) üzerinde slide varsa anlamlı;
     az slide'da Embla loop glitch'ini önlemek için koşullu. */
  const enableLoop = reviews.length > 3;

  const [emblaRef, emblaApi] = useEmblaCarousel(
    {
      loop: enableLoop,
      align: "start",
      slidesToScroll: 1,
      containScroll: enableLoop ? undefined : "trimSnaps",
    },
    [
      Autoplay({
        delay: 5000,
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ]
  );

  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
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

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <div className="relative">
      {/* VIEWPORT */}
      <div className="overflow-hidden" ref={emblaRef}>
        {/* CONTAINER — flex row; slide genişliği breakpoint'e göre */}
        <div className="flex -ml-5 md:-ml-6">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="
                pl-5 md:pl-6 shrink-0 grow-0
                basis-full sm:basis-1/2 lg:basis-1/3
              "
            >
              <ReviewCard review={r} />
            </div>
          ))}
        </div>
      </div>

      {/* NAV OKLARI — desktop'ta görünür; mobilde swipe yeterli */}
      {reviews.length > 1 && (
        <div className="hidden md:flex items-center justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={scrollPrev}
            disabled={!enableLoop && !canPrev}
            aria-label="Önceki yorumlar"
            className="
              w-11 h-11 inline-flex items-center justify-center
              rounded-full border border-[var(--color-stone-200)] bg-white
              text-[var(--color-stone-600)]
              hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)]
              hover:shadow-[0_8px_20px_-12px_rgba(27,26,23,0.18)]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-[color,border-color,box-shadow] duration-300
              motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40
            "
          >
            <ChevronLeft size={18} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            disabled={!enableLoop && !canNext}
            aria-label="Sonraki yorumlar"
            className="
              w-11 h-11 inline-flex items-center justify-center
              rounded-full border border-[var(--color-stone-200)] bg-white
              text-[var(--color-stone-600)]
              hover:border-[var(--color-stone-300)] hover:text-[var(--color-stone-900)]
              hover:shadow-[0_8px_20px_-12px_rgba(27,26,23,0.18)]
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-[color,border-color,box-shadow] duration-300
              motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/40
            "
          >
            <ChevronRight size={18} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ===============================================================
   ReviewCard — beyaz premium kart (sabit yapı)
   =============================================================== */
function ReviewCard({ review }: { review: CarouselReview }) {
  const [expanded, setExpanded] = useState(false);
  const rating = Math.max(0, Math.min(5, Math.round(review.rating)));
  const comment = (review.comment || "").trim();
  const isLong = comment.length > 180;

  return (
    <article
      className="
        h-full flex flex-col
        rounded-2xl border border-[var(--color-stone-100)] bg-white
        shadow-[0_12px_30px_-20px_rgba(27,26,23,0.14)]
        hover:-translate-y-1
        hover:shadow-[0_24px_50px_-26px_rgba(27,26,23,0.22)]
        hover:border-[var(--color-stone-200)]
        transition-[transform,box-shadow,border-color] duration-300
        motion-reduce:transition-none motion-reduce:hover:translate-y-0
        px-6 py-7 md:px-7 md:py-8
      "
    >
      {/* TOP — villa thumbnail (sol) + villa adı + compact rating (sağ) */}
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0 w-14 h-14 overflow-hidden rounded-lg bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)]">
          {review.villaCover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={review.villaCover}
              alt={review.villaTitle}
              className="w-full h-full object-cover object-center"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center select-none font-display text-[20px] text-[var(--color-stone-300)]">
              {(review.villaTitle?.[0] || "·").toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-medium text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
            {review.villaTitle}
          </p>
          <span
            className="mt-1 inline-flex items-center gap-1 text-[12.5px]"
            aria-label={`${rating} / 5 puan`}
          >
            <Star
              size={13}
              className="text-amber-500"
              fill="currentColor"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="font-medium text-[var(--color-stone-800)] tabular-nums">
              {rating}
            </span>
          </span>
        </div>
      </div>

      {/* YORUM — ortada (flex-1); Devamını Oku ile genişler.
         line-clamp-5 utility projede yok → 5-satır clamp inline
         -webkit-box ile (mevcut pattern). Expanded'da clamp kalkar. */}
      <blockquote
        className="mt-5 flex-1 text-[15px] leading-[1.75] text-[var(--color-stone-700)]"
        style={
          expanded
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: 5,
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
            mt-2 self-start text-[12.5px] font-medium
            text-[var(--brand-coral)] hover:text-[var(--brand-coral-deep)]
            transition-colors motion-reduce:transition-none
            focus:outline-none focus-visible:underline
          "
          aria-expanded={expanded}
        >
          {expanded ? "Daha az göster" : "Devamını Oku"}
        </button>
      )}

      {/* MİSAFİR ADI + TARİH — altta */}
      <div className="mt-6 pt-5 border-t border-[var(--color-stone-100)] flex items-center gap-3">
        <Avatar name={review.guest_name} />
        <div className="min-w-0">
          <p className="font-display text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em] truncate">
            {review.guest_name}
          </p>
          {review.created_at && (
            <p className="text-[11.5px] text-[var(--color-stone-400)] mt-0.5 tabular-nums">
              {formatDateTr(review.created_at)}
            </p>
          )}
        </div>
      </div>
    </article>
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
