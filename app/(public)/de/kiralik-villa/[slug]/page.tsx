import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import { getVillaBySlug } from "@/app/services/villa.service";
import {
  getVillaTranslatedTitle,
  getVillaTranslatedDescription,
  getVillaTranslatedSeoDescription,
} from "@/lib/i18n/get-villa-translation.server";
/* 🛡️ PHASE 8D-2 — batch translation okuma (8D-1) + generic fallback. */
import {
  getTranslationsForParents,
  resolveTranslatedField,
} from "@/lib/i18n/get-translation.server";
import { getCachedSettings } from "@/lib/cache.helpers";
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
import VillaInfoBar from "@/app/components/villa/VillaInfoBar";
import VillaDistancesSection, {
  type TranslatedDistance,
} from "@/app/components/villa/VillaDistancesSection";
import VillaFeaturesSection, {
  type TranslatedFeature,
} from "@/app/components/villa/VillaFeaturesSection";
import VillaPriceIncludesAndRulesSection, {
  type TranslatedPriceInclude,
  type TranslatedRule,
} from "@/app/components/villa/VillaPriceIncludesAndRulesSection";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /de/kiralik-villa/[slug] — PHASE 4A (Public Locale Routing Core)
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

   CANONICAL: Phase 7B'nin `buildLocaleAlternates(trPath, "de")`'i
   TEK kaynak — URL'ler elle birleştirilmedi. HREFLANG (`languages`):
   yalnız `multilingual_enabled=true` iken eklenir (flag false iken
   zaten bu route notFound() ile kapanıyor — var olmayan/404 URL'lere
   işaret eden hreflang ÜRETİLMEZ, bkz. Phase 7A audit §4/§12).

   ROBOTS: BU FAZDA DEĞİŞMEDİ — hâlâ koşulsuz `{index:false,follow:false}`
   (görev tanımı §4: "robots/noindex davranışına dokunma"). `multilingual_enabled`
   true olsa BİLE bu sayfa hâlâ noindex kalır; robots'un flag'e/villa'ya
   bağlanması AYRI, gelecek bir fazın konusu (Phase 7A audit §10, Phase 7E).

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
      title: "Villa nicht gefunden",
      robots: { index: false, follow: false },
    };
  }

  const title = await getVillaTranslatedTitle(villa.id, villa.title, "de");
  /* 🛡️ PHASE 8C — title ile AYNI getVillaTranslationCached(villa.id,"de")
     çağrısını reuse eder (React cache() request-scoped dedupe);
     seo_description için AYRI bir DB sorgusu EKLENMEZ. Yalnız
     `metadata.description` için kullanılır — openGraph/twitter'a
     EKLENMEZ (Phase 7C zaten EN/DE'de bu alanları hiç eklememişti,
     bu fazın kapsamı değil). */
  const description = await getVillaTranslatedSeoDescription(
    villa.id,
    villa.seo_description,
    villa.description,
    "de"
  );
  const trCanonicalPath = `/kiralik-villa/${villa.slug || slug}`;
  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    trCanonicalPath,
    "de"
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

export default async function DeVillaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();

  const { slug } = await params;
  const villa = await getVillaBySlugCached(slug);
  if (!villa) {
    notFound();
  }

  const title = await getVillaTranslatedTitle(villa.id, villa.title, "de");
  /* 🛡️ PHASE 8B — title ile AYNI getVillaTranslationCached(villa.id,"de")
     çağrısını reuse eder (React cache() request-scoped dedupe);
     description için AYRI bir DB sorgusu EKLENMEZ. */
  const description = await getVillaTranslatedDescription(
    villa.id,
    villa.description,
    "de"
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

  /* 🛡️ PHASE 8D-2 — koleksiyon başına TAM 1 batch çeviri sorgusu
     (Phase 8D-1 `getTranslationsForParents`, `.in()` ile) — item
     başına sorgu YOK (N+1 önlendi). `location_id` null ise villa_location
     sorgusu HİÇ atılmaz (audit hedefi: "location için en fazla 1 query"). */
  const [
    distanceTranslations,
    featureTranslations,
    ruleTranslations,
    priceIncludeTranslations,
    locationTranslations,
  ] = await Promise.all([
    getTranslationsForParents(
      "villa_distance",
      distances.map((d) => d.id),
      "de"
    ),
    getTranslationsForParents(
      "villa_feature",
      features.map((f) => f.id),
      "de"
    ),
    getTranslationsForParents("rule_item", rules.map((r) => r.id), "de"),
    getTranslationsForParents(
      "price_include_item",
      priceIncludes.map((p) => p.id),
      "de"
    ),
    villa.location_id
      ? getTranslationsForParents(
          "villa_location",
          [villa.location_id],
          "de"
        )
      : Promise.resolve(new Map()),
  ]);

  /* 🛡️ ICON KEY — ORİJİNAL (TR) d.title'dan hesaplanır, ÇEVRİLMİŞ
     displayTitle'dan DEĞİL (bkz. dosya başı yorum + VillaDistancesSection). */
  const translatedDistances: TranslatedDistance[] = distances.map((d) => ({
    id: d.id,
    displayTitle: resolveTranslatedField(
      distanceTranslations.get(d.id)?.title,
      d.title
    ),
    displayDistance: resolveTranslatedField(
      distanceTranslations.get(d.id)?.distance,
      d.distance
    ),
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

  const locationName = villa.location_id
    ? resolveTranslatedField(
        locationTranslations.get(villa.location_id)?.name,
        villa.location
      )
    : villa.location;

  return (
    <>
      <div className="max-w-3xl mx-auto px-5 md:px-0 pt-16 md:pt-24 text-center">
        <p className="text-[11px] tracking-[0.28em] uppercase font-medium text-[var(--color-stone-500)]">
          Villa
        </p>
        <h1 className="font-display text-[28px] md:text-[40px] text-[var(--color-stone-900)] mt-3 leading-tight">
          {title}
        </h1>
      </div>
      {/* 🛡️ PHASE 8B — description overlay. TR sayfasının (kiralik-villa/
          [slug]/page.tsx) description bloğuyla AYNI koşullu desen + AYNI
          sanitize mekanizması + AYNI hardcoded fallback metni
          ("Açıklama bulunmuyor" — bu faz hardcoded UI'a dokunmuyor). */}
      <div className="max-w-3xl mx-auto px-5 md:px-0 mt-8">
        {description && description.trim() ? (
          <CollapsibleDescription
            html={sanitizeHtml(description)}
            collapsible={stripHtml(description).trim().length > 280}
          />
        ) : (
          <div className="card-premium mt-5 p-6 md:p-7 text-[var(--color-stone-600)] leading-[1.75] text-[15px]">
            <span className="italic text-[var(--color-stone-400)]">
              Açıklama bulunmuyor
            </span>
          </div>
        )}
      </div>
      {/* 🛡️ PHASE 8D-2 — location/distances/features/priceIncludes/rules.
          TR'deki sıra korunuyor. VillaDetailTabs (use client,
          fiyatlar/musaitlik prop'ları zorunlu) KULLANILMIYOR — audit'in
          onaylanan kararı gereği düz/art arda section'lar. */}
      <div className="max-w-3xl mx-auto px-5 md:px-0 mt-10 space-y-10">
        <VillaInfoBar
          villaTitle={title}
          location={locationName}
          guests={villa.guests}
          bedrooms={villa.bedrooms}
          bathrooms={villa.bathrooms}
          tourismDocumentNumber={villa.tourism_document_number}
        />
        <VillaDistancesSection distances={translatedDistances} />
        <VillaFeaturesSection features={translatedFeatures} />
        <VillaPriceIncludesAndRulesSection
          priceIncludes={translatedPriceIncludes}
          rules={translatedRules}
        />
      </div>
      <LocaleRouteComingSoon locale="de" />
    </>
  );
}
