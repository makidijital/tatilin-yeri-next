import { getCachedHomepageReviews } from "@/lib/cache.helpers";
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
  const reviews = await getCachedHomepageReviews().catch(() => []);

  if (!reviews || reviews.length === 0) return null;

  /* Carousel slim shape'e map (veri kaynağı aynen). Villa adı + cover
     mevcut review datasından eklenir — yeni fetch YOK. */
  const carouselReviews: CarouselReview[] = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    guest_name: r.guest_name,
    created_at: r.created_at ?? null,
    villaTitle: r.villa.title ?? "",
    villaCover: r.villa.cover_image ?? null,
  }));

  return (
    <section
      id="misafir-deneyimleri"
      aria-label="Misafir Deneyimleri"
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-12 md:pb-16"
    >
      <div className="max-w-[1280px] mx-auto">
        {/* HEADER — centered, eyebrow + genel rating özeti kaldırıldı */}
        <div className="text-center mb-8 md:mb-10">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            Misafirlerimiz ne diyor?
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md mx-auto">
            Konaklamasını bizimle yapan misafirlerin kendi sözleriyle
            Akdeniz deneyimleri.
          </p>
        </div>

        {/* CAROUSEL — client island (Embla) */}
        <ReviewsCarousel reviews={carouselReviews} />
      </div>
    </section>
  );
}
