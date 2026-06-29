import { getCachedDiscountCollectionVillas } from "@/lib/cache.helpers";
import { DISCOUNT_COLLECTION_DEFAULTS } from "@/app/services/discount-collection.service";
import VillaCard from "../villa/VillaCard";

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
=============================================================== */

export default async function DiscountCollection() {
  const collection = await getCachedDiscountCollectionVillas();

  /* Görünürlük kuralı: küratörlü aktif villa yoksa render edilmez. */
  if (collection.length === 0) return null;

  const title = DISCOUNT_COLLECTION_DEFAULTS.title;

  return (
    <section className="px-5 md:px-10 lg:px-16 py-14 md:py-20">
      <div className="max-w-[1280px] mx-auto">
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            {title}
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-10 md:gap-y-12">
          {collection.map((c) => (
            <VillaCard
              key={c.slug || c.id}
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
          ))}
        </div>
      </div>
    </section>
  );
}
