import type { Metadata } from "next";
import { cache } from "react";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import { getVillaBySlug } from "@/app/services/villa.service";
import {
  getVillaTranslatedTitle,
  getVillaTranslatedDescription,
  getVillaTranslatedSeoDescription,
  /* 🛡️ PHASE 10B, Section 11 — SEO title override (varsa). */
  getVillaTranslatedSeoTitle,
  /* 🛡️ PHASE 10E — oda/banyo adı çevirileri (migration 083). AYNI
     getVillaTranslationCached satırını reuse eder → EK DB SORGUSU YOK. */
  getVillaTranslatedBedroomNames,
  getVillaTranslatedBathroomNames,
} from "@/lib/i18n/get-villa-translation.server";
/* 🛡️ PHASE 8D-2 — batch translation okuma (8D-1) + generic fallback. */
import {
  getTranslationsForParents,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";
import { getCachedSettings, getCachedVillaReviewStats } from "@/lib/cache.helpers";
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import { sanitizeHtml, stripHtml } from "@/lib/html-sanitize";
import CollapsibleDescription from "@/app/components/villa/CollapsibleDescription";
/* 🛡️ PHASE 8D-2 — location/features/rules/priceIncludes/distances ham
   veri (TR sayfasındaki AYNI servisler, DEĞİŞTİRİLMEDİ). */
import { getVillaDistances } from "@/app/services/villa-distance.service";
import {
  getVillaFeaturesByVilla,
  type Feature,
} from "@/app/services/villa-feature.service";
import { getRuleItemsByVilla } from "@/app/services/rule-item.service";
import { getPriceIncludeItemsByVilla } from "@/app/services/price-include-item.service";
import { getDistanceIconKey } from "@/lib/distance.helper";
import { getTranslatedDistanceLabel } from "@/lib/distance-label.helper";
import VillaInfoBar from "@/app/components/villa/VillaInfoBar";
import VillaDistancesSection, {
  type TranslatedDistance,
} from "@/app/components/villa/VillaDistancesSection";
import VillaFeaturesSection, {
  type TranslatedFeature,
} from "@/app/components/villa/VillaFeaturesSection";
/* 🛡️ PHASE 10E — TR sayfasının KULLANDIĞI AYNI component (yeni tasarım/
   CSS YOK); yalnız locale + çözülmüş adlar prop'larıyla besleniyor. */
import AccommodationLayout from "@/app/components/villa/AccommodationLayout";
/* 🛡️ PHASE 10E BATCH 5 — havuz bölümü (TR'deki AYNI yapı, locale-aware). */
import VillaPoolSection from "@/app/components/villa/VillaPoolSection";
import VillaPriceIncludesAndRulesSection, {
  type TranslatedPriceInclude,
  type TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";

/* ===============================================================
   🛡️ PHASE 10B, Section 9 — ComingSoon'un YERİNE gerçek villa detay.
   ===============================================================
   `LocaleRouteComingSoon` importu/render'ı KALDIRILDI. Aşağıdaki 5
   component TR'nin KULLANDIĞI AYNI shared component'ler (A/C mimarisi —
   paralel component/ikinci booking engine YOK); hepsi bu fazda eklenen
   opsiyonel `locale` prop'unu alır, business logic'lerine (price.engine,
   calendar.engine, villa-availability.helper, useBookingEngine'in
   selection/pricing/min-stay/orphan-gap mantığı) KESİNLİKLE DOKUNULMADI. */
import Gallery from "@/app/components/villa/Gallery";
import PriceList from "@/app/components/villa/PriceList";
import AvailabilityInlineCalendar from "@/app/components/villa/AvailabilityInlineCalendar";
import BookingSidebar from "@/app/components/villa/BookingSidebar";
import MobileBookingCta from "@/app/components/villa/MobileBookingCta";

/* 🛡️ PHASE 10B, Section 9 — Gallery/PriceList/AvailabilityInlineCalendar/
   BookingSidebar/MobileBookingCta'nın ihtiyaç duyduğu veri: TR
   sayfasındaki (`kiralik-villa/[slug]/page.tsx`, DEĞİŞTİRİLMEDİ) AYNI
   servisler/helper'lar, AYNI argümanlar. Yeni bir veri kaynağı/sorgu
   PATTERN'İ İCAT EDİLMEDİ. */
import { getVillaImages } from "@/app/services/villa-image/villa-image.read";
import { getVillaPrices } from "@/app/services/villa-price.service";
import { getVillaDiscounts } from "@/app/services/villa-discount.service";
import {
  resolveVillaImageUrl,
  resolveAssetUrlVersioned,
} from "@/lib/storage.helpers";
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
} from "@/lib/external-calendar.public.helper";
import {
  normalizeYouTubeVideos,
  type VillaYouTubeVideo,
} from "@/lib/youtube.helper";
/* 🛡️ PHASE 10B, Section 10 — JSON-LD (TR'nin KULLANDIĞI AYNI builder'lar,
   ikisi de zaten `locale` param'ı destekliyor — Phase 7D). TR'nin kendi
   JSON-LD'sine (kiralik-villa/[slug]/page.tsx) DOKUNULMADI. */
import {
  JsonLd,
  buildBreadcrumb,
  buildVacationRental,
} from "@/app/components/seo/StructuredData";
/* 🛡️ PHASE 10B, Section 13 — locale-aware "Villa bulunamadı" eşdeğeri +
   Section 9'un "Açıklama bulunmuyor" fallback'i artık bu dictionary'den. */
import { getDictionary } from "@/lib/i18n/get-dictionary";

/* ===============================================================
   🛡️ /en/kiralik-villa/[slug] — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/kiralik-villa/[slug]/page.tsx (~1000
   satır, DEĞİŞMEDİ). Villa detay veri/komponent akışı bu fazda
   BURAYA kopyalanmadı/refactor edilmedi (görev tanımının açık kısıtı
   — bkz. FALLBACK notu). `multilingual_enabled=false` olduğu sürece
   (bugün production) notFound() → 404 — aynı slug'ın TR karşılığı
   (`/kiralik-villa/[slug]`) bu değişiklikten ETKİLENMEZ.

   🛡️ PHASE 4B EKLEMESİ: `setRequestLocale(locale)` — bu request için
   locale'i işaretler (lib/i18n/request-locale.server.ts, React `cache()`
   request-scoped store). TR route'ları bu store'u hiç yazmadığından
   onlar için `DEFAULT_LOCALE` ("tr") otomatik kalır. Bu satır dışında
   PHASE 4A davranışı (gate + placeholder) DEĞİŞMEDİ.

   🛡️ PHASE 6B EKLEMESİ — YALNIZ TITLE (page body):
   `params` okunuyor (slug) ve villa `getVillaBySlug` (mevcut,
   DEĞİŞMEMİŞ `villa.service.ts` export'u — `mapVilla`/`VillaDTO`/
   TR sayfasının kendi private `getVillaBySlugCached`'i HİÇ dokunulmadı)
   ile okunuyor. Görünen title, `getVillaTranslatedTitle` (Phase 6B,
   `lib/i18n/get-villa-translation.server.ts`) ile locale'e göre
   çözülüyor: çeviri varsa çevrilmiş title, yoksa/TR ise `villa.title`
   AYNEN. Badge/tam villa detay deneyimi (galeri, fiyat, harita, vb.)
   HÂLÂ YOK — `LocaleRouteComingSoon` (DEĞİŞMEDİ) hâlâ "çevrilmedi"
   notunu gösteriyor; yalnız title (+ Phase 8B'de description) bunun
   üstüne eklendi. Villa bulunamazsa
   (geçersiz slug) `notFound()` (TR sayfasının kendi özel "Villa
   bulunamadı" bloğu BURAYA kopyalanmadı — kapsam dışı, standart 404
   akışı reuse edildi).

   🛡️ PHASE 7C EKLEMESİ — YALNIZ CANONICAL + HREFLANG (generateMetadata):
   Statik `export const metadata` → `generateMetadata` fonksiyonuna
   çevrildi (yalnız bunu mümkün kılmak için — robots değeri AŞAĞIDA
   AÇIKLANDIĞI GİBİ DEĞİŞMEDİ). Villa okuma, page body ile AYNI
   request içinde TEK sorguya inmesi için `cache()` ile sarmalandı
   (`getVillaBySlugCached` — bu dosyaya ÖZEL, TR sayfasının private
   sabitiyle AYNI isim ama AYRI modül-scope'lu değişken, birbirine
   hiç referans vermez; proje convention'ı — bkz. TR sayfası).
   `getVillaTranslatedTitle` zaten Phase 6B'de React `cache()` ile
   sarmalı (`get-villa-translation.server.ts`) — metadata + body aynı
   (villaId, locale) çifti için TEK DB sorgusu paylaşır, yeni bir
   sorgu paterni EKLENMEDİ.

   CANONICAL: Phase 7B'nin `buildLocaleAlternates(trPath, "en")`'i
   TEK kaynak — URL'ler elle birleştirilmedi. HREFLANG (`languages`):
   yalnız `multilingual_enabled=true` iken eklenir (flag false iken
   zaten bu route notFound() ile kapanıyor — var olmayan/404 URL'lere
   işaret eden hreflang ÜRETİLMEZ, bkz. Phase 7A audit §4/§12).

   ROBOTS: BU FAZDA DEĞİŞMEDİ — hâlâ koşulsuz `{index:false,follow:false}`
   (görev tanımı §3: "robots/noindex davranışını bu phase'te
   değiştirme"). `multilingual_enabled` true olsa BİLE bu sayfa hâlâ
   noindex kalır; robots'un flag'e/villa'ya bağlanması AYRI, gelecek
   bir fazın konusu (Phase 7A audit §10, Phase 7E).

   TITLE: `getVillaTranslatedTitle` ile çözülüyor (Phase 6B'nin body'de
   zaten yaptığı AYNI şey — metadata'ya da uygulandı). METADATA
   DESCRIPTION: BU FAZDA (7C) EKLENMEMİŞTİ, Phase 8B'de de
   DOKUNULMADI (Phase 8B kapsamı YALNIZ page BODY'sindeki description
   — SEO `generateMetadata` alanı ayrı, gelecek bir fazın konusu) —
   metadata'da hâlâ hiç `description` set edilmiyor, root layout'un
   (`app/layout.tsx`) varsayılan description'ı miras alınır (Next.js
   metadata merge davranışı, yeni bir mekanizma İCAT EDİLMEDİ).

   🛡️ PHASE 8B EKLEMESİ — YALNIZ BODY DESCRIPTION (generateMetadata'ya
   DOKUNULMADI): `getVillaTranslatedDescription`
   (`lib/i18n/get-villa-translation.server.ts`) ile locale'e göre
   çözülüyor — title ile BİREBİR AYNI `getVillaTranslationCached
   (villaId, locale)` çağrısını reuse eder (React `cache()`
   request-scoped dedupe); description için AYRI bir DB sorgusu
   EKLENMEZ. Render, TR sayfasının (`kiralik-villa/[slug]/page.tsx`)
   description bloğuyla AYNI koşullu desen: boş/whitespace değilse
   `CollapsibleDescription` (`sanitizeHtml`/`stripHtml` — mevcut
   sanitize mekanizması DEĞİŞTİRİLMEDİ, aynen reuse edildi), boşsa TR
   sayfasındaki AYNI "Açıklama bulunmuyor" hardcoded fallback metni
   (bu faz hardcoded UI metnine DOKUNMUYOR/ÇEVİRMİYOR, olduğu gibi
   reuse ediyor). Yeni bir section başlığı ("Villa hakkında" gibi)
   BİLİNÇLİ OLARAK EKLENMEDİ — bu fazın kapsamı yalnız description
   İÇERİĞİ (Phase 8A raporunun "Önerilen Phase 8B" gerekçesiyle
   tutarlı minimal karar).

   🛡️ PHASE 8D-2 EKLEMESİ — location/features/rules/priceIncludes/
   distances (yalnız page BODY'sinde, generateMetadata'ya
   DOKUNULMADI): TR'deki AYNI 4 servis (`getVillaDistances`,
   `getVillaFeaturesByVilla`, `getRuleItemsByVilla`,
   `getPriceIncludeItemsByVilla`) + `villa.location`/`location_id`
   (villa DTO'da ZATEN mevcut, ek sorgu YOK). Çeviri, Phase 8D-1'in
   batch helper'ı `getTranslationsForParents(entity, parentIds,
   locale)` ile KOLEKSİYON BAŞINA TEK sorguda (`.in()`) çözülüyor —
   item başına `getTranslation()` YOK, N+1 YOK. `resolveTranslatedField`
   ile AYNI, mevcut fallback ilkesi: çeviri yoksa/boşsa orijinal TR
   değeri. Render, `VillaDetailTabs`'ın ("use client", `fiyatlar`/
   `musaitlik` prop'ları ZORUNLU) EN/DE'ye taşınmasını GEREKTİRMEYECEK
   şekilde, TR'den FARKLI olarak düz/art arda section'lar halinde —
   3 yeni, salt-sunum SERVER component ile (`VillaDistancesSection`,
   `VillaFeaturesSection`, `VillaPriceIncludesAndRulesSection`,
   `app/components/villa/`) — TR page.tsx'in KENDİSİ bu component'leri
   KULLANMIYOR, DOKUNULMADI, kendi inline JSX'i AYNEN duruyor (Phase
   8D-2 audit'in onaylanan tasarım kararları).

   🛡️ ICON KEY (kritik): `getDistanceIconKey` TÜRKÇE anahtar kelimeye
   bağlı — icon key HER ZAMAN orijinal (TR) `distance.title`'dan
   hesaplanır, ÇEVRİLMİŞ `displayTitle`'dan DEĞİL (bkz.
   `VillaDistancesSection`'ın kendi yorumu).

   Hardcoded TR UI metinleri (section başlıkları, boş-durum mesajları)
   BU FAZDA ÇEVRİLMEDİ — UI dictionary AYRI bir fazın konusu.
   =============================================================== */

/* ⚡ PERF — generateMetadata + page body aynı request içinde aynı
   villayı çağırır; React cache() ile TEK DB sorgusu paylaşılır (TR
   sayfasındaki AYNI, kanıtlanmış desen). */
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
      title: "Villa not found",
      robots: { index: false, follow: false },
    };
  }

  const fallbackTitle = await getVillaTranslatedTitle(
    villa.id,
    villa.title,
    "en"
  );
  /* 🛡️ PHASE 10B, Section 11 — TR'nin generateMetadata'sındaki AYNI
     öncelik: seo_title (çevirisi) varsa/doluysa O, yoksa çevrilmiş
     normal title. `getVillaTranslatedSeoTitle` de AYNI
     getVillaTranslationCached(villa.id,"en") çağrısını reuse eder —
     YENİ bir DB sorgusu EKLENMEZ. */
  const translatedSeoTitle = await getVillaTranslatedSeoTitle(
    villa.id,
    villa.seo_title,
    "en"
  );
  const title =
    (translatedSeoTitle && translatedSeoTitle.trim()) || fallbackTitle;
  /* 🛡️ PHASE 8C — title ile AYNI getVillaTranslationCached(villa.id,"en")
     çağrısını reuse eder (React cache() request-scoped dedupe);
     seo_description için AYRI bir DB sorgusu EKLENMEZ. Yalnız
     `metadata.description` için kullanılır — openGraph/twitter'a
     EKLENMEZ (Phase 7C zaten EN/DE'de bu alanları hiç eklememişti,
     bu fazın kapsamı değil). */
  const description = await getVillaTranslatedSeoDescription(
    villa.id,
    villa.seo_description,
    villa.description,
    "en"
  );
  const trCanonicalPath = `/kiralik-villa/${villa.slug || slug}`;
  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    trCanonicalPath,
    "en"
  );

  return {
    title,
    description,
    robots: { index: false, follow: false },
    alternates: isMultilingualEnabled(settings)
      ? { canonical, languages }
      : { canonical },
    openGraph: {
      title,
      type: "website",
      url: canonical,
    },
  };
}

export default async function EnVillaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  const dict = getDictionary("en");

  const { slug } = await params;
  const villa = await getVillaBySlugCached(slug);
  if (!villa) {
    /* 🛡️ PHASE 10B, Section 13 — TR sayfasının (kiralik-villa/[slug]/
       page.tsx, DEĞİŞTİRİLMEDİ) kendi "Villa bulunamadı" bloğuyla AYNI
       desen/stil, locale-aware metinle (dictionary'den). Önceki davranış
       (`notFound()` → gerçek 404) TR ile PARİTE SAĞLAMIYORDU (TR bu
       durumda custom 200 render ediyor) — TR'nin kendi mimarisiyle
       TUTARLI hale getirildi. */
    return (
      <section className="section-narrow py-32 text-center">
        <p className="eyebrow !text-[var(--color-stone-400)]">404</p>
        <h2 className="font-display text-3xl text-[var(--color-stone-900)] mt-3">
          {dict.villa.notFoundTitle}
        </h2>
        <p className="text-[var(--color-stone-500)] mt-3">
          {dict.villa.notFoundBody}
        </p>
        <a href="/en/arama" className="btn-ghost mt-6 inline-flex">
          {dict.villa.notFoundCta}
        </a>
      </section>
    );
  }

  const title = await getVillaTranslatedTitle(villa.id, villa.title, "en");
  /* 🛡️ PHASE 8B — title ile AYNI getVillaTranslationCached(villa.id,"en")
     çağrısını reuse eder (React cache() request-scoped dedupe);
     description için AYRI bir DB sorgusu EKLENMEZ. */
  const description = await getVillaTranslatedDescription(
    villa.id,
    villa.description,
    "en"
  );

  /* 🛡️ PHASE 10B, Section 9 — YouTube videoları Gallery'ye geçmek için;
     TR sayfasındaki AYNI saf/sync normalize helper (ek sorgu YOK,
     villa.youtube_videos zaten DTO'da mevcut). */
  const youtubeVideos: VillaYouTubeVideo[] = normalizeYouTubeVideos(
    villa.youtube_videos
  );

  /* 🛡️ PHASE 8D-2 — TR sayfasındaki AYNI 4 servis, AYNI (villa.id)
     argümanı, Promise.all ile paralel (TR'nin kendi Promise.all
     desenine paralel — TR dosyasına dokunulmadı). */
  const [distances, features, rules, priceIncludes] = await Promise.all([
    getVillaDistances(villa.id),
    getVillaFeaturesByVilla(villa.id) as Promise<Feature[]>,
    getRuleItemsByVilla(villa.id),
    getPriceIncludeItemsByVilla(villa.id),
  ]);

  /* 🛡️ PHASE 10B, Section 9 — Gallery/PriceList/AvailabilityInlineCalendar/
     BookingSidebar/MobileBookingCta'nın ihtiyaç duyduğu veri. TR
     sayfasındaki (kiralik-villa/[slug]/page.tsx) AYNI servisler, AYNI
     argümanlar (villa.id), AYNI paralel-fetch deseni (Promise.all) —
     yeni bir veri kaynağı/sorgu PATTERN'İ İCAT EDİLMEDİ. externalBlocks
     fail-safe: TR'deki AYNI `.catch(() => EMPTY_EXTERNAL_STRING_ARRAYS)`.
     reviewStats — JSON-LD aggregateRating için (Section 10); VillaReviewsSection
     BU FAZIN KAPSAMI DIŞI (kullanıcının açık component listesinde YOK),
     yalnız cached, salt-okunur bir sayı okunuyor. */
  const [images, prices, discounts, externalBlocks, settings, reviewStats] =
    await Promise.all([
      getVillaImages(villa.id),
      getVillaPrices(villa.id),
      getVillaDiscounts(villa.id),
      fetchExternalCalendarStringsForVilla(villa.id).catch(
        () => EMPTY_EXTERNAL_STRING_ARRAYS
      ),
      getCachedSettings(),
      getCachedVillaReviewStats(villa.id),
    ]);

  /* 🛡️ PHASE 8D-2 — koleksiyon başına TAM 1 batch çeviri sorgusu
     (Phase 8D-1 `getTranslationsForParents`, `.in()` ile) — item
     başına sorgu YOK (N+1 önlendi). `location_id` null ise villa_location
     sorgusu HİÇ atılmaz (audit hedefi: "location için en fazla 1 query"). */
  const [
    featureTranslations,
    ruleTranslations,
    priceIncludeTranslations,
    locationTranslations,
  ] = await Promise.all([
    getTranslationsForParents(
      "villa_feature",
      features.map((f) => f.id),
      "en"
    ),
    getTranslationsForParents("rule_item", rules.map((r) => r.id), "en"),
    getTranslationsForParents(
      "price_include_item",
      priceIncludes.map((p) => p.id),
      "en"
    ),
    villa.location_id
      ? getTranslationsForParents(
          "villa_location",
          [villa.location_id],
          "en"
        )
      : Promise.resolve(new Map()),
  ]);

  /* 🛡️ ICON KEY — ORİJİNAL (TR) d.title'dan hesaplanır, ÇEVRİLMİŞ
     displayTitle'dan DEĞİL (bkz. dosya başı yorum + VillaDistancesSection). */
  const translatedDistances: TranslatedDistance[] = distances.map((d) => ({
    id: d.id,
    /* 🛡️ PHASE 10D BATCH 4 — title artık DB translation table DEĞİL,
       statik i18n dictionary üzerinden (villa_distance_translations
       KULLANILMIYOR). */
    displayTitle: getTranslatedDistanceLabel(d.title, "en"),
    /* 🛡️ PHASE 10D BATCH 4 — mesafe DEĞERİ hiçbir zaman çevrilmez, ham
       TR değer aynen kullanılır. */
    displayDistance: d.distance,
    iconKey: getDistanceIconKey(d.title),
  }));

  const translatedFeatures: TranslatedFeature[] = features.map((f) => ({
    id: f.id,
    displayName: resolveTranslatedField(
      featureTranslations.get(f.id)?.name,
      f.name
    ),
  }));

  const translatedRules: TranslatedRule[] = rules.map((r) => ({
    id: r.id,
    displayTitle: resolveTranslatedField(
      ruleTranslations.get(r.id)?.title,
      r.title
    ),
  }));

  const translatedPriceIncludes: TranslatedPriceInclude[] = priceIncludes.map(
    (p) => ({
      id: p.id,
      displayTitle: resolveTranslatedField(
        priceIncludeTranslations.get(p.id)?.title,
        p.title
      ),
    })
  );

  /* 🛡️ PHASE 10E — KONAKLAMA DÜZENİ ADLARI.
     TR kaynak: villa.bedroom_layout / .bathroom_layout (migration 047,
     mapVilla içinde zaten normalize edilmiş) — DEĞİŞTİRİLMEZ, yalnız
     okunur. Çözümleme lib/villa-layout-translation.helper.ts'in
     index + TR-ad guard'ıyla yapılır; uyuşmazlıkta TR'ye düşülür.
     İki getter de AYNI cache'lenmiş translation satırını kullanır →
     yeni DB sorgusu OLUŞMAZ. */
  const trBedroomNames = (villa.bedroom_layout ?? []).map((r) => r.name);
  const trBathroomNames = (villa.bathroom_layout ?? []).map((b) => b.name);
  const [bedroomNames, bathroomNames] = await Promise.all([
    getVillaTranslatedBedroomNames(villa.id, trBedroomNames, "en"),
    getVillaTranslatedBathroomNames(villa.id, trBathroomNames, "en"),
  ]);

  const locationName = villa.location_id
    ? resolveTranslatedField(
        locationTranslations.get(villa.location_id)?.name,
        villa.location
      )
    : villa.location;

  /* 🛡️ PHASE 10B, Section 9 — TR sayfasındaki AYNI watermark objesi
     (resolveAssetUrlVersioned reuse — hesaplama YOK, yalnız çağrı). */
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

  /* 🛡️ Bucket-fix — TR sayfasındaki AYNI resolveVillaImageUrl reuse. */
  const imageUrls = images
    .map((img) => resolveVillaImageUrl(img.image_url))
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  /* 🛡️ PHASE 10B, Section 9/10 — TR'nin AYNI saf minPrice reduce'u
     (price.engine'e DOKUNULMADI; bu yalnız MobileBookingCta/JSON-LD
     için basit bir görüntüleme türetimi). */
  const minPrice = prices?.length
    ? prices.reduce(
        (acc, pr) =>
          pr.price > 0 && (acc === null || pr.price < acc.price)
            ? { price: Number(pr.price), currency: pr.currency || "TRY" }
            : acc,
        null as { price: number; currency: string } | null
      )
    : null;

  /* 🛡️ PHASE 10B, Section 10 — JSON-LD (locale="en", TR'nin kendi
     JSON-LD'sine DOKUNULMADI). Sayfanın GÖRÜNEN içeriğiyle tutarlı olsun
     diye ÇEVRİLMİŞ title/description kullanılır (TR aynı fonksiyonu
     kendi orijinal TR villa.title/description'ıyla çağırıyor). */
  const vacationRentalLd = buildVacationRental({
    slug: villa.slug || slug,
    title,
    description: stripHtml(description || villa.description),
    images: imageUrls,
    locationName: locationName || null,
    latitude: typeof villa.latitude === "number" ? villa.latitude : null,
    longitude: typeof villa.longitude === "number" ? villa.longitude : null,
    guests: villa.guests,
    bedrooms: villa.bedrooms,
    bathrooms: villa.bathrooms,
    features: translatedFeatures.map((f) => f.displayName).filter(Boolean),
    priceFrom: minPrice
      ? { amount: minPrice.price, currency: minPrice.currency }
      : null,
    aggregateRating:
      reviewStats.count > 0
        ? { ratingValue: reviewStats.average, reviewCount: reviewStats.count }
        : null,
    locale: "en",
  });

  const breadcrumbLd = buildBreadcrumb(
    [
      { name: dict.header.home, url: "/" },
      { name: dict.header.villas, url: "/en/arama" },
      { name: title },
    ],
    "en"
  );

  return (
    <>
      <JsonLd data={vacationRentalLd} />
      <JsonLd data={breadcrumbLd} />

      <div className="max-w-3xl mx-auto px-5 md:px-0 pt-16 md:pt-24 text-center">
        <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
          Villa
        </p>
        <h1 className="font-display text-[28px] md:text-[40px] text-[var(--color-stone-900)] mt-3 leading-tight">
          {title}
        </h1>
      </div>

      {/* 🛡️ PHASE 10B, Section 9 — Gallery (ComingSoon'un YERİNE). */}
      <div className="max-w-3xl mx-auto px-5 md:px-0 mt-8">
        <Gallery
          images={imageUrls}
          watermark={watermark}
          villaTitle={title}
          videos={youtubeVideos}
          locale="en"
        />
      </div>

      {/* 🛡️ PHASE 8B — description overlay. TR sayfasının (kiralik-villa/
          [slug]/page.tsx) description bloğuyla AYNI koşullu desen + AYNI
          sanitize mekanizması. 🛡️ PHASE 10B, Section 9 — boş-durum
          fallback metni ARTIK dictionary'den (locale-aware), TR hardcoded
          metin DEĞİL. */}
      <div className="max-w-3xl mx-auto px-5 md:px-0 mt-8">
        {description && description.trim() ? (
          <CollapsibleDescription
            html={sanitizeHtml(description)}
            collapsible={stripHtml(description).trim().length > 280}
          />
        ) : (
          <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
            <span className="italic text-[var(--color-stone-400)]">
              {dict.villa.descriptionEmpty}
            </span>
          </div>
        )}
      </div>

      {/* 🛡️ PHASE 8D-2 — location/distances/features/priceIncludes/rules.
          TR'deki sıra korunuyor. VillaDetailTabs (use client,
          fiyatlar/musaitlik prop'ları zorunlu) KULLANILMIYOR — audit'in
          onaylanan kararı gereği düz/art arda section'lar.
          🛡️ PHASE 10B, Section 9 — PriceList/AvailabilityInlineCalendar/
          BookingSidebar AYNI akışa, AYNI düz/art arda desenle eklendi
          (TR'nin VillaDetailTabs sekme yapısı KOPYALANMADI — kullanıcı
          talimatının açık kısıtı). */}
      <div className="max-w-3xl mx-auto px-5 md:px-0 mt-10 space-y-10">
        <VillaInfoBar
          villaTitle={title}
          location={locationName}
          guests={villa.guests}
          bedrooms={villa.bedrooms}
          bathrooms={villa.bathrooms}
          tourismDocumentNumber={villa.tourism_document_number}
        />

        <PriceList
          prices={prices}
          minimumStayNights={villa.minimum_stay_nights ?? null}
          deposit={villa.deposit ?? null}
          discounts={discounts}
          locale="en"
        />

        <div className="overflow-x-auto">
          <AvailabilityInlineCalendar
            villaId={villa.id}
            prices={prices}
            externalBlocks={externalBlocks}
            locale="en"
          />
        </div>

        <VillaDistancesSection distances={translatedDistances} />
        <VillaFeaturesSection features={translatedFeatures} />

        {/* 🛡️ PHASE 10E — TR sayfasındaki AYNI sıra (özellikler →
            konaklama düzeni). Veri yoksa component null döner →
            section hiç çizilmez (TR ile aynı davranış). */}
        <AccommodationLayout
          bedrooms={villa.bedroom_layout ?? []}
          bathrooms={villa.bathroom_layout ?? []}
          locale="en"
          bedroomNames={bedroomNames}
          bathroomNames={bathroomNames}
        />

        {/* 🛡️ PHASE 10E BATCH 5 — TR sayfasındaki AYNI sıra (konaklama
            düzeni → havuz bilgileri). Havuz yoksa component null döner. */}
        <VillaPoolSection villa={villa} locale="en" />
        <VillaPriceIncludesAndRulesSection
          priceIncludes={translatedPriceIncludes}
          rules={translatedRules}
        />

        {/* 🛡️ PHASE 10B, Section 6/9 — BookingSidebar (useBookingEngine'in
            TEK, PAYLAŞILAN state machine'i — TR/`/v/[token]` ile AYNI).
            Business logic'e (min-stay/orphan-gap/price/discount/prepayment/
            blocked-ranges) DOKUNULMADI; yalnız `locale="en"` prop'u ile UI
            metni/tarih formatı/navigation locale param'ı locale-aware. */}
        <div id="booking-sidebar-en">
          <BookingSidebar
            villaSlug={villa.slug}
            villaId={villa.id}
            externalBlocks={externalBlocks}
            prices={prices}
            discounts={discounts}
            deposit={villa.deposit}
            cleaning_fee={villa.cleaning_fee}
            cleaning_currency={villa.cleaning_currency}
            cleaning_limit={villa.cleaning_limit}
            pool_heating_fee={villa.pool_heating_fee}
            pool_heating_currency={villa.pool_heating_currency}
            pool_heating_months={villa.pool_heating_months}
            custom_prepayment_rate={villa.custom_prepayment_rate ?? null}
            minimum_stay_nights={villa.minimum_stay_nights ?? null}
            orphanGapRuleEnabled={settings?.orphan_gap_rule_enabled ?? true}
            locale="en"
          />
        </div>
      </div>

      {/* 🛡️ PHASE 10B, Section 8/9 — MobileBookingCta (yalnız <lg,
          TR'deki AYNI davranış). */}
      <MobileBookingCta
        priceAmount={minPrice?.price ?? null}
        priceCurrency={minPrice?.currency ?? null}
        targetId="booking-sidebar-en"
        locale="en"
      />
    </>
  );
}
