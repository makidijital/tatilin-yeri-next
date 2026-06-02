import { Star } from "lucide-react";

import {
  getCachedHomepageReviews,
  getCachedGlobalReviewStats,
} from "@/lib/cache.helpers";
import ReviewsCarousel, {
  type CarouselReview,
} from "./ReviewsCarousel";

/* ===============================================================
   🛡️ HOMEPAGE REVIEWS SECTION — sabit yükseklikli premium carousel
   ===============================================================
   PROBLEM (eski): grid 3/2/1 — yorum sayısı arttıkça kartlar alt
   alta uzuyor, homepage büyüyordu.
   ÇÖZÜM: yorumlar Embla carousel içinde döner; 5 de olsa 500 de
   olsa section yüksekliği sabit.

   KORUNDU:
     - Veri kaynağı: getCachedHomepageReviews (approved-only,
       featured-first) — DOKUNULMADI.
     - Review + puan sistemi — DOKUNULMADI.
   DEĞİŞEN: yalnız UI (server header + trust band + client carousel).

   TRUST BAND: gerçek global istatistik (getCachedGlobalReviewStats)
     → "X.X/5 Ortalama · YYY Doğrulanmış Misafir Yorumu".

   EMPTY STATE: reviews.length === 0 → null (CLS yok).
=============================================================== */

export default async function HomepageReviewsSection() {
  const [reviews, stats] = await Promise.all([
    getCachedHomepageReviews().catch(() => []),
    getCachedGlobalReviewStats().catch(() => ({ count: 0, average: 0 })),
  ]);

  if (!reviews || reviews.length === 0) return null;

  /* Carousel'in beklediği slim shape'e map (veri kaynağı aynen;
     sadece carousel için gerekli alanlar seçilir). */
  const carouselReviews: CarouselReview[] = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    guest_name: r.guest_name,
    created_at: r.created_at ?? null,
  }));

  const avg = stats.average > 0 ? stats.average.toFixed(1) : null;
  const count = stats.count > 0 ? stats.count : null;

  return (
    <section
      id="misafir-deneyimleri"
      aria-label="Misafir Deneyimleri"
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-12 md:pb-16"
    >
      <div className="max-w-[1280px] mx-auto">
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 md:gap-10 mb-8 md:mb-10">
          <div className="max-w-xl">
            <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium inline-flex items-center text-[var(--brand-coral)]">
              <span
                aria-hidden="true"
                className="inline-block w-6 h-px align-middle mr-3 bg-[var(--brand-coral)]/60"
              />
              Misafir Deneyimleri
            </p>
            <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-3 leading-tight tracking-[-0.02em]">
              Misafirlerimiz ne diyor?
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md">
              Konaklamasını bizimle yapan misafirlerin kendi sözleriyle
              Akdeniz deneyimleri.
            </p>
          </div>

          {/* TRUST BAND — gerçek global istatistik */}
          {(avg || count) && (
            <div className="flex items-center gap-5 shrink-0">
              {avg && (
                <div className="flex items-center gap-2.5">
                  <Star
                    size={22}
                    className="text-amber-500"
                    fill="currentColor"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <div>
                    <p className="font-display text-[20px] md:text-[22px] text-[var(--color-stone-900)] leading-none tabular-nums">
                      {avg}
                      <span className="text-[var(--color-stone-400)] text-[15px]">
                        /5
                      </span>
                    </p>
                    <p className="text-[11px] text-[var(--color-stone-500)] mt-1">
                      Ortalama Puan
                    </p>
                  </div>
                </div>
              )}
              {count && (
                <div className="pl-5 border-l border-[var(--color-stone-200)]">
                  <p className="font-display text-[20px] md:text-[22px] text-[var(--color-stone-900)] leading-none tabular-nums">
                    {count.toLocaleString("tr-TR")}
                  </p>
                  <p className="text-[11px] text-[var(--color-stone-500)] mt-1">
                    Doğrulanmış Yorum
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* CAROUSEL — client island (Embla) */}
        <ReviewsCarousel reviews={carouselReviews} />
      </div>
    </section>
  );
}
