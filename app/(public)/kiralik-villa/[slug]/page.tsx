import type { Metadata } from "next";
import { cache } from "react";
import {
  MapPin,
  /* Users / Bed / Bath VillaInfoBar içinde kullanılıyor; bu sayfanın
     eski duplicate header'ı silindiği için burada gerek yok. */
  Waves,
  Check,
  ExternalLink,
  /* 🛡️ FAZ 19 — distance icon mapping */
  UtensilsCrossed,
  ShoppingBag,
  Plane,
  Bus,
  Building2,
  Cross,
  Fuel,
  GraduationCap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import {
  getDistanceIconKey,
  type DistanceIconKey,
} from "@/lib/distance.helper";

/* 🛡️ FAZ 19 — Distance icon key → lucide component map.
   `lib/distance.helper > getDistanceIconKey` saf string döner;
   React/DOM bağımlılığı yok (SSR-safe). Burada renderer'da map
   ile lucide component'e çevrilir. Bilinmeyen title → "pin" (MapPin
   fallback). Bu yapı ileride başka public page'lerden de reuse
   edilebilir (helper key → bu sayfanın map'i).

   IconMap'i page-local tuttuk çünkü:
     - lucide import'ları büyük bundle parçası; sadece bu sayfada
       kullanılıyor (tree-shake friendly).
     - Generic component-level mapping page-level concerns. */
const DISTANCE_ICON_MAP: Record<DistanceIconKey, LucideIcon> = {
  restaurant: UtensilsCrossed,
  store: ShoppingBag,
  waves: Waves,
  plane: Plane,
  bus: Bus,
  building: Building2,
  cross: Cross,
  fuel: Fuel,
  school: GraduationCap,
  pin: MapPin,
};

import PriceList from "@/app/components/villa/PriceList";
import CollapsibleDescription from "@/app/components/villa/CollapsibleDescription";
import AccommodationLayout from "@/app/components/villa/AccommodationLayout";
import CheckInOutTimes from "@/app/components/villa/CheckInOutTimes";

import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import {
  resolveVillaImageUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
/* 🛡️ Rich text — render'da XSS-güvenli HTML; SEO meta/JSON-LD'de düz metin. */
import { sanitizeHtml, stripHtml } from "@/lib/html-sanitize";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaFeaturesByVilla } from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
/* 🛡️ FAZ 33 — Villa reviews + global settings (cached).
   getCachedSettings, getPublicSettings'i (get_public_settings RPC)
   sarmalayan unstable_cache helper'ı; dönen shape birebir aynı,
   admin invalidation ("settings" tag) korunur. */
import {
  getCachedSettings,
  getCachedVillaReviews,
  getCachedVillaReviewStats,
} from "@/lib/cache.helpers";
import VillaReviewsSection from "@/app/components/villa/VillaReviewsSection";
/* 🛡️ Full-width "Beğenebileceğiniz Diğer Villalar" — additive, yorumlardan
   sonra/footer'dan önce. Kendi verisini çeker (max 2 query). */
import SimilarVillasSection from "@/app/components/villa/SimilarVillasSection";
/* 🛡️ FAZ 36 — Favorite CTA (guest, localStorage only) */
import FavoriteButton from "@/app/components/favorites/FavoriteButton";

import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";

import Gallery from "@/app/components/villa/Gallery";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import MobileBookingCta from "@/app/components/villa/MobileBookingCta";
/* 🛡️ Villa info bar — gallery'nin ÜSTÜNDE ayrı premium başlık şeridi
   (villa adı + lokasyon + bilgi pill'leri + video CTA).
   Fotoğraf üstüne ASLA overlay YAPMAZ; ayrı container.
   Video CTA mevcut VillaVideoModal'ı tetikler (modal logic dokunulmadı). */
import VillaInfoBar from "@/app/components/villa/VillaInfoBar";
import VillaDetailTabs from "@/app/components/villa/VillaDetailTabs";
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
/* 🛡️ Soft social-proof — client-only, hydration-safe (kendi useEffect
   ile mount sonrası random sayı set eder; SSR'da DOM'a hiçbir şey
   eklemez). Engine / pricing / availability / reservation flow ile
   ZERO etkileşim. */

/* 🛡️ FAZ 56H-B/C — External iCal availability arrays.
   Server-side service-role fetch (RLS authenticated-only).
   Yalnız date range string'leri döner (PII yok). Client component'lar
   `externalStringsToDateArrays` ile Date[]'e parse eder ve mevcut
   reservation/manual array'leriyle birleştirir. */
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
} from "@/lib/external-calendar.public.helper";

import {
  JsonLd,
  buildBreadcrumb,
  buildVacationRental,
} from "@/app/components/seo/StructuredData";

import { isValidYmd } from "@/lib/availability.helper";
import { formatPoolDimension } from "@/lib/dimension.helper";

type Feature = {
  id: string;
  name: string;
};

/* ============================================================
   🔥 SEO METADATA
   ============================================================
   - title fallback: villa.title
   - description fallback: villa.description'dan kısa excerpt
   - robots: villa.noindex true ise noindex,nofollow; aksi index,follow
   - OpenGraph image: villa kapak görseli
   ============================================================ */
function makeExcerpt(text: string | undefined, max = 160) {
  const clean = (text || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

/* ⚡ PERF — getVillaBySlug request-scoped dedupe.
   generateMetadata + page aynı request içinde aynı villayı çağırır;
   React cache() ile TEK DB sorgusu paylaşılır. Dönen DTO, null/404
   davranışı ve mapVilla çıktısı BİREBİR aynı (yalnız memoize katmanı). */
const getVillaBySlugCached = cache((slug: string) => getVillaBySlug(slug));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const villa = await getVillaBySlugCached(slug);

  if (!villa) {
    return {
      title: "Villa bulunamadı",
      robots: { index: false, follow: false },
    };
  }

  const title =
    (villa.seo_title && villa.seo_title.trim()) ||
    villa.title ||
    "Villa";

  const description =
    (villa.seo_description && villa.seo_description.trim()) ||
    makeExcerpt(stripHtml(villa.description), 160);

  // OG: kapak görseli (mapVilla images sıralaması is_cover öncelikli)
  const cover =
    villa.images && villa.images.length > 0
      ? villa.images[0]
      : undefined;

  const robots = villa.noindex
    ? { index: false, follow: false }
    : { index: true, follow: true };

  return {
    title,
    description,
    robots,
    /* 🛡️ CANONICAL — villanın KENDİ slug'ı (requested slug değil) →
       query param (?utm/?ref) ve alternatif slug varyasyonları tek
       kanonik URL'de toplanır; duplicate riski kapanır. metadataBase
       ile absolute'a çözülür. */
    alternates: {
      canonical: `/kiralik-villa/${villa.slug || slug}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
      ...(cover ? { images: [{ url: cover }] } : {}),
    },
    twitter: {
      card: cover ? "summary_large_image" : "summary",
      title,
      description,
      ...(cover ? { images: [cover] } : {}),
    },
  };
}

export default async function VillaDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  /* 🛡️ DATE CONTINUITY — /arama → detail geçişinde URL ile
     taşınan giriş/çıkış tarihleri. BookingSidebar'a initialStart
     /initialEnd olarak iletilir; refresh-safe (URL source-of-truth).
     Geçersiz/eksikse BookingSidebar boş state ile açılır (eski davranış). */
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
}) {
  const { slug } = await params;

  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  /* start < end değilse defensive olarak ikisini de düşür (Hero
     formatDate ve /arama sayfası aynı string-level lexicographic
     compare kullanıyor → drift yok). */
  const hasInitialRange =
    !!initialStart && !!initialEnd && initialStart < initialEnd;

  const villa = await getVillaBySlugCached(slug);

  if (!villa) {
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">404</p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          Villa bulunamadı
        </h2>
        <p className="text-[var(--color-stone-500)] mt-3">
          Aradığın villa kaldırılmış veya taşınmış olabilir.
        </p>
        <a href="/arama" className="btn-ghost mt-6 inline-flex">
          Tüm villalara dön
        </a>
      </section>
    );
  }

  /* 🛡️ YouTube videos — VillaDTO.youtube_videos zaten normalize edilmiş
     (villa.service > mapVilla). Defansif olarak parent component-side
     bir kez daha normalize edilir; backward-compat (DTO field eksikse).
     Saf sync map; villa.id'ye bağlı değil. */
  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  /* ⚡ PERF — villa yüklendikten sonra çalışan TÜM bağımsız okumalar
     tek paralel dalgada toplandı (önceki sıralı await zinciri yerine).
     Veri çıktıları, sıralama ve fallback davranışı BİREBİR korunur:
       • images/prices/distances/features/rules/priceIncludes: aynı
         servisler, aynı argüman (villa.id), aynı sonuç sırası.
       • externalBlocks: helper fail-safe + .catch() ile eski try/catch
         davranışı aynen (hata → EMPTY_EXTERNAL_STRING_ARRAYS).
       • settings: getCachedSettings (getPublicSettings sarmalayıcısı) —
         watermark/logo/footer alanları ve admin invalidation korunur.
       • reviews/reviewStats: zaten cached; aynı "villa-reviews" tag. */
  const [
    images,
    prices,
    distances,
    features,
    rules,
    priceIncludes,
    externalBlocks,
    settings,
    reviews,
    reviewStats,
  ] = await Promise.all([
    getVillaImages(villa.id),
    getVillaPrices(villa.id),
    getVillaDistances(villa.id),
    getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
    getRuleItemsByVilla(villa.id),
    getPriceIncludeItemsByVilla(villa.id),
    fetchExternalCalendarStringsForVilla(villa.id).catch(
      () => EMPTY_EXTERNAL_STRING_ARRAYS
    ),
    getCachedSettings(),
    getCachedVillaReviews(villa.id),
    getCachedVillaReviewStats(villa.id),
  ]);
  const watermark = {
    /* 🛡️ Watermark logo, diğer site-asset'ler (site_logo/footer_logo/hero/
       favicon) ile AYNI şekilde resolveAssetUrl'den geçer: bucket-relative
       path → R2/CDN public URL; legacy full URL pass-through. Ham path
       <img src>'e gidip relative çözülünce 404 oluyordu (watermark görünmüyor). */
    logo:
      resolveAssetUrlVersioned(
        settings?.watermark_logo,
        settings?.updated_at
      ) ?? null,
    enabled: settings?.watermark_enabled ?? false,
    opacity: settings?.watermark_opacity ?? 0.15,
    position: settings?.watermark_position ?? "center",
    size: settings?.watermark_size ?? 25,
  } as const;

  /* 🛡️ Bucket-fix — resolveVillaImageUrl: image_url HEM FULL URL (legacy)
     HEM relative path (Phase B sonrası) olabilir. villa-images bucket'ından
     doğru URL üretir. Ham path Gallery component'ine veya JSON-LD'ye
     gitmesin. */
  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  /* 🛡️ JSON-LD structured data — SEO için fonksiyonel kazanç.
     Fake rating/aggregateRating üretilmez; yalnız var olan villa
     verisinden VacationRental + BreadcrumbList markup'ı çıkarılır. */
  const minPrice = prices?.length
    ? prices.reduce(
        (acc, p) =>
          p.price > 0 && (acc === null || p.price < acc.price)
            ? { price: Number(p.price), currency: p.currency || "TRY" }
            : acc,
        null as { price: number; currency: string } | null
      )
    : null;

  const vacationRentalLd = buildVacationRental({
    slug: villa.slug || slug,
    title: villa.title,
    description: stripHtml(villa.description),
    images: imageUrls,
    locationName: villa.location || null,
    latitude:
      typeof villa.latitude === "number" ? villa.latitude : null,
    longitude:
      typeof villa.longitude === "number" ? villa.longitude : null,
    guests: villa.guests,
    bedrooms: villa.bedrooms,
    bathrooms: villa.bathrooms,
    features: features.map((f) => f.name).filter(Boolean),
    priceFrom: minPrice
      ? { amount: minPrice.price, currency: minPrice.currency }
      : null,
    /* 🛡️ FAZ 33 — AggregateRating (SEO).
       Yalnız approved review varsa (count > 0) JSON-LD'ye gömülür.
       Fake / placeholder ÜRETİLMEZ; stats service approved-only
       hesaplar. */
    aggregateRating:
      reviewStats.count > 0
        ? {
            ratingValue: reviewStats.average,
            reviewCount: reviewStats.count,
          }
        : null,
  });

  const breadcrumbLd = buildBreadcrumb([
    { name: "Ana sayfa", url: "/" },
    { name: "Villalar", url: "/arama" },
    { name: villa.title },
  ]);

  return (
    <>
    <div className="px-5 md:px-10 lg:px-16 pt-28 md:pt-40 pb-24 md:pb-32">
      <div className="max-w-[1280px] mx-auto">
        {/* SEO — JSON-LD structured data */}
        <JsonLd data={vacationRentalLd} />
        <JsonLd data={breadcrumbLd} />

        {/* ════════════════════════════════════════════════════
            🛡️ EDITORIAL HEADER kaldırıldı — duplicate cleanup.
            ════════════════════════════════════════════════════
            Villa adı + lokasyon + guests/bedrooms/bathrooms info'ları
            artık `VillaInfoBar` içinde (Gallery üstünde). FavoriteButton
            InfoBar'ın `actions` slot'una taşındı; favorite logic
            (variant="detail" davranışı, useFavorites hook) DOKUNULMADI,
            yalnız DOM konumu değişti.
            ──────────────────────────────────────────────────── */}

      {/* ═══ GALLERY HERO — full container width (sayfanın ana hero'su).
          Lightbox/click davranışı AYNEN; yalnız DOM konumu yukarı + geniş. */}
      <div className="rounded-3xl overflow-hidden ring-1 ring-[var(--color-stone-100)]">
        {/* 🛡️ SEO + a11y: villa.title → alt text auto-generation. */}
        <Gallery
          images={imageUrls}
          watermark={watermark}
          villaTitle={villa.title}
        />
      </div>

      {/* ═══ VILLA INFO ROW — gallery altı, full-width premium info bar.
          VillaInfoBar iç layout + FavoriteButton logic AYNEN; konum değişti. */}
      <div className="mt-6 md:mt-8 mb-10 md:mb-12">
        <VillaInfoBar
          villaTitle={villa.title}
          location={villa.location}
          guests={villa.guests}
          bedrooms={villa.bedrooms}
          bathrooms={villa.bathrooms}
          tourismDocumentNumber={villa.tourism_document_number}
          videos={youtubeVideos}
          actions={<FavoriteButton villaId={villa.id} variant="icon" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        {/* LEFT */}
        <div className="lg:col-span-2 space-y-12">
          {/* DESCRIPTION */}
          <section>
            <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
              Villa hakkında
            </h2>
            {villa.description && villa.description.trim() ? (
              <CollapsibleDescription
                html={sanitizeHtml(villa.description)}
                collapsible={stripHtml(villa.description).trim().length > 280}
              />
            ) : (
              <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
                <span className="italic text-[var(--color-stone-400)]">
                  Açıklama bulunmuyor
                </span>
              </div>
            )}
          </section>

          {/* 🛡️ TAB BAND — açıklama altı tab-content switching (tek aktif
              panel). 4 section buraya TAŞINDI (duplicate yok); içerik +
              logic AYNEN, yalnız DOM konumu + görünürlük değişti. */}
          <VillaDetailTabs
            fiyatlar={
              <section>
                <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em] mb-4">
                  Sezon Fiyatları
                </h2>
                {prices.length === 0 ? (
                  <p className="text-[var(--color-stone-400)] text-sm italic">
                    Fiyat bilgisi yok
                  </p>
                ) : (
                  <PriceList
                    prices={prices}
                    minimumStayNights={villa.minimum_stay_nights ?? null}
                  />
                )}
              </section>
            }
            musaitlik={
              <section>
                <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                  Takvim
                </h2>
                <div className="mt-5 overflow-x-auto">
                  <AvailabilityInlineCalendar
                    villaId={villa.id}
                    prices={prices}
                    externalBlocks={externalBlocks}
                  />
                </div>
              </section>
            }
            konum={
              <div className="space-y-10">
              {/* Yakındaki Noktalar (Mesafeler) — Konum panelinde, haritanın ÜSTÜNDE. */}
              <section>
                <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em] mb-4">
                  Yakındaki Noktalar
                </h2>
                {distances.length === 0 ? (
                  <p className="text-[var(--color-stone-400)] text-sm italic">
                    Bilgi yok
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-3.5">
                    {distances.map((d, i) => {
                      const iconKey: DistanceIconKey = getDistanceIconKey(
                        d.title
                      );
                      const IconCmp: LucideIcon = DISTANCE_ICON_MAP[iconKey];
                      return (
                        <div
                          key={i}
                          className="
                            group relative overflow-hidden
                            rounded-2xl
                            bg-gradient-to-br from-[#0B1F3A] to-[#132A46]
                            border border-white/10
                            px-4 py-4 md:px-5 md:py-[18px]
                            shadow-[0_12px_30px_-18px_rgba(11,31,58,0.5)]
                            hover:-translate-y-0.5 hover:border-[var(--color-champagne-400)]/55
                            hover:shadow-[0_18px_38px_-20px_rgba(11,31,58,0.55)]
                            transition-[transform,box-shadow,border-color] duration-300
                            motion-reduce:transition-none motion-reduce:hover:translate-y-0
                            flex items-center gap-3.5
                          "
                        >
                          {/* Hover glow accent — turquoise, subtle */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute -top-10 -right-8 w-28 h-28 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                            style={{
                              background:
                                "radial-gradient(circle, rgba(2, 170, 229,0.25), transparent 70%)",
                            }}
                          />
                          <span className="relative w-9 h-9 shrink-0 rounded-xl bg-white/[0.06] ring-1 ring-inset ring-white/10 text-[var(--color-champagne-300)] flex items-center justify-center">
                            <IconCmp size={15} strokeWidth={1.75} />
                          </span>
                          <div className="relative min-w-0 flex-1 flex items-center justify-between gap-3">
                            <p className="text-[13px] md:text-[13.5px] font-medium text-white/65 truncate tracking-[-0.005em]">
                              {d.title}
                            </p>
                            <p
                              className="font-display text-[15px] md:text-[16px] text-white shrink-0 tracking-[-0.01em]"
                              style={{ fontVariantNumeric: "tabular-nums" }}
                            >
                              {d.distance}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section>
                <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                  Nerede?
                </h2>
                <div className="card-premium mt-5 overflow-hidden">
                  {villa.map_type === "coords" &&
                    villa.latitude &&
                    villa.longitude && (
                      <>
                        <iframe
                          src={`https://www.google.com/maps?q=${villa.latitude},${villa.longitude}&hl=tr&z=14&output=embed`}
                          className="w-full h-[400px] border-0"
                          loading="lazy"
                        />
                        <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] flex justify-between items-center text-sm">
                          <span className="text-[var(--color-stone-500)]">
                            Yaklaşık konum gösterilmektedir
                          </span>
                          <a
                            href={`https://www.google.com/maps?q=${villa.latitude},${villa.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[var(--color-champagne-700)] font-medium hover:underline inline-flex items-center gap-1"
                          >
                            Google Maps&apos;te aç
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </>
                    )}

                  {villa.map_type === "iframe" && villa.map_embed && (
                    <>
                      <div
                        className="w-full h-[400px]"
                        dangerouslySetInnerHTML={{ __html: villa.map_embed }}
                      />
                      <div className="p-4 md:px-5 border-t border-[var(--color-stone-100)] text-sm text-[var(--color-stone-500)]">
                        Harita Google Maps üzerinden sağlanmaktadır
                      </div>
                    </>
                  )}

                  {(!villa.map_type ||
                    (villa.map_type === "coords" &&
                      (!villa.latitude || !villa.longitude)) ||
                    (villa.map_type === "iframe" && !villa.map_embed)) && (
                      <div className="h-[200px] flex items-center justify-center text-[var(--color-stone-400)] italic">
                        Konum bilgisi bulunamadı
                      </div>
                    )}
                </div>
              </section>
              </div>
            }
            ozellikler={
              <section>
                <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                  Ne sunuyor?
                </h2>

                {features.length === 0 ? (
                  <div className="card-premium mt-5 p-6 text-sm text-[var(--color-stone-400)] italic">
                    Özellik bilgisi bulunmuyor
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
                    {features.map((f) => (
                      <div
                        key={f.id}
                        className="
                          flex items-center gap-2.5
                          text-[var(--color-stone-700)]
                          bg-white border border-[var(--color-stone-100)]
                          rounded-xl px-4 py-3 text-sm
                          hover:border-[var(--color-champagne-300)] hover:shadow-soft
                          transition
                        "
                      >
                        <span className="w-5 h-5 rounded-full bg-[var(--color-sand-100)] flex items-center justify-center shrink-0">
                          <Check size={12} className="text-[var(--color-champagne-600)]" />
                        </span>
                        {f.name}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            }
            havuz={
              (villa.pool_type !== "yok" ||
                villa.indoor_pool ||
                villa.child_pool) &&
              (() => {
                type PoolCard = {
                  key: string;
                  label: string;
                  width: string | null | undefined;
                  length: string | null | undefined;
                  depth: string | null | undefined;
                };
                const cards: PoolCard[] = [];
                if (villa.pool_type && villa.pool_type !== "yok") {
                  cards.push({
                    key: "main",
                    label:
                      villa.pool_type === "ozel"
                        ? "Özel Havuz"
                        : "Ortak Havuz",
                    width: villa.pool_width,
                    length: villa.pool_length,
                    depth: villa.pool_depth,
                  });
                }
                if (villa.indoor_pool) {
                  cards.push({
                    key: "indoor",
                    label: "Kapalı Havuz",
                    width: villa.indoor_pool_width,
                    length: villa.indoor_pool_length,
                    depth: villa.indoor_pool_depth,
                  });
                }
                if (villa.child_pool) {
                  cards.push({
                    key: "child",
                    label: "Çocuk Havuzu",
                    width: villa.child_pool_width,
                    length: villa.child_pool_length,
                    depth: villa.child_pool_depth,
                  });
                }
                if (cards.length === 0) return null;
                return (
                  <section>
                    <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em] mb-4">
                      Havuz Bilgileri
                    </h2>
                    {/* SINGLE PREMIUM CONCIERGE PANEL — beige luxury,
                        her havuz bir blok; attribute'lar satır + divider. */}
                    <div className="rounded-3xl border border-[var(--color-stone-100)] bg-gradient-to-br from-[var(--color-sand-50)]/70 via-white to-white shadow-[0_12px_30px_-18px_rgba(11,31,58,0.18)] overflow-hidden">
                      {cards.map((c, idx) => {
                        const hasDims = !!(c.width || c.length || c.depth);
                        const rows = [
                          { k: "Genişlik", v: formatPoolDimension(c.width) },
                          { k: "Uzunluk", v: formatPoolDimension(c.length) },
                          { k: "Derinlik", v: formatPoolDimension(c.depth) },
                        ];
                        return (
                          <div
                            key={c.key}
                            className={
                              idx > 0
                                ? "border-t border-[var(--color-stone-100)]"
                                : ""
                            }
                          >
                            {/* POOL LABEL — blok başlığı */}
                            <div className="flex items-center gap-2 px-5 py-3.5 md:px-6 bg-white/45">
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-champagne-500)]"
                                aria-hidden
                              />
                              <p className="font-display text-[15px] md:text-[16px] text-[var(--color-stone-900)] tracking-[-0.01em]">
                                {c.label}
                              </p>
                            </div>

                            {hasDims ? (
                              <dl>
                                {rows.map((row) => (
                                  <div
                                    key={row.k}
                                    className="flex items-center justify-between gap-4 px-5 md:px-6 py-2.5 border-t border-[var(--color-stone-100)]/70"
                                  >
                                    <dt className="text-[12px] md:text-[12.5px] font-medium text-[var(--color-stone-500)]">
                                      {row.k}
                                    </dt>
                                    <dd
                                      className="font-display text-[14px] md:text-[15px] text-[var(--color-stone-900)] tracking-[-0.01em]"
                                      style={{
                                        fontVariantNumeric: "tabular-nums",
                                      }}
                                    >
                                      {row.v}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            ) : (
                              <p className="px-5 md:px-6 py-3 border-t border-[var(--color-stone-100)]/70 text-[var(--color-stone-400)] text-sm italic">
                                Ölçü bilgisi yok
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })()
            }
          />

          {/* 🕓 GİRİŞ & ÇIKIŞ SAATLERİ (statik) — Konaklama Düzeni'nin
              HEMEN üstünde. Hardcoded (16:00 / 10:00); admin/DB yok.
              space-y container'ında tek kardeş → aynı dikey ritim. */}
          <CheckInOutTimes />

          {/* 🛡️ KONAKLAMA DÜZENİ (mig 047) — Airbnb tarzı oda/banyo
              kartları. Veri yoksa (eski villalar / boş) component
              null döner → section hiç render edilmez (geriye dönük
              uyum). */}
          <AccommodationLayout
            bedrooms={villa.bedroom_layout ?? []}
            bathrooms={villa.bathroom_layout ?? []}
          />

          {/* 🔥 INCLUDES + RULES — desktop 2-kolon side-by-side card pair.
             Tek section varsa wrapper full-width; ikisi de varsa
             lg+ ekranda yan yana (mobile + tablet'te stack). İki kartın
             tonal ayrımı: sand/champagne warm vs stone neutral.
             Mevcut içerik / listeleme / data shape DOKUNULMADI. */}
          {(priceIncludes.length > 0 || rules.length > 0) && (
            <div
              className={
                "grid grid-cols-1 gap-4 md:gap-5 " +
                (priceIncludes.length > 0 && rules.length > 0
                  ? "lg:grid-cols-2 lg:items-start"
                  : "")
              }
            >
              {/* 🔥 PRICE INCLUDES — Fiyata Dahil (emerald positive tone) */}
              {priceIncludes.length > 0 && (
                <section
                  className="
                    rounded-3xl border border-emerald-100
                    bg-emerald-50/60
                    p-6 md:p-7
                  "
                >
                  <h2 className="font-display text-2xl md:text-3xl text-emerald-900 tracking-[-0.015em]">
                    Konaklama ücretine dahil
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                    {priceIncludes.map((p) => (
                      <div
                        key={p.id}
                        className="
                          flex items-center gap-2.5
                          text-[var(--color-stone-700)]
                          bg-white border border-emerald-100
                          rounded-xl px-4 py-3 text-sm
                          hover:border-emerald-300 hover:shadow-soft
                          transition
                        "
                      >
                        <span className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                          <Check size={12} className="text-emerald-600" />
                        </span>
                        {p.title}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* 🔥 RULES — Kurallar (rose warm caution tone) */}
              {rules.length > 0 && (
                <section
                  className="
                    rounded-3xl border border-rose-100
                    bg-rose-50/60
                    p-6 md:p-7
                  "
                >
                  <h2 className="font-display text-2xl md:text-3xl text-rose-900 tracking-[-0.015em]">
                    Konaklama kuralları
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                    {rules.map((r) => (
                      <div
                        key={r.id}
                        className="
                          flex items-center gap-2.5
                          text-[var(--color-stone-700)]
                          bg-white border border-rose-100
                          rounded-xl px-4 py-3 text-sm
                          hover:border-rose-300 hover:shadow-soft
                          transition
                        "
                      >
                        <span className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                          <Check size={12} className="text-rose-600" />
                        </span>
                        {r.title}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ════════════════════════════════════════════════════
              🛡️ FAZ 33 — REVIEWS SECTION
              ════════════════════════════════════════════════════
              Conditional render: hiç approved yorum yok ve istek
              gönderme akışı yine açık olsun (kullanıcı ilk yorumu
              bırakabilsin). Stats.count === 0 durumunda form yine
              gösterilir; header "İlk yorumu bırakın" hissi verir.
              ──────────────────────────────────────────────────── */}
          <VillaReviewsSection
            villaId={villa.id}
            reviews={reviews}
            stats={reviewStats}
          />
        </div>

        {/* RIGHT (sidebar) */}
        <aside id="booking-sidebar" className="lg:col-span-1">
          <div className="lg:sticky lg:top-32">
            <BookingSidebar
              villaSlug={villa.slug}
              villaId={villa.id}
              externalBlocks={externalBlocks}
              prices={prices}
              deposit={villa.deposit}
              cleaning_fee={villa.cleaning_fee}
              cleaning_currency={villa.cleaning_currency}
              cleaning_limit={villa.cleaning_limit}
              custom_prepayment_rate={villa.custom_prepayment_rate ?? null}
              /* 🛡️ FAZ 26B — minimum konaklama gece sayısı.
                 null/<=1 → BookingSidebar enforcement bypass eder,
                 mevcut davranış aynen. */
              minimum_stay_nights={villa.minimum_stay_nights ?? null}
              /* 🛡️ /arama'dan gelen tarihler — opsiyonel hydrate */
              initialStart={hasInitialRange ? initialStart : undefined}
              initialEnd={hasInitialRange ? initialEnd : undefined}
            />
          </div>
        </aside>
      </div>
      </div>

      {/* 🛡️ MOBILE STICKY CTA — yalnız <lg viewport.
          Desktop'ta `lg:hidden` ile render edilmez; mevcut
          `<aside lg:sticky lg:top-32>` sticky sidebar AYNEN. */}
      <MobileBookingCta
        priceAmount={minPrice?.price ?? null}
        priceCurrency={minPrice?.currency ?? null}
        targetId="booking-sidebar"
      />
    </div>

      {/* 🛡️ FULL-WIDTH — Misafir Yorumları'ndan SONRA, Footer'dan ÖNCE.
          Dış padding div'inin KARDEŞİ → boydan boya arka plan; içerik
          kendi max-w-[1280px] container'ında. Kendi verisini çeker. */}
      <SimilarVillasSection
        villaId={villa.id}
        locationId={villa.location_id ?? null}
      />
    </>
  );
}
