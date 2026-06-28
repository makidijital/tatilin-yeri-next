import {
  getCachedVillas,
  getCachedHomepageCollectionVillas,
} from "@/lib/cache.helpers";
import VillaCard from "./VillaCard";

export default async function VillaList() {
  /* 🛡️ MANUEL CURASYON KONTRATI (migration 012):
     1) getCachedHomepageCollectionVillas → admin manuel seçilmiş villalar
        (is_active=true kayıtlar, sort_order ASC, villa görünür filter)
     2) Bu liste BOŞSA → getCachedVillas() otomatik fallback
        (eski davranış: tüm aktif villalar, sort_order ASC)

     Paralel fetch — cache hit'te ikisi de 0 RTT. Cache miss'te tek
     paralel call. Cache tag'leri ayrı: "homepage" + "villas".
     Admin homepage CRUD revalidateHomepage() çağırır; villa CRUD
     revalidateVillas() çağırır → ikisi bağımsız invalidate olur. */
  const [collection, autoVillas] = await Promise.all([
    getCachedHomepageCollectionVillas(),
    getCachedVillas(),
  ]);

  /* Manuel koleksiyon varsa onu kullan, VillaCard prop shape'ine
     map'le. Yoksa otomatik liste (DTO shape zaten uyumlu). */
  const villas =
    collection.length > 0
      ? collection.map((c) => ({
          id: c.id,
          slug: c.slug,
          title: c.display_title,
          location: c.location,
          price: c.price ?? 0,
          currency: c.currency,
          badge: c.badge ?? undefined,
          bedrooms: c.bedrooms,
          bathrooms: c.bathrooms,
          guests: c.guests,
          images: c.images,
          /* 🛡️ FAZ 35 — review aggregate passthrough (homepage curasyon). */
          review_average: c.review_average,
          review_count: c.review_count,
        }))
      : autoVillas;

  if (!villas.length) {
    return (
      <section className="px-5 md:px-10 lg:px-16 py-28 md:py-40">
        <div className="max-w-[1280px] mx-auto">
          <div className="max-w-xl">
            <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
              <span className="inline-block w-8 h-px bg-[var(--color-stone-300)] align-middle mr-3" />
              Koleksiyon
            </p>
            <h2 className="font-display text-[40px] md:text-[64px] text-[var(--color-stone-900)] mt-6 leading-[1.02] tracking-[-0.03em]">
              Yakında burada.
            </h2>
            <p className="text-[var(--color-stone-500)] mt-5 leading-relaxed text-[15px] md:text-[16px]">
              Akdeniz&apos;in en seçkin villalarını sizin için hazırlıyoruz.
              Koleksiyon, kısa süre içinde keşfedilmeyi bekleyecek.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 md:px-10 lg:px-16 py-14 md:py-20">
      <div className="max-w-[1280px] mx-auto">
        {/* 🛡️ FAZ 39L — Normalized section header.
           Hero ile yarışan 80px serif dev başlık kaldırıldı. Tek
           başlık + subtitle yapısı (CategoryCollection parity).
           Typography scale: section başlıkları orta boy; hero
           dominant kalır. */}
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            Sizin için seçtiklerimiz
          </h2>
        </div>

        {/* 🛡️ FAZ 39L — Grid spacing tightened (cards focus). */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 md:gap-x-8 gap-y-10 md:gap-y-12">
          {villas.map((villa) => (
            <VillaCard
              key={villa.slug || villa.id}
              /* 🛡️ FAZ 36 — favorites identity. */
              id={villa.id}
              slug={villa.slug}
              title={villa.title}
              location={villa.location}
              price={villa.price}
              currency={villa.currency || "TRY"}
              images={villa.images}
              badge={villa.badge}
              bedrooms={villa.bedrooms || 1}
              bathrooms={villa.bathrooms || 1}
              guests={villa.guests || 2}
              /* 🛡️ FAZ 35 — review trust meta (★ avg · count yorum). */
              reviewAverage={villa.review_average}
              reviewCount={villa.review_count}
            />
          ))}
        </div>

        {/* 🛡️ CTA — grid altında, tüm ekranlarda centered (header'dan taşındı). */}
        <div className="mt-9 md:mt-10 flex justify-center">
          <a
            href="/arama"
            className="
              group inline-flex items-center gap-2
              px-4 py-2 rounded-full
              border border-[var(--color-stone-200)]
              text-[12.5px] font-medium tracking-[0.02em]
              text-[var(--color-stone-700)]
              hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)]
              hover:bg-[var(--brand-coral-tint)]
              transition-colors motion-reduce:transition-none
            "
          >
            <span>Tüm Villaları Gör</span>
            <span
              aria-hidden="true"
              className="text-[var(--color-stone-500)] group-hover:text-[var(--brand-coral)]"
            >
              →
            </span>
          </a>
        </div>
      </div>
    </section>
  );
}
