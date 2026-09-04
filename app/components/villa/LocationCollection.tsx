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

import HorizontalCarousel from "./HorizontalCarousel";

/* ===============================================================
   🛡️ LOCATION SHOWCASE — homepage "destination" carousel
   ===============================================================
   Yatay kaydırmalı "Villa Kiralama Bölgeleri" — VillaTypeCarousel'dan
   (app/components/villa/VillaTypeCarousel.tsx) BİLİNÇLİ OLARAK farklı
   kart dili kullanır (aynı carousel altyapısı, farklı kompozisyon):
     - HorizontalCarousel (app/components/villa/HorizontalCarousel.tsx,
       DEĞİŞTİRİLMEDİ) — native scroll-snap, wheel→horizontal, desktop
       showArrows, mobile native touch swipe. Yeni kütüphane YOK.
     - Kart: tüm-görsel "destination" kompozisyonu — VillaTypeCarousel'in
       görsel-üstte + beyaz-panel-altta yapısının TERSİ. aspect-[3/4]
       dikey/portre oran (VillaTypeCarousel'in aspect-[4/3] yatayının
       AKSİNE), daha geniş kartlar (240-320px aralığı, breakpoint'e göre
       artan — VillaTypeCarousel'in daralan genişlik deseninin TERSİ),
       rounded-[28px] (VillaTypeCarousel'in rounded-[18px]'inden farklı).
     - Bölge adı + villa sayısı, görselin ALTINDAKİ güçlü gradient
       overlay üzerinde büyük serif typography ile (VillaTypeCarousel'de
       metin AYRI beyaz panelde idi — burada overlay içinde).
     - Marka renkleri (#ED7926/#0973BA) SADECE villa sayısının yanındaki
       ince gradient çizgide — VillaTypeCarousel'in köşe rozet (badge
       pill) deseni KULLANILMADI, kasıtlı olarak farklı bir uygulama.
     - Server component, zero ek client JS (HorizontalCarousel hariç).

   ⚠️ GEÇMİŞ NOT (artık geçersiz): Bu component bir ara statik CSS
     grid'e (carousel'siz) düşürülmüştü. Bu revizyonla yatay carousel
     davranışı GERİ GETİRİLDİ — mevcut HorizontalCarousel altyapısı
     üzerinden, yeni bir mekanizma icat edilmeden.

   FARKLAR (CategoryCollection'a göre, veri tarafı):
     - URL param: `bolgeler` (regions canonical evrim — Faz 8)
     - Veri kaynağı: villa_locations + getCachedLocationVillaCounts
     - showArrows={true} — desktop sağ/sol navigation aktif
     - Cover fallback: location-cover yoksa SOFT PLACEHOLDER
       (kategori sistemindeki villa_type_relations fallback YOK çünkü
        bölgeler için count helper'ı sadece sayı veriyor; ileride
        gerekirse paralel cover helper eklenebilir).

   DATA (DEĞİŞMEDİ):
     getCachedVillaLocations()       → [{id, name, slug, cover_image}]
                                       (tag: taxonomy, TTL 1sa)
     getCachedLocationVillaCounts()  → { [locationId]: count }
                                       (tag: villas+taxonomy, TTL 10dk)

   FİLTRE (DEĞİŞMEDİ):
     count > 0 (aktif + deleted_at IS NULL villa içeren bölgeler).

   CLICK (DEĞİŞMEDİ):
     /arama?bolgeler=<slug | id>  (resolver UUID + slug accept eder)

   KORUNAN BEHAVIOR:
     - URL param canonical evrim (Faz 8)
     - Cache helper API'leri + revalidate tag'leri
     - filter_group_name gruplama, count toplama, token üretimi
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

        {/* DESTINATION CAROUSEL — yatay kaydırma, HorizontalCarousel
            (DEĞİŞTİRİLMEDİ) üzerinden. Kart genişlikleri breakpoint'e
            göre ARTAN (240→320px) — VillaTypeCarousel'in daralan
            deseninin tersi; portre/dikey kartlar daha az kart gösterir,
            "destination" hissini güçlendirir. */}
        <HorizontalCarousel
          showArrows
          ariaLabel="Villa kiralama bölgeleri"
          className="pb-1"
        >
          <ul role="list" className="flex flex-nowrap min-w-max gap-4 md:gap-5">
            {items.map((item) => (
              <li
                key={item.key}
                className="snap-start shrink-0 w-[260px] sm:w-[290px] md:w-[300px] lg:w-[320px]"
              >
                <LocationCard item={item} />
              </li>
            ))}
          </ul>
        </HorizontalCarousel>

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
   LocationCard — "destination showcase" kartı
   ===============================================================
   VillaTypeCard'dan (VillaTypeCarousel.tsx) BİLİNÇLİ OLARAK farklı:
   tüm-görsel kompozisyon (ayrı beyaz metin paneli YOK), dikey/portre
   aspect-[3/4] (VillaTypeCard'ın yatay aspect-[4/3]'ünün tersi),
   rounded-[28px] (VillaTypeCard'ın rounded-[18px]'inden farklı), köşe
   rozet/badge YOK — villa sayısı overlay içinde ince marka-renkli
   gradient çizgiyle birlikte. Veri/link/placeholder mantığı DEĞİŞMEDİ.
=============================================================== */
function LocationCard({ item }: { item: Item }) {
  /* Grup üyelerinin token'ları (slug|id) virgülle; /arama çoklu değeri
     `regionsRaw.split(",")` ile parse edip `.in("location_id", …)` uygular. */
  const href = `/arama?bolgeler=${encodeURIComponent(item.token)}`;
  const initial = (item.key?.[0] || "·").toUpperCase();

  return (
    <Link
      href={href}
      className="group relative block overflow-hidden rounded-[28px] bg-gradient-to-br from-[var(--color-sand-100)] via-[var(--color-sand-50)] to-[var(--color-sand-100)] aspect-[3/4] shadow-[0_14px_34px_-20px_rgba(11,31,58,0.3)] hover:shadow-[0_28px_56px_-22px_rgba(11,31,58,0.4)] transition-[transform,box-shadow] duration-500 motion-reduce:transition-none hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0973BA]/40 focus-visible:ring-offset-2"
    >
      {item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt={item.key}
          fill
          sizes="(max-width: 640px) 260px, (max-width: 768px) 290px, (max-width: 1024px) 300px, 320px"
          className="object-cover object-center transition-transform duration-[900ms] ease-out group-hover:scale-[1.08] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        /* SOFT PLACEHOLDER — serif initial (davranış korunuyor) */
        <div className="absolute inset-0 flex items-center justify-center select-none">
          <div className="font-display text-[56px] md:text-[72px] leading-none text-[var(--color-stone-300)] tracking-[-0.03em]">
            {initial}
          </div>
        </div>
      )}

      {/* DARK BOTTOM GRADIENT — VillaTypeCard'dan daha güçlü/daha uzun
          (destination poster hissi); hover'da biraz daha koyulaşır. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black/85 via-black/35 to-transparent transition-opacity duration-500 motion-reduce:transition-none group-hover:opacity-95 pointer-events-none"
      />

      {/* TEXT — alt-sol: büyük premium serif başlık + ince marka-renkli
          gradient çizgi + villa sayısı (rozet/badge YOK, kasıtlı). */}
      <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
        <h3 className="font-display text-[21px] md:text-[25px] leading-[1.1] text-white tracking-[-0.02em] line-clamp-2 drop-shadow-[0_2px_6px_rgba(0,0,0,0.4)]">
          {item.key}
        </h3>
        <div className="mt-2.5 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-[3px] w-6 rounded-full bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
          />
          <span className="text-[11px] tracking-[0.1em] uppercase font-medium text-white/85 tabular-nums">
            {item.count} villa
          </span>
        </div>
      </div>
    </Link>
  );
}
