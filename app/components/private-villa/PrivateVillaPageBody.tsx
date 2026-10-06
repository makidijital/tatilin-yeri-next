import { notFound } from "next/navigation";

/* ===============================================================
   🛡️ FAZ 31 — PRIVATE / TEMPORARY VILLA URL ROUTE
   ===============================================================
   `/v/[token]` — off-market preview route (TR/EN/DE ORTAK gövde).

   ⚠️ ROUTE PATH KARARI:
     `app/p/[slug]` CMS sayfaları için zaten dinamik segment olduğundan
     `/v/[token]` ("v" = villa) kullanıldı; CMS slug sistemi DOKUNULMAZ.

   AMAÇ:
     - Pasif (is_active=false) villalar dahil, secret token bilen
       herkesin villayı görüntüleyebilmesi.
     - Public listelerde (homepage, /arama, kategori, sitemap, search)
       ASLA görünmez — bu route ayrı bir erişim katmanı.

   🛡️ TASARIM PARİTESİ (bu tur):
     Görünüm normal villa detayının TEK KAYNAĞI olan `VillaDetailBody`
     ile render edilir (layout/grid/galeri/favori/sekmeler/fiyat+indirim/
     takvim+iCal/tek gece kuralı/oda düzeni/havuz/dahil-kurallar/yorumlar/
     BookingSidebar/giriş-çıkış/harita modalı/mobil CTA/benzer villalar).
     Veri seti `/en|de/kiralik-villa/[slug]` ile BİREBİR aynı servislerden
     okunur — yeni servis/sorgu YOK.

   YALNIZ BURAYA ÖZGÜ (korunan):
     - Token ile okuma (`getVillaByPrivateToken`) + `notFound()`.
     - `force-dynamic` (token rotasyonu/revoke anında yansısın).
     - SEO: JSON-LD VERİLMEZ (VillaDetailBody'de opsiyonel); metadata
       (noindex/nofollow, canonical YOK) `private-villa-metadata.ts`'te.
     - PASİF villa: `/rezervasyon/[slug]` yalnız aktif villayı açtığı
       için "Rezervasyon Yap" gizlenir (`hideReservationCta`); tarih
       seçimi + fiyat hesabı aynen çalışır. Aktif villada normal sayfayla
       BİREBİR aynı rezervasyon akışı.

   ÇOKLU DİL:
     `locale === "tr"` → çeviri helper'ları DB'ye HİÇ SORGU ATMAZ.
     EN/DE → koleksiyon başına TEK batch sorgu (N+1 YOK); mesafe
     başlıkları statik `distanceLabels` dictionary'sinden.

   DOKUNULMAYAN:
     reservation engine, pricing engine, availability, BookingSidebar
     logic, token servisi, metadata, /kiralik-villa/[slug] route'u.
   =============================================================== */

import VillaDetailBody from "@/app/components/villa/VillaDetailBody";
import type { TranslatedDistance } from "@/app/components/villa/VillaDistancesSection";
import type { TranslatedFeature } from "@/app/components/villa/VillaFeaturesSection";
import type {
  TranslatedPriceInclude,
  TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";

import { getDistanceIconKey } from "@/lib/distance.helper";
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";

import { getVillaByPrivateToken } from "@/app/services/villa.service";
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import {
  resolveVillaImageUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import { getVillaDistances } from "@/app/services/villa-distance.service";
import { getVillaFeaturesByVilla } from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
import { getPublicSettings } from "@/app/services/settings.service";
/* Normal villa detayıyla AYNI cached yorum okumaları + iCal helper'ı. */
import {
  getCachedVillaReviews,
  getCachedVillaReviewStats,
} from "@/lib/cache.helpers";
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
} from "@/lib/external-calendar.public.helper";

import { isValidYmd } from "@/lib/availability.helper";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { getVillaTranslatedDescription } from "@/lib/i18n/get-villa-translation.server";
import {
  getTranslationsForParents,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";
import { getTranslatedDistanceLabel } from "@/lib/distance-label.helper";

/* 🛡️ Force-dynamic: token-based access; route segment cache YOK.
   Admin pasif→aktif veya token revoke senaryosunda link davranışı
   anında değişmeli. Stale render önlenir. */
export const dynamic = "force-dynamic";

type Feature = {
  id: string;
  name: string;
};

/* Normal detay sayfalarıyla AYNI sidebar id'leri (MobileBookingCta
   `targetId` eşleşmesi). */
const BOOKING_SIDEBAR_ID: Record<Locale, string> = {
  tr: "booking-sidebar",
  en: "booking-sidebar-en",
  de: "booking-sidebar-de",
};

export default async function PrivateVillaPageBody({
  params,
  searchParams,
  locale = DEFAULT_LOCALE,
}: {
  params: Promise<{ token: string }>;
  searchParams?: Promise<{
    start?: string | string[];
    end?: string | string[];
  }>;
  /* 🛡️ Opsiyonel — verilmezse "tr". */
  locale?: Locale;
}) {
  const { token } = await params;

  /* Token URL'ine eklenmiş tarihleri tolere ederiz (paylaşılan öneri). */
  const sp = searchParams ? await searchParams : {};
  const rawStart = Array.isArray(sp?.start) ? sp.start[0] : sp?.start;
  const rawEnd = Array.isArray(sp?.end) ? sp.end[0] : sp?.end;
  const initialStart = isValidYmd(rawStart) ? rawStart : null;
  const initialEnd = isValidYmd(rawEnd) ? rawEnd : null;
  const hasInitialRange =
    !!initialStart && !!initialEnd && initialStart < initialEnd;

  /* 🛡️ Token ile villa fetch. is_active filter YOK; deleted_at IS NULL
     korunur. Yoksa 404 (notFound). */
  const villa = await getVillaByPrivateToken(token);
  if (!villa) {
    notFound();
  }

  /* Paralel veri yükleme — normal villa detayıyla AYNI servisler. */
  const [
    images,
    prices,
    discounts,
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
    getVillaDiscounts(villa.id),
    getVillaDistances(villa.id),
    getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
    getRuleItemsByVilla(villa.id),
    getPriceIncludeItemsByVilla(villa.id),
    fetchExternalCalendarStringsForVilla(villa.id).catch(
      () => EMPTY_EXTERNAL_STRING_ARRAYS
    ),
    getPublicSettings(),
    getCachedVillaReviews(villa.id),
    getCachedVillaReviewStats(villa.id),
  ]);

  /* 🛡️ ÇOKLU DİL — koleksiyon başına TAM 1 batch çeviri sorgusu
     (TR'de hiç sorgu yok). Mesafeler bu batch'te YOK (statik dictionary). */
  const [
    description,
    featureTranslations,
    ruleTranslations,
    priceIncludeTranslations,
  ] = await Promise.all([
    getVillaTranslatedDescription(villa.id, villa.description, locale),
    getTranslationsForParents(
      "villa_feature",
      features.map((f) => f.id),
      locale
    ),
    getTranslationsForParents(
      "rule_item",
      rules.map((r) => r.id),
      locale
    ),
    getTranslationsForParents(
      "price_include_item",
      priceIncludes.map((p) => p.id),
      locale
    ),
  ]);

  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  const watermark = {
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

  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  /* "caller resolves, component renders" — normal detay sayfalarıyla
     AYNI eşleme. 🛡️ ICON KEY canonical (TR) `d.title`'dan. */
  const displayDistances: TranslatedDistance[] = distances.map((d) => ({
    id: d.id,
    displayTitle: getTranslatedDistanceLabel(d.title, locale),
    displayDistance: d.distance,
    iconKey: getDistanceIconKey(d.title),
  }));
  const displayFeatures: TranslatedFeature[] = features.map((f) => ({
    id: f.id,
    displayName: resolveTranslatedField(
      featureTranslations.get(f.id)?.name,
      f.name
    ),
  }));
  const displayRules: TranslatedRule[] = rules.map((r) => ({
    id: r.id,
    displayTitle: resolveTranslatedField(
      ruleTranslations.get(r.id)?.title,
      r.title
    ),
  }));
  const displayPriceIncludes: TranslatedPriceInclude[] = priceIncludes.map(
    (p) => ({
      id: p.id,
      displayTitle: resolveTranslatedField(
        priceIncludeTranslations.get(p.id)?.title,
        p.title
      ),
    })
  );

  return (
    <VillaDetailBody
      locale={locale}
      /* 🛡️ Gizli linkte turizm belge numarası HİÇBİR KOŞULDA gösterilmez.
         Alan yalnız VillaInfoBar'da (belge kartı) okunur; null verilince
         kart + kolonu render edilmez. Diğer hiçbir prop/mantık etkilenmez. */
      villa={{ ...villa, tourism_document_number: null }}
      villaTitle={villa.title}
      displayLocation={villa.location}
      displayDescription={description}
      imageUrls={imageUrls}
      watermark={watermark}
      youtubeVideos={youtubeVideos}
      prices={prices}
      discounts={discounts}
      externalBlocks={externalBlocks}
      distances={displayDistances}
      features={displayFeatures}
      rules={displayRules}
      priceIncludes={displayPriceIncludes}
      reviews={reviews}
      reviewStats={reviewStats}
      orphanGapRuleEnabled={settings?.orphan_gap_rule_enabled ?? true}
      contactPhone={settings?.phone ?? null}
      contactWhatsappLink={settings?.whatsapp_link ?? null}
      initialStart={hasInitialRange ? initialStart : undefined}
      initialEnd={hasInitialRange ? initialEnd : undefined}
      bookingSidebarId={BOOKING_SIDEBAR_ID[locale] ?? BOOKING_SIDEBAR_ID.tr}
      /* 🛡️ JSON-LD BİLİNÇLİ OLARAK VERİLMEZ (off-market SEO yüzeyi yok). */
      /* 🛡️ Pasif villa → rezervasyon sayfası açılmaz; CTA gizli. */
      hideReservationCta={villa.is_active === false}
    />
  );
}
