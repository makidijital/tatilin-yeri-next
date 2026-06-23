import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";

import {
  getCachedVillaLocations,
  getCachedLocationVillaCounts,
} from "@/lib/cache.helpers";
import { getLocationCoverPublicUrl } from "@/lib/storage.helpers";
import HorizontalCarousel from "@/app/components/villa/HorizontalCarousel";

/* ===============================================================
   🛡️ LOCATION SHOWCASE — homepage premium editorial carousel
   ===============================================================
   CategoryCollection ile birebir paralel mimari:
     - Tek satır horizontal showcase (HorizontalCarousel client island)
     - Editorial header (eyebrow + serif headline)
     - aspect-[4/5] kartlar + gradient overlay + hover scale
     - next/image (WebP/AVIF auto, responsive srcSet)
     - Server component, zero ek client JS (HorizontalCarousel hariç)

   FARKLAR:
     - URL param: `bolgeler` (regions canonical evrim — Faz 8)
     - Veri kaynağı: villa_locations + getCachedLocationVillaCounts
     - showArrows={true} — desktop sağ/sol navigation aktif
     - Cover fallback: location-cover yoksa SOFT PLACEHOLDER
       (kategori sistemindeki villa_type_relations fallback YOK çünkü
        bölgeler için count helper'ı sadece sayı veriyor; ileride
        gerekirse paralel cover helper eklenebilir).

   DATA:
     getCachedVillaLocations()       → [{id, name, slug, cover_image}]
                                       (tag: taxonomy, TTL 1sa)
     getCachedLocationVillaCounts()  → { [locationId]: count }
                                       (tag: villas+taxonomy, TTL 10dk)

   FİLTRE:
     count > 0 (aktif + deleted_at IS NULL villa içeren bölgeler).

   CLICK:
     /arama?bolgeler=<slug | id>  (resolver UUID + slug accept eder)

   KORUNAN BEHAVIOR:
     - URL param canonical evrim (Faz 8)
     - Cache helper API'leri + revalidate tag'leri
     - Reservation, pricing, availability — sıfır dokunuş
   =============================================================== */

type Item = {
  /** Grup anahtarı = filter_group_name ?? name (kart başlığı + react key). */
  key: string;
  /** Gruptaki tüm lokasyonların villa sayısı toplamı. */
  count: number;
  /** cover_image'i olan ilk grup üyesinin cover URL'i. */
  coverUrl: string | null;
  /** Grup üyelerinin slug|id token'ları, /arama?bolgeler= için virgülle birleşik. */
  token: string;
};

export default async function LocationCollection() {
  const [locations, counts] = await Promise.all([
    getCachedVillaLocations(),
    getCachedLocationVillaCounts(),
  ]);

  if (!locations?.length) return null;

  /* 🛡️ GRUPLAMA — group key = filter_group_name ?? name.
     Alt bölgeler (ör. "Kalkan / Üzümlü", "Kalkan / Çavdır") tek "Kalkan"
     kartında birleşir. Veri kaynağı / cache / helper DEĞİŞMEDİ; gruplama
     yalnız bu render katmanında. Map insertion order = query order
     (name ASC) → kartlar deterministik sırada. */
  const groups = new Map<
    string,
    {
      count: number;
      coverUrl: string | null;
      tokens: string[];
      /* Plan A — grup-kökü (name === filter_group_name) slug/id token'ı.
         Varsa /arama'ya TEK token gider (ör. "kalkan"); /arama'daki
         expandedRegions kökü tüm alt bölgelere genişletir, sidebar yalnız
         "Tüm Kalkan"ı seçili gösterir. */
      rootToken: string | null;
    }
  >();

  for (const l of locations) {
    const lid = String(l.id);
    const name = String(l.name || "").trim();
    const rawGroup = (l as { filter_group_name?: string | null })
      .filter_group_name;
    const groupTrim =
      typeof rawGroup === "string" ? rawGroup.trim() : "";
    const key = groupTrim.length > 0 ? groupTrim : name;
    if (!key) continue;

    const rawSlug = (l as { slug?: string | null }).slug;
    const token =
      typeof rawSlug === "string" && rawSlug.trim().length > 0
        ? rawSlug.trim()
        : lid;
    const cover = getLocationCoverPublicUrl(
      (l as { cover_image?: string | null }).cover_image
    );

    const g =
      groups.get(key) ?? {
        count: 0,
        coverUrl: null,
        tokens: [],
        rootToken: null,
      };
    g.count += counts[lid] ?? 0;
    if (!g.coverUrl && cover) g.coverUrl = cover; // cover_image olan ilk kayıt
    g.tokens.push(token);
    /* Grup-kökü tespiti: name === filter_group_name → token'ı kökün slug'ı. */
    if (!g.rootToken && groupTrim.length > 0 && name === groupTrim) {
      g.rootToken = token;
    }
    groups.set(key, g);
  }

  const items: Item[] = Array.from(groups.entries())
    .map(([key, g]) => ({
      key,
      count: g.count,
      coverUrl: g.coverUrl,
      /* Kök varsa TEK token (ör. "kalkan"); yoksa eski çoklu-token fallback. */
      token: g.rootToken ?? g.tokens.join(","),
    }))
    .filter((item) => item.count > 0);

  if (!items.length) return null;

  return (
    <section
      aria-label="Bölgeler"
      className="px-5 md:px-10 lg:px-16 pt-14 md:pt-20 pb-4 md:pb-10"
    >
      <div className="max-w-[1280px] mx-auto">
        {/* 🛡️ FAZ 39M — Normalized section header (CategoryCollection parity). */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 md:gap-10 mb-8 md:mb-12">
          <div className="max-w-xl">
            <p className="text-[10.5px] tracking-[0.28em] uppercase font-medium inline-flex items-center text-[var(--brand-coral)]">
              <span
                aria-hidden="true"
                className="inline-block w-6 h-px align-middle mr-3 bg-[var(--brand-coral)]/60"
              />
              Bölgeler
            </p>
            <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] mt-3 leading-tight tracking-[-0.02em]">
              Bölgeye göre keşfedin.
            </h2>
            <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md">
              Akdeniz koylarında özenle seçilmiş bölgeler.
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
            <span>Tüm bölgeler</span>
            <span
              aria-hidden="true"
              className="text-[var(--color-stone-500)] group-hover:text-[var(--brand-coral)] transition-colors"
            >
              →
            </span>
          </Link>
        </div>

        {/* HORIZONTAL CAROUSEL — arrows enabled (desktop only) */}
        <div className="relative -mx-5 md:-mx-10 lg:-mx-16">
          <div
            aria-hidden="true"
            className="hidden md:block pointer-events-none absolute inset-y-0 right-0 w-24 lg:w-32 bg-gradient-to-l from-white via-white/70 to-transparent z-10"
          />
          <HorizontalCarousel
            ariaLabel="Bölgeler showcase"
            showArrows
          >
            <ul
              role="list"
              className="flex flex-nowrap min-w-max gap-4 md:gap-5 lg:gap-6 px-5 md:px-10 lg:px-16 pb-4"
            >
              {items.map((item) => (
                <li
                  key={item.key}
                  className="snap-start shrink-0 w-[78vw] max-w-[320px] md:w-[320px] md:max-w-none"
                >
                  <LocationCard item={item} />
                </li>
              ))}
              <li
                aria-hidden="true"
                className="shrink-0 w-1 md:w-16 lg:w-24"
              />
            </ul>
          </HorizontalCarousel>
        </div>

        {/* 🛡️ FAZ 39M — Mobile CTA pill (CategoryCollection parity). */}
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
            <span>Tüm bölgeler</span>
            <span
              aria-hidden="true"
              className="text-[var(--color-stone-500)] group-hover:text-[var(--brand-coral)]"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ===============================================================
   LocationCard — premium image-card (CategoryCard paraleli)
=============================================================== */
function LocationCard({ item }: { item: Item }) {
  /* Grup üyelerinin token'ları (slug|id) virgülle; /arama çoklu değeri
     `regionsRaw.split(",")` ile parse edip `.in("location_id", …)` uygular. */
  const href = `/arama?bolgeler=${encodeURIComponent(item.token)}`;
  const initial = (item.key?.[0] || "·").toUpperCase();

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] aspect-[4/5] transition-transform duration-500 motion-reduce:transition-none hover:-translate-y-[2px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
    >
      {item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt={item.key}
          fill
          sizes="(max-width: 768px) 78vw, 320px"
          className="object-cover object-center transition-transform duration-[900ms] ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        /* SOFT PLACEHOLDER — serif initial, premium fallback */
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none">
          <div className="font-display text-[88px] md:text-[104px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
            {initial}
          </div>
          <p className="mt-3 text-[10px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-400)]">
            Görsel yakında
          </p>
        </div>
      )}

      {/* CINEMATIC GRADIENT — text legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/55 via-black/20 to-transparent pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/15 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500 motion-reduce:transition-none"
      />

      {/* TEXT */}
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-[22px] md:text-[24px] leading-[1.1] text-white tracking-[-0.02em] line-clamp-2">
            {item.key}
          </h3>
          <p className="text-[11px] tracking-[0.12em] uppercase font-medium text-white/75 mt-1.5 tabular-nums">
            {item.count} villa
          </p>
        </div>
        <span
          aria-hidden="true"
          className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm text-[var(--color-stone-900)] shadow-[0_2px_8px_-2px_rgb(27_26_23/0.18)] transition-transform duration-300 motion-reduce:transition-none group-hover:translate-x-0.5 group-hover:-translate-y-0.5 shrink-0"
        >
          <ArrowUpRight size={15} />
        </span>
      </div>
    </Link>
  );
}
