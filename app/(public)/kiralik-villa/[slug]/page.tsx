import type { Metadata } from "next";
import { cache } from "react";
import {
  MapPin,
  Clock,
  /* Users / Bed / Bath VillaInfoBar içinde kullanılıyor; bu sayfanın
     eski duplicate header'ı silindiği için burada gerek yok. */
  Waves,
  Check,
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
import ShortStayFeeNotice from "@/app/components/villa/ShortStayFeeNotice";
import CollapsibleDescription from "@/app/components/villa/CollapsibleDescription";
import AccommodationLayout from "@/app/components/villa/AccommodationLayout";

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
/* 🛡️ "Nerede?" kartının Harita/Yol Tarifi butonları + tıklanınca
   açılan harita modalı (bkz. component'in kendi doc yorumu). */
import VillaMapModal from "@/app/components/villa/VillaMapModal";
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
    <div className="px-5 md:px-10 lg:px-16 pt-8 md:pt-12 pb-24 md:pb-32">
      <div className="max-w-[1280px] mx-auto">
        {/* SEO — JSON-LD structured data */}
        <JsonLd data={vacationRentalLd} />
        <JsonLd data={breadcrumbLd} />

        {/* ═══ VILLA INFO HEADER — full-width, Gallery + Booking grid'inin
            ÜSTÜNDE. Villa adı + lokasyon + guests/bedrooms/bathrooms/
            belge no + FavoriteButton logic AYNEN (VillaInfoBar içinde);
            yalnız DOM konumu (artık grid'in üstünde, tam genişlik) ve
            iç tasarımı değişti. */}
        <div className="mb-10 md:mb-14">
          <VillaInfoBar
            villaTitle={villa.title}
            location={villa.location}
            guests={villa.guests}
            bedrooms={villa.bedrooms}
            bathrooms={villa.bathrooms}
            tourismDocumentNumber={villa.tourism_document_number}
          />
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 lg:gap-10">
        {/* LEFT — ~70%: galeri + villa bilgi + içerik gövdesi */}
        <div className="lg:col-span-7 space-y-10 md:space-y-12">
          {/* ═══ GALLERY HERO — sol kolonun (~%70) içinde, sağında
              rezervasyon formu ile aynı hizada başlıyor (form sticky
              DEĞİL, normal akışta). VillaInfoBar artık bu grid'in
              ÜSTÜNDE, full-width (bkz. aşağıda). Lightbox/click
              davranışı AYNEN; yalnız DOM konumu/genişliği değişti. */}
          <div className="relative">
            {/* 🛡️ SEO + a11y: villa.title → alt text auto-generation.
                Ön ödeme kampanya badge'i buradan KALDIRILDI — aynı
                kampanya artık yalnızca BookingSidebar'ın altındaki
                ödeme fırsatı panelinde (gerçek `prepaymentRate` ile)
                gösteriliyor; duplicate render önlendi. */}
            <Gallery
              images={imageUrls}
              watermark={watermark}
              villaTitle={villa.title}
              videos={youtubeVideos}
              actions={<FavoriteButton villaId={villa.id} variant="icon" />}
            />
          </div>

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
                    deposit={villa.deposit ?? null}
                  />
                )}

                {/* 🛡️ Kısa süreli konaklama ücreti uyarı kartı — villa-level
                    alan (cleaning_fee/limit), sezon fiyatlarından bağımsız;
                    prices boş olsa da (ternary'nin DIŞINDA) gösterilir.
                    Hardcode YOK — üçü de mevcut `villa` objesinden. */}
                <ShortStayFeeNotice
                  cleaningFee={villa.cleaning_fee}
                  cleaningCurrency={villa.cleaning_currency}
                  cleaningLimit={villa.cleaning_limit}
                />
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
              {/* Yakındaki Noktalar (Mesafeler) — harita artık bu sekmede değil, sağ kolonda (rezervasyon formu altında). */}
              <section>
                {/* 🛡️ Header — küçük turuncu→mavi mikro accent + uppercase
                    label + başlık + kısa açıklama. Sadece sunum; mesafe
                    verisi/hesaplama/sıralama mantığına dokunulmadı. */}
                <div className="max-w-xl">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span
                      aria-hidden="true"
                      className="h-px w-9 bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
                    />
                    <span className="text-[11px] font-semibold tracking-[0.16em] text-[var(--color-stone-400)]">
                      ÇEVREYİ KEŞFEDİN
                    </span>
                  </div>
                  <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                    Yakındaki Noktalar
                  </h2>
                  <p className="mt-2.5 text-[14px] md:text-[14.5px] text-[var(--color-stone-500)] leading-relaxed">
                    Villaya yürüme ve araçla ulaşım mesafesindeki başlıca noktalar.
                  </p>
                </div>

                {/* 🛡️ Component-scoped satır fade/stagger animasyonu +
                    reduced-motion guard — globals.css'e DOKUNULMADI,
                    yalnız bu bölüm render olduğunda basılır. */}
                <style>{`
                  @media (prefers-reduced-motion: no-preference) {
                    .ynp-row { animation: ynp-fade-in 500ms ease-out both; }
                  }
                  @keyframes ynp-fade-in {
                    from { opacity: 0; transform: translateY(6px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                `}</style>

                {distances.length === 0 ? (
                  <p className="mt-6 text-[var(--color-stone-400)] text-sm italic">
                    Bilgi yok
                  </p>
                ) : (
                  <div
                    role="list"
                    className="mt-7 md:mt-8 border-t border-[var(--color-stone-100)]"
                  >
                    {distances.map((d, i) => {
                      const iconKey: DistanceIconKey = getDistanceIconKey(
                        d.title
                      );
                      const IconCmp: LucideIcon = DISTANCE_ICON_MAP[iconKey];
                      return (
                        <div
                          role="listitem"
                          key={i}
                          className="
                            ynp-row group relative flex items-center gap-4 md:gap-5
                            py-4 md:py-[18px]
                            border-b border-[var(--color-stone-100)]
                            transition-transform duration-300 motion-reduce:transition-none
                            hover:translate-x-1.5 motion-reduce:hover:translate-x-0
                          "
                          style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                        >
                          {/* Sol ince gradient accent çizgisi — hover'da belirir */}
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-2.5 -left-px w-[2.5px] rounded-full bg-gradient-to-b from-[#ED7926] to-[#0973BA] opacity-0 group-hover:opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
                          />
                          <span className="relative shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-[#ED7926]/10 to-[#0973BA]/10 text-[#0973BA] flex items-center justify-center transition-colors duration-300 motion-reduce:transition-none group-hover:from-[#ED7926]/20 group-hover:to-[#0973BA]/20">
                            <IconCmp size={15} strokeWidth={1.75} />
                          </span>
                          <p className="relative min-w-0 flex-1 text-[14px] md:text-[15px] font-medium text-[var(--color-stone-700)] truncate tracking-[-0.005em]">
                            {d.title}
                          </p>
                          <p
                            className="relative shrink-0 font-display text-[16px] md:text-[18px] text-[var(--color-stone-900)] tracking-[-0.01em]"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {d.distance}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
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
          />

          {/* 🛡️ KONAKLAMA DÜZENİ (mig 047) — Airbnb tarzı oda/banyo
              kartları. Veri yoksa (eski villalar / boş) component
              null döner → section hiç render edilmez (geriye dönük
              uyum). */}
          <AccommodationLayout
            bedrooms={villa.bedroom_layout ?? []}
            bathrooms={villa.bathroom_layout ?? []}
          />

          {/* 🏊 HAVUZ BİLGİLERİ — Villa Açıklaması'nın HEMEN
              üstünde, bağımsız kart. Önceden VillaDetailTabs içinde bir
              sekmeydi (tıklanmadan görünmüyordu); artık her zaman
              görünür, ayrı bir section. Veri/hesap mantığı (PoolCard,
              cards.push, formatPoolDimension) AYNEN korunuyor; yalnız
              konum ve JSX/tasarım değişti. */}
          {(villa.pool_type !== "yok" ||
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
                      ? villa.pool_sheltered
                        ? "Özel Korunaklı Havuz"
                        : "Özel Havuz"
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
                  <div className="flex items-center gap-2.5 mb-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0973BA]/10 text-[#0973BA]">
                      <Waves size={16} strokeWidth={1.8} />
                    </span>
                    <h2 className="font-display text-2xl md:text-3xl text-[var(--color-stone-900)] tracking-[-0.015em]">
                      Havuz Bilgileri
                    </h2>
                  </div>

                  {/* MODERN INFO BLOCKS — düz açık zemin (gradient yok),
                      her havuz kendi bloğu; ölçüler küçük kartlar
                      halinde. Hover/transform/animasyon yok. */}
                  <div className="rounded-2xl border border-[var(--color-stone-200)] bg-[var(--color-sand-100)] divide-y divide-[var(--color-stone-100)]">
                    {cards.map((c) => {
                      const hasDims = !!(c.width || c.length || c.depth);
                      const rows = [
                        { k: "Genişlik", v: formatPoolDimension(c.width) },
                        { k: "Uzunluk", v: formatPoolDimension(c.length) },
                        { k: "Derinlik", v: formatPoolDimension(c.depth) },
                      ];
                      return (
                        <div key={c.key} className="p-4 md:p-5">
                          <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--color-stone-500)]">
                            <span
                              aria-hidden="true"
                              className="inline-block w-1.5 h-1.5 rounded-full bg-[#ED7926]"
                            />
                            {c.label}
                          </p>
                          {hasDims ? (
                            <div className="mt-3 grid grid-cols-3 gap-2.5">
                              {rows.map((row) => (
                                <div
                                  key={row.k}
                                  className="rounded-lg border border-[var(--color-stone-100)] bg-white px-3 py-2.5"
                                >
                                  <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--color-stone-400)]">
                                    {row.k}
                                  </p>
                                  <p className="mt-1 font-display text-[16px] md:text-[17px] text-[var(--color-stone-900)] tabular-nums">
                                    {row.v}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2 text-[13px] text-[var(--color-stone-400)] italic">
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

        {/* RIGHT (sidebar) — STICKY KALDIRILDI: rezervasyon formu artık
            normal document flow içinde, sayfa kaydırıldığında sabit
            kalmıyor. Kolon genişliği (lg:col-span-3) AYNEN korunuyor. */}
        <aside id="booking-sidebar" className="lg:col-span-3">
          <BookingSidebar
            villaSlug={villa.slug}
            villaId={villa.id}
            externalBlocks={externalBlocks}
            prices={prices}
            deposit={villa.deposit}
            cleaning_fee={villa.cleaning_fee}
            cleaning_currency={villa.cleaning_currency}
            cleaning_limit={villa.cleaning_limit}
            /* 🛡️ Migration 074 — Havuz Isıtma (5. adım). NULL/0 →
               BookingSidebar seçeneği göstermez (villa.service.ts
               mapVilla zaten NULL passthrough uyguluyor). */
            pool_heating_fee={villa.pool_heating_fee}
            pool_heating_currency={villa.pool_heating_currency}
            custom_prepayment_rate={villa.custom_prepayment_rate ?? null}
            /* 🛡️ FAZ 26B — minimum konaklama gece sayısı.
               null/<=1 → BookingSidebar enforcement bypass eder,
               mevcut davranış aynen. */
            minimum_stay_nights={villa.minimum_stay_nights ?? null}
            /* 🛡️ Orphan-gap kuralı — admin ayarı (settings). Fail-safe TRUE:
               değer okunamazsa/null ise kural AÇIK kabul edilir. */
            orphanGapRuleEnabled={
              settings?.orphan_gap_rule_enabled ?? true
            }
            /* 🛡️ /arama'dan gelen tarihler — opsiyonel hydrate */
            initialStart={hasInitialRange ? initialStart : undefined}
            initialEnd={hasInitialRange ? initialEnd : undefined}
          />

          {/* 🕓 GİRİŞ & ÇIKIŞ SAATLERİ — rezervasyon formunun HEMEN
              altında, ayrı bir premium bilgi paneli. Booking formundan
              (beyaz, rounded-[28px], koyu shadow) görsel olarak farklı:
              sıcak sand-gradient zemin, daha küçük radius, hafif shadow.
              Saatler CheckInOutTimes.tsx ile birebir aynı (16:00 / 10:00)
              — mevcut statik veri kaynağı; yeni saat uydurulmadı. Eski
              konum (sol kolon, Konaklama Düzeni'nin üstü) kaldırıldı,
              sayfada duplicate bırakılmadı. Rezervasyon state/logic'ine
              dokunulmadı — bu panel salt sunum amaçlı, bağımsız bir blok. */}
          <div
            className="
              mt-6 rounded-2xl
              border border-[var(--color-stone-100)]
              bg-gradient-to-b from-[var(--color-sand-50)]/70 to-white
              shadow-[0_10px_28px_-20px_rgba(11,31,58,0.18)]
              px-5 py-5
            "
          >
            <span className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-[var(--color-stone-400)]">
              <span
                aria-hidden="true"
                className="inline-block w-3 h-px bg-gradient-to-r from-[#ED7926] to-[#0973BA]"
              />
              Villa Giriş &amp; Çıkış Saatleri
            </span>

            <div className="mt-4 flex items-center">
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ED7926]/10 text-[#ED7926]">
                  <Clock size={16} strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-stone-400)]">
                    Giriş · Check-in
                  </p>
                  <p className="font-display text-[21px] md:text-[22px] leading-tight text-[var(--color-stone-900)] tabular-nums">
                    16:00
                  </p>
                </div>
              </div>

              <span
                aria-hidden="true"
                className="mx-4 h-10 w-px shrink-0 bg-[var(--color-stone-100)]"
              />

              <div className="flex flex-1 items-center gap-3 min-w-0">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0973BA]/10 text-[#0973BA]">
                  <Clock size={16} strokeWidth={1.8} />
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-stone-400)]">
                    Çıkış · Check-out
                  </p>
                  <p className="font-display text-[21px] md:text-[22px] leading-tight text-[var(--color-stone-900)] tabular-nums">
                    10:00
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 🛡️ "Nerede?" — konum kartı. Önceden VillaDetailTabs'ın
              "Konum & Mesafeler" sekmesindeydi (sol kolon, Yakındaki
              Noktalar'ın altında); artık rezervasyon formu + Giriş & Çıkış
              Saatleri panelinin HEMEN altında, sağ kolonda. Harita ARTIK
              kart içinde her zaman görünmüyor — yalnız "Harita" butonuna
              basılınca VillaMapModal içinde açılıyor (tüm map_type/coords/
              iframe/fallback render mantığı o component'e taşındı, BİREBİR
              aynı). "Harita" butonu eski "Google Maps'te aç" linkiyle AYNI
              koordinat verisini kullanır (artık dışa link yerine modal açar).
              "Yol Tarifi" AYNI lat/lng'den standart Google Maps yol tarifi
              bağlantısını yeni sekmede açar — yeni veri/API/DB sorgusu YOK. */}
          <div
            className="
              mt-6 rounded-2xl
              border border-[var(--color-stone-100)]
              bg-white
              shadow-[0_10px_28px_-20px_rgba(11,31,58,0.18)]
              px-5 py-5
            "
          >
            <VillaMapModal
              mapType={villa.map_type}
              latitude={villa.latitude}
              longitude={villa.longitude}
              mapEmbed={villa.map_embed}
              villaTitle={villa.title}
            />
          </div>

        </aside>
      </div>
      </div>

      {/* 🛡️ MOBILE STICKY CTA — yalnız <lg viewport.
          Desktop'ta `lg:hidden` ile render edilmez; masaüstü booking
          formu artık sticky DEĞİL (normal akış), bu mobile CTA davranışı
          AYNEN korunuyor. */}
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
