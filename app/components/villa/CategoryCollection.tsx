import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

import {
  getCachedVillaTypes,
  getCachedCategoryCovers,
} from "@/lib/cache.helpers";
import { getCategoryCoverPublicUrl } from "@/lib/storage.helpers";
import HorizontalCarousel from "@/app/components/villa/HorizontalCarousel";

/* ===============================================================
   🛡️ CATEGORY SHOWCASE — homepage premium editorial grid
   ===============================================================
   Önceki version küçük chip-strip idi; bu version cover_image
   (migration 010) destekli premium image-card grid.

   DATA (mevcut helper'lar reuse):
     getCachedVillaTypes()      → [{id, name, slug, cover_image}]
                                  (tag: taxonomy, TTL 1sa)
     getCachedCategoryCovers()  → { [typeId]: { coverImageUrl, villaCount } }
                                  (tag: villas+taxonomy, TTL 10dk)
     Tek round-trip; N+1 yok. Cache hit'te 0 DB hit.

   IMAGE SOURCE PRIORITY (3-tier):
     1. type.cover_image (admin upload, getCategoryCoverPublicUrl)
     2. covers[typeId].coverImageUrl (mevcut: ilk villa image fallback)
     3. soft placeholder (serif initial)

   FILTRE:
     count > 0 (aktif + deleted_at IS NULL villa içeren kategoriler).

   CLICK:
     /arama?villa-turleri=<slug | id>
     (mevcut URL contract; slug resolver server'da UUID'ye normalize eder)

   PERFORMANS:
     - Server component, SSR'da bir kere
     - next/image: WebP/AVIF auto-format, responsive srcSet, lazy load
     - sizes attribute: mobile ~78vw, tablet 1/2 col, desktop 1/4 col
     - Bundle: zero client JS
   =============================================================== */

type Item = {
  id: string;
  slug: string | null;
  name: string;
  count: number;
  coverUrl: string | null;
};

export default async function CategoryCollection() {
  const [types, covers] = await Promise.all([
    getCachedVillaTypes(),
    getCachedCategoryCovers(),
  ]);

  if (!types?.length) return null;

  const items: Item[] = types
    .map((t) => {
      const tid = String(t.id);
      const rawSlug = (t as { slug?: string | null }).slug;
      const slug =
        typeof rawSlug === "string" && rawSlug.trim().length > 0
          ? rawSlug.trim()
          : null;

      /* 3-tier image priority: admin upload → villa fallback → null */
      const adminCover = getCategoryCoverPublicUrl(
        (t as { cover_image?: string | null }).cover_image
      );
      const fallbackCover = covers[tid]?.coverImageUrl ?? null;
      const coverUrl = adminCover || fallbackCover;

      return {
        id: tid,
        slug,
        name: String(t.name || "").trim(),
        count: covers[tid]?.villaCount ?? 0,
        coverUrl,
      };
    })
    .filter((item) => item.count > 0 && item.name.length > 0);

  if (!items.length) return null;

  return (
    <section
      aria-label="Kategoriler"
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-4 md:pb-10"
    >
      <div className="max-w-[1280px] mx-auto">
        {/* 🛡️ FAZ 39H — Refined editorial header.
           Daha kompakt + daha modern hierarchy:
             - Eyebrow "KOLEKSİYONLAR" tracking-tight uppercase coral
             - Title 2-line; eski 72px → 40px lg (daha okunabilir)
             - Subtitle ayrı paragraf (stone-500 max-w-md)
             - CTA luxury ghost pill (coral hover) */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 md:gap-10 mb-8 md:mb-12">
          <div className="max-w-xl">
            <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium inline-flex items-center text-[var(--brand-coral)]">
              <span
                aria-hidden="true"
                className="inline-block w-6 h-px align-middle mr-3 bg-[var(--brand-coral)]/60"
              />
              Koleksiyonlar
            </p>
            {/* 🛡️ FAZ 39M — Normalized section title scale. */}
            <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-3 leading-tight tracking-[-0.02em]">
              Tarzınıza uygun villalar.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md">
              Akdeniz koleksiyonu — her seyahat tarzına özenle
              seçilmiş kategoriler.
            </p>
          </div>
          <Link
            href="/arama"
            className="
              group hidden md:inline-flex items-center gap-2
              px-4 py-2 rounded-full
              border border-[var(--color-stone-200)]
              text-[12.5px] font-medium tracking-[0.02em]
              text-[var(--color-stone-700)]
              hover:border-[var(--brand-coral)] hover:text-[var(--color-stone-900)]
              hover:bg-[var(--brand-coral-tint)]
              transition-[color,background-color,border-color] duration-300
              motion-reduce:transition-none
              focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-coral)]/30
              shrink-0
            "
          >
            <span>Tüm kategoriler</span>
            <ArrowUpRight
              size={13}
              className="
                transition-transform duration-300
                motion-reduce:transition-none
                group-hover:translate-x-[1px] group-hover:-translate-y-[1px]
                text-[var(--color-stone-500)]
                group-hover:text-[var(--brand-coral)]
              "
              aria-hidden
              strokeWidth={1.75}
            />
          </Link>
        </div>

        {/* ===========================================================
           🛡️ HORIZONTAL LUXURY SHOWCASE — gerçek overflow
           ===========================================================
           İKİ KATMANLI YAPI (user-belirtilen pattern):
             outer: overflow-x-auto + w-full (scroll viewport)
             inner: flex flex-nowrap min-w-max gap (content width
                    = sum(item widths) + gaps; viewport'tan büyük
                    → gerçek horizontal overflow)
           Tek katmanlı (flex + overflow aynı element'te) yapı bazı
           parent context'lerinde min-width hesabını boğuyordu;
           min-w-max açıkça "içerik kadar geniş ol" demek →
           overflow garantilenir.

           shrink-0: kartlar HİÇBİR breakpoint'te küçülmez/sıkışmaz.
           snap-x mandatory + snap-start: her kart viewport'a hizalı
           durur. HorizontalScroller client island wheel-to-horizontal
           davranışı ekler (boundary'de native dikey scroll devreye
           girer; user-trapping yok).
           =========================================================== */}
        <div className="relative -mx-5 md:-mx-10 lg:-mx-16">
          {/* Sağ fade — desktop'ta görünür "kaydır" sinyali */}
          <div
            aria-hidden="true"
            className="hidden md:block pointer-events-none absolute inset-y-0 right-0 w-24 lg:w-32 bg-gradient-to-l from-white via-white/70 to-transparent z-10"
          />
          <HorizontalCarousel ariaLabel="Kategoriler showcase">
            <ul
              role="list"
              className="flex flex-nowrap min-w-max gap-4 md:gap-5 lg:gap-6 px-5 md:px-10 lg:px-16 pb-4"
            >
              {items.map((item) => (
                <li
                  key={item.id}
                  className="snap-start shrink-0 w-[78vw] max-w-[320px] md:w-[320px] md:max-w-none"
                >
                  <CategoryCard item={item} />
                </li>
              ))}
              {/* Sağ spacer — son kartın fade altında kalmaması için */}
              <li
                aria-hidden="true"
                className="shrink-0 w-1 md:w-16 lg:w-24"
              />
            </ul>
          </HorizontalCarousel>
        </div>

        {/* 🛡️ FAZ 39H — Mobile CTA matches desktop ghost pill. */}
        <div className="md:hidden mt-7 flex justify-center">
          <Link
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
            <span>Tüm kategoriler</span>
            <ArrowUpRight
              size={13}
              className="text-[var(--color-stone-500)] group-hover:text-[var(--brand-coral)]"
              aria-hidden
              strokeWidth={1.75}
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ===============================================================
   CategoryCard — premium image-card (cover + overlay + title)
=============================================================== */
function CategoryCard({
  item,
  className = "",
}: {
  item: Item;
  className?: string;
}) {
  /* SEO-friendly URL: slug öncelikli, fallback UUID. */
  const token = item.slug || item.id;
  const href = `/arama?villa-turleri=${encodeURIComponent(token)}`;
  const initial = (item.name?.[0] || "·").toUpperCase();

  return (
    <Link
      href={href}
      className={
        "group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] aspect-[4/5] transition-transform duration-500 motion-reduce:transition-none hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40 " +
        className
      }
    >
      {item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt={item.name}
          fill
          /* responsive: mobile snap (78vw), tablet 1/2 col, desktop 1/4 col */
          sizes="(max-width: 768px) 78vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover object-center transition-transform duration-[900ms] ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        /* SOFT PLACEHOLDER — premium serif initial */
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
          <div className="font-display text-[88px] md:text-[104px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
            {initial}
          </div>
          <p className="mt-3 text-[10px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-400)]">
            Görsel yakında
          </p>
        </div>
      )}

      {/* CINEMATIC GRADIENT — alt yarıdan koyu, text legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/55 via-black/20 to-transparent pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/15 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 motion-reduce:transition-none"
      />

      {/* TEXT — bottom-aligned editorial */}
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[22px] md:text-[24px] leading-[1.1] text-white tracking-[-0.02em] line-clamp-2">
            {item.name}
          </h3>
          <p className="text-[11px] tracking-[0.12em] uppercase font-medium text-white/75 mt-1.5 tabular-nums">
            {item.count} villa
          </p>
        </div>
        <span
          aria-hidden="true"
          className="
            inline-flex items-center justify-center
            w-9 h-9 rounded-full
            bg-white/90 backdrop-blur-sm
            text-[var(--color-stone-900)]
            shadow-[0_2px_8px_-2px_rgb(27_26_23/0.18)]
            transition-transform duration-300 motion-reduce:transition-none
            group-hover:translate-x-0.5 group-hover:-translate-y-0.5
            shrink-0
          "
        >
          <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  );
}
