import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaTranslatedTitle } from "@/lib/i18n/get-villa-translation.server";
import { getCachedSettings } from "@/lib/cache.helpers";
import { isMultilingualEnabled } from "@/lib/i18n/config";
import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
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
   AYNEN. Description/badge/tam villa detay deneyimi HÂLÂ YOK —
   `LocaleRouteComingSoon` (DEĞİŞMEDİ) hâlâ "çevrilmedi" notunu
   gösteriyor; yalnız title'ın üstüne eklendi. Villa bulunamazsa
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
   zaten yaptığı AYNI şey — metadata'ya da uygulandı). DESCRIPTION:
   BU FAZDA EKLENMEDİ (görev tanımı §7 — description/badge/seo
   alanlarının geniş çevirisi kapsam dışı) — metadata'da hiç
   set edilmiyor, root layout'un (`app/layout.tsx`) varsayılan
   description'ı miras alınır (Next.js metadata merge davranışı,
   yeni bir mekanizma İCAT EDİLMEDİ).
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
  const trCanonicalPath = `/kiralik-villa/${villa.slug || slug}`;
  const settings = await getCachedSettings().catch(() => null);
  const { canonical, languages } = buildLocaleAlternates(
    trCanonicalPath,
    "de"
  );

  return {
    title,
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
      <LocaleRouteComingSoon locale="de" />
    </>
  );
}
