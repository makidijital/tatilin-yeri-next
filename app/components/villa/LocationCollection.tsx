import Link from "next/link";
import Image from "next/image";

import {
  getCachedVillaLocations,
  getCachedLocationVillaCounts,
} from "@/lib/cache.helpers";
import {
  getLocationCoverPublicUrl,
  appendAssetVersion,
} from "@/lib/storage.helpers";

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
    /* 🛡️ cover_v cache-bust — deterministik path overwrite → URL
       değişmez → CDN stale. revalidateTaxonomy rebuild → yeni token →
       anında fresh. (bkz. storage.helpers > appendAssetVersion). */
    const cover = appendAssetVersion(
      getLocationCoverPublicUrl(
        (l as { cover_image?: string | null }).cover_image
      ),
      (l as { cover_v?: number }).cover_v
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
        <div className="text-center mb-8 md:mb-12">
          <h2 className="font-display font-medium text-[22px] md:text-[26px] text-[var(--color-stone-900)] leading-tight tracking-[-0.02em]">
            Villa Kiralama Bölgeleri
          </h2>
          <p className="mt-3 text-[14px] leading-relaxed text-[var(--color-stone-500)] max-w-md mx-auto">
            Özenle seçilmiş bölgeler
          </p>
        </div>

        {/* COMPACT REGION GRID — carousel kaldırıldı (modern kompakt grid).
            Desktop 4 kolon · tablet/mobile 2 kolon · lg:4. */}
        <ul
          role="list"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4"
        >
          {items.map((item) => (
            <li key={item.key}>
              <LocationCard item={item} />
            </li>
          ))}
        </ul>

        {/* 🛡️ CTA — grid altında, tüm ekranlarda centered (header'dan taşındı). */}
        <div className="mt-9 md:mt-10 flex justify-center">
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
      className="group relative block overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] aspect-[4/5] shadow-[0_10px_26px_-16px_rgba(11,31,58,0.25)] hover:shadow-[0_22px_42px_-20px_rgba(11,31,58,0.35)] transition-[transform,box-shadow] duration-500 motion-reduce:transition-none hover:-translate-y-[3px] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-champagne-500)]/40"
    >
      {item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt={item.key}
          fill
          sizes="(max-width: 1024px) 50vw, 25vw"
          className="object-cover object-center transition-transform duration-[900ms] ease-out group-hover:scale-[1.06] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        /* SOFT PLACEHOLDER — serif initial (compact) */
        <div className="absolute inset-0 flex items-center justify-center select-none">
          <div className="font-display text-[56px] md:text-[72px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
            {initial}
          </div>
        </div>
      )}

      {/* DARK BOTTOM GRADIENT — text legibility */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/72 via-black/28 to-transparent pointer-events-none"
      />

      {/* TEXT — alt-sol: bölge adı (bold white) + villa sayısı */}
      <div className="absolute inset-x-0 bottom-0 p-4">
        <h3 className="font-display text-[16px] md:text-[18px] leading-[1.12] text-white tracking-[-0.015em] line-clamp-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
          {item.key}
        </h3>
        <p className="text-[10.5px] tracking-[0.1em] uppercase font-medium text-white/80 mt-1 tabular-nums">
          {item.count} villa
        </p>
      </div>
    </Link>
  );
}
