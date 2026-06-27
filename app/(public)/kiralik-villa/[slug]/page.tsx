import type { Metadata } from "next";
import { cache } from "react";
import {
  MapPin,
  /* Users / Bed / Bath VillaInfoBar içinde kullanılıyor; bu sayfanın
     eski duplicate header'ı silindiği için burada gerek yok. */
  Wallet,
  Map,
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
  DISTANCE_TONE_MAP,
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
import AccommodationLayout from "@/app/components/villa/AccommodationLayout";

import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image.service";
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
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
/* 🛡️ Soft social-proof — client-only, hydration-safe (kendi useEffect
   ile mount sonrası random sayı set eder; SSR'da DOM'a hiçbir şey
   eklemez). Engine / pricing / availability / reservation flow ile
   ZERO etkileşim. */
import VillaViewersIndicator from "@/app/components/villa/VillaViewersIndicator";

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        {/* LEFT */}
        <div className="lg:col-span-2 space-y-12">
          {/* GALLERY */}
          {/* HERO: InfoBar (üstte) + Gallery (altta).
              InfoBar: villa adı + lokasyon + pill'ler + video CTA.
              Gallery: ham fotoğraflar, click davranışı orijinal
              (overlay/gradient YOK — temiz görsel alan). */}
          <section className="space-y-4">
            <VillaInfoBar
              villaTitle={villa.title}
              location={villa.location}
              guests={villa.guests}
              bedrooms={villa.bedrooms}
              bathrooms={villa.bathrooms}
              videos={youtubeVideos}
              /* 🛡️ Favori CTA — icon-only secondary action.
                 `variant="icon"` FavoriteButton'a eklenen presentational
                 variant; useFavorites hook + handleClick + active state
                 sıfır değişim. Sadece text kaldırıldı, ikon kaldı. */
              actions={
                <FavoriteButton villaId={villa.id} variant="icon" />
              }
            />

            <div className="rounded-3xl overflow-hidden ring-1 ring-[var(--color-stone-100)]">
              {/* 🛡️ SEO + a11y: villa.title → alt text auto-generation. */}
              <Gallery
                images={imageUrls}
                watermark={watermark}
                villaTitle={villa.title}
              />
            </div>
          </section>

          {/* DESCRIPTION */}
          <section>
            <p className="eyebrow mb-3">Detaylar</p>
            <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
              Villa hakkında
            </h2>
            {villa.description && villa.description.trim() ? (
              <div
                className="villa-description card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(villa.description),
                }}
              />
            ) : (
              <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
                <span className="italic text-[var(--color-stone-400)]">
                  Açıklama bulunmuyor
                </span>
              </div>
            )}
          </section>

          {/* 🛡️ KONAKLAMA DÜZENİ (mig 047) — Airbnb tarzı oda/banyo
              kartları. Veri yoksa (eski villalar / boş) component
              null döner → section hiç render edilmez (geriye dönük
              uyum). */}
          <AccommodationLayout
            bedrooms={villa.bedroom_layout ?? []}
            bathrooms={villa.bathroom_layout ?? []}
          />

          {/* ════════════════════════════════════════════════════
              PRICES — Faz 16: premium price card grid
              ════════════════════════════════════════════════════
              Eski büyük h2 + card-premium wrapper kaldırıldı.
              Pool section ile aynı pattern: sade eyebrow + grid.
              Her sezon ayrı mini kart (1 col mobile, 2 col tablet+).
              Premium luxury booking platform hissi.
              ──────────────────────────────────────────────────── */}
          <section>
            <p className="eyebrow mb-4 flex items-center gap-2">
              <Wallet size={11} /> Sezon Fiyatları
            </p>
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

          {/* CALENDAR */}
          <section>
            <p className="eyebrow mb-3">Müsaitlik</p>
            <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
              Takvim
            </h2>
            <div className="card-premium mt-5 overflow-x-auto">
              <AvailabilityInlineCalendar
                villaId={villa.id}
                prices={prices}
                externalBlocks={externalBlocks}
              />
            </div>
          </section>

          {/* DISTANCES */}
          {/* ════════════════════════════════════════════════════
              DISTANCES — Faz 19: premium amenity info-card grid
              ════════════════════════════════════════════════════
              Eski büyük h2 + card-premium wrapper + flat ul/divide-y
              kaldırıldı. Pool / Price section ile aynı pattern:
              eyebrow + responsive grid (1/2/3 col) + her item için
              icon + premium typography.
              ──────────────────────────────────────────────────── */}
          <section>
            <p className="eyebrow mb-4 flex items-center gap-2">
              <Map size={11} /> Yakındaki Noktalar
            </p>
            {distances.length === 0 ? (
              <p className="text-[var(--color-stone-400)] text-sm italic">
                Bilgi yok
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                {distances.map((d, i) => {
                  /* 🛡️ FAZ 19 — title → icon key → lucide icon.
                     Bilinmeyen title → MapPin fallback (generic).
                     Tone palette: DISTANCE_TONE_MAP'ten kategori
                     bazlı soft pastel set; tek truth source. */
                  const iconKey: DistanceIconKey = getDistanceIconKey(d.title);
                  const IconCmp: LucideIcon = DISTANCE_ICON_MAP[iconKey];
                  const tone = DISTANCE_TONE_MAP[iconKey];
                  return (
                    <div
                      key={i}
                      className={
                        "rounded-2xl border " +
                        tone.cardBorder +
                        " " +
                        tone.cardBg +
                        " px-4 py-3.5 md:px-5 md:py-4 " +
                        tone.cardHoverBorder +
                        " hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)] " +
                        "transition-colors motion-reduce:transition-none " +
                        "flex items-center gap-3"
                      }
                    >
                      <span
                        className={
                          "w-9 h-9 shrink-0 rounded-xl border " +
                          tone.iconBorder +
                          " " +
                          tone.iconBg +
                          " " +
                          tone.iconText +
                          " flex items-center justify-center"
                        }
                      >
                        <IconCmp size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] truncate">
                          {d.title}
                        </p>
                        <p
                          className="font-display text-[16px] md:text-[18px] text-[var(--color-stone-900)] mt-0.5 tracking-[-0.01em]"
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

          {/* FEATURES */}
          <section>
            <p className="eyebrow mb-3">Özellikler</p>
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

          {/* ════════════════════════════════════════════════════
              POOL — Faz 15: premium info-card grid
              ════════════════════════════════════════════════════
              Eski dev h2 + card-premium wrapper kaldırıldı.
              Yeni yapı: eyebrow + responsive grid (1/2/3 col).
              Her havuz tipi mini bilgi kartı; "luxury hotel amenity"
              hissi. Section yüksekliği ~%50 azaldı.
              ──────────────────────────────────────────────────── */}
          {(villa.pool_type !== "yok" || villa.indoor_pool || villa.child_pool) && (() => {
            /* Kartları array olarak topla — render-once map; undefined
               girişler `.filter(Boolean)` ile düşer. Type-safe shape. */
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
                  villa.pool_type === "ozel" ? "Özel Havuz" : "Ortak Havuz",
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
                <p className="eyebrow mb-4 flex items-center gap-2">
                  <Waves size={11} /> Havuz Bilgileri
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                  {cards.map((c) => {
                    const hasDims = !!(c.width || c.length || c.depth);
                    return (
                      <div
                        key={c.key}
                        className="
                          rounded-2xl border border-[var(--color-stone-100)] bg-white
                          px-4 py-3.5 md:px-5 md:py-4
                          hover:border-[var(--color-champagne-300)]
                          hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                          transition-colors motion-reduce:transition-none
                        "
                      >
                        <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)] flex items-center gap-1.5">
                          <span
                            className="inline-block w-1 h-1 rounded-full bg-[var(--color-champagne-500)]"
                            aria-hidden
                          />
                          {c.label}
                        </p>
                        {hasDims ? (
                          <>
                            <p
                              className="font-display text-[18px] md:text-[20px] text-[var(--color-stone-900)] mt-2 tracking-[-0.01em]"
                              style={{
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {formatPoolDimension(c.width)} × {formatPoolDimension(c.length)} × {formatPoolDimension(c.depth)}
                            </p>
                            <p
                              className="text-[9px] tracking-[0.18em] uppercase text-[var(--color-stone-300)] font-medium mt-1"
                              aria-hidden
                            >
                              Genişlik × Uzunluk × Derinlik
                            </p>
                          </>
                        ) : (
                          <p className="text-[var(--color-stone-400)] text-sm italic mt-2">
                            Ölçü bilgisi yok
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })()}

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
                  <p className="eyebrow mb-3 text-emerald-700">Fiyata Dahil</p>
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
                  <p className="eyebrow mb-3 text-rose-700">Kurallar</p>
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

          {/* MAP */}
          <section>
            <p className="eyebrow mb-3 flex items-center gap-2">
              <MapPin size={11} /> Konum
            </p>
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
            {/* ════════════════════════════════════════════════════
                🛡️ SOFT SOCIAL PROOF — "X kişi inceliyor"
                ════════════════════════════════════════════════════
                Client-only, hydration-safe. SSR'da hiçbir şey render
                etmez (DOM'a değmez), client mount sonrası random
                sayı (3-18) ile pulse pill görünür.

                BookingSidebar'ın HEMEN ÜSTÜ — Booking.com/Airbnb
                urgency pattern (CTA'nın hemen üstünde social cue).
                Sticky container içinde olduğu için scroll'da
                BookingSidebar ile birlikte takip eder.

                ENGINE/BOOKING/PRICING/AVAILABILITY/SELECTION/
                RESERVATION FLOW ile SIFIR etkileşim. Salt-sunum.
                ──────────────────────────────────────────────────── */}
            <div className="mb-3">
              <VillaViewersIndicator />
            </div>

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

            {/* ════════════════════════════════════════════════════
                🛡️ FAZ 24 — TOURISM DOCUMENT TRUST CARD
                ════════════════════════════════════════════════════
                Conditional render: villa.tourism_document_number
                null/boş ise HİÇ render edilmez (DOM'a bile girmez).

                LOKASYON: BookingSidebar altında, AYNI sticky container
                içinde → "Rezervasyon Yap" kararı veren kullanıcı resmi
                turizm belgesi olduğunu booking widget'ı ile aynı anda
                görür (hospitality booking pattern: Airbnb Luxe / Plum
                Guide "Verified property" badge).

                SSR-SAFE: server component JSX gate; render olunca/
                olmayınca client'ta diff yok → hidrasyon mismatch yok.

                LAYOUT SHIFT: sıfır — değer SSR'da değerlendirilir,
                client'ta zaten render edilmiş HTML hidrate olur.

                MOBILE: aside `lg:sticky lg:top-32` yalnız lg+ aktif;
                mobil viewport'ta sticky kapalı, BookingSidebar +
                trust card natural flow ile alt-alta.

                DOKUNULMAYAN: BookingSidebar prop signature, sticky
                container, hiçbir parent layout. Sadece kardeş JSX node.
                ──────────────────────────────────────────────────── */}
            {villa.tourism_document_number && (
              <div
                className="
                  mt-4 rounded-2xl border border-[var(--color-stone-100)] bg-white
                  px-4 py-3.5 md:px-5 md:py-4
                  hover:border-[var(--color-champagne-300)]
                  hover:shadow-[0_8px_20px_-12px_rgb(27_26_23/0.08)]
                  transition-colors motion-reduce:transition-none
                "
              >
                <div className="flex items-start gap-3">
                  <span
                    className="
                      w-16 h-16 shrink-0 rounded-xl
                      bg-[var(--color-sand-50)] border border-[var(--color-stone-100)]
                      flex items-center justify-center
                      text-[var(--color-champagne-600)]
                    "
                    aria-hidden
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/trust/turizm-bakanligi.svg"
                      alt=""
                      aria-hidden
                      className="w-12 h-12 object-contain"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] tracking-[0.18em] uppercase font-medium text-[var(--color-stone-500)]">
                      T.C. Kültür ve Turizm Bakanlığı
                    </p>
                    {/* Büyük belge no — select-all kopyalanabilir; break-all
                        overflow-safe; tabular-nums premium görünüm. */}
                    <p
                      className="
                        font-display text-[18px] md:text-[20px]
                        text-[var(--color-stone-900)] mt-1 tracking-[-0.01em]
                        select-all break-all
                      "
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {villa.tourism_document_number}
                    </p>
                    {/* Belgeyi Görüntüle — KTB konut belge sorgu (yeni sekme).
                        URL belge no'dan dinamik üretilir. */}
                    <a
                      href={`https://vatandas.ktb.gov.tr/konut-belge/${encodeURIComponent(
                        villa.tourism_document_number
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1.5 text-[12px] font-medium text-[var(--color-champagne-700)] hover:underline"
                    >
                      Belgeyi Görüntüle
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            )}
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
