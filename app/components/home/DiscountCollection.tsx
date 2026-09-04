import { getCachedDiscountCollectionVillas } from "@/lib/cache.helpers";
import { DISCOUNT_COLLECTION_DEFAULTS } from "@/app/services/discount-collection.service";
import VillaCard from "../villa/VillaCard";
import HorizontalCarousel from "../villa/HorizontalCarousel";

/* ===============================================================
   🛡️ DISCOUNT COLLECTION — anasayfa "İndirimli Koleksiyon" section
   ===============================================================
   homepage_collections paritesi: SETTINGS BAĞIMLILIĞI YOK.
     - Veri: getCachedDiscountCollectionVillas (tag "discount")
     - Görünürlük OTOMATİK: aktif villa varsa render, yoksa null.
       (Manuel aç-kapa toggle YOK.)
     - Başlık/alt başlık: hardcoded (DISCOUNT_COLLECTION_DEFAULTS).
     - Kart: VillaCard variant="discount" (İndirimli badge + accent).
   Mevcut homepage collection / VillaList / settings'e SIFIR dokunuş.

   🛡️ PREMIUM DISCOUNT CAROUSEL (bu revizyon)
   ---------------------------------------------------------------
   Statik grid → yatay HorizontalCarousel (mevcut altyapı, CategoryCollection/
   VillaTypeCarousel ile aynı generic component — yeni dependency YOK).
   Mobilde native touch/scroll-snap swipe; desktop'ta showArrows.
   Kart tasarımı (VillaCard variant="discount" branch) tamamen yeniden
   ele alındı — normal public karttan görsel olarak belirgin şekilde
   farklı, premium "özel fırsat" hissi. Veri akışı (props) BİREBİR
   aynı — sadece görsel katman değişti.

   Bu dosyadaki <style> bloğu, VillaCard'ın discount branch'inde
   kullanılan .dc-badge-shimmer / .dc-badge-pulse / .dc-glow-ring
   class'larının keyframe/animasyon tanımlarını taşır — component
   seviyesinde çözüm, globals.css'e dokunulmadı. Yalnız bu section
   render olduğunda (collection.length > 0) bir kez basılır.
   prefers-reduced-motion: reduce → tüm animasyonlar kapanır/azalır.
=============================================================== */

export default async function DiscountCollection() {
  const collection = await getCachedDiscountCollectionVillas();

  /* Görünürlük kuralı: küratörlü aktif villa yoksa render edilmez. */
  if (collection.length === 0) return null;

  const title = DISCOUNT_COLLECTION_DEFAULTS.title;

  return (
    <section className="px-5 md:px-10 lg:px-16 py-14 md:py-20">
      {/* 🛡️ Component-scoped premium effect styles — globals.css'e
          dokunulmadı; yalnız bu section'daki .dc-* class'larını
          hedefler (VillaCard discount branch bu class'ları kullanır). */}
      <style>{`
        .dc-badge-shimmer::after {
          content: "";
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.55), transparent);
          transform: skewX(-20deg);
          animation: dc-shimmer-sweep 3.6s ease-in-out infinite;
          pointer-events: none;
        }
        @keyframes dc-shimmer-sweep {
          0% { left: -60%; opacity: 0; }
          12% { opacity: 0.9; }
          55% { left: 130%; opacity: 0; }
          100% { left: 130%; opacity: 0; }
        }
        .dc-badge-pulse::before {
          content: "";
          position: absolute;
          inset: -6px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(237,121,38,0.38), rgba(9,115,186,0.24) 60%, transparent 72%);
          animation: dc-badge-glow 2.8s ease-in-out infinite;
          z-index: -1;
          pointer-events: none;
        }
        @keyframes dc-badge-glow {
          0%, 100% { opacity: 0.35; transform: scale(0.94); }
          50% { opacity: 0.8; transform: scale(1.08); }
        }
        .dc-glow-ring {
          background: linear-gradient(135deg, rgba(237,121,38,0.55), rgba(9,115,186,0.55));
          background-size: 200% 200%;
          animation: dc-glow-shift 7s ease-in-out infinite;
        }
        @keyframes dc-glow-shift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .dc-badge-shimmer::after { animation: none; opacity: 0; }
          .dc-badge-pulse::before { animation: none; opacity: 0.45; transform: scale(1); }
          .dc-glow-ring { animation: none; background-position: 30% 50%; }
        }
      `}</style>

      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            {title}
          </h2>
        </div>

        <HorizontalCarousel
          showArrows
          ariaLabel="İndirimli kiralık villalar"
          className="pb-1"
        >
          <ul role="list" className="flex flex-nowrap min-w-max gap-5 md:gap-6">
            {collection.map((c) => (
              <li
                key={c.slug || c.id}
                className="snap-start shrink-0 w-[82vw] max-w-[320px] sm:w-[340px] md:w-[360px] lg:w-[380px]"
              >
                <VillaCard
                  variant="discount"
                  id={c.id}
                  slug={c.slug}
                  title={c.display_title}
                  location={c.location}
                  price={c.price ?? 0}
                  currency={c.currency || "TRY"}
                  images={c.images}
                  badge={c.badge ?? undefined}
                  bedrooms={c.bedrooms || 1}
                  bathrooms={c.bathrooms || 1}
                  guests={c.guests || 2}
                  reviewAverage={c.review_average}
                  reviewCount={c.review_count}
                />
              </li>
            ))}
          </ul>
        </HorizontalCarousel>
      </div>
    </section>
  );
}
