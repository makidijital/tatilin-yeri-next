import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import { getVillaBySlug } from "@/app/services/villa.service";
import { getVillaTranslatedTitle } from "@/lib/i18n/get-villa-translation.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

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

   🛡️ PHASE 6B EKLEMESİ — YALNIZ TITLE:
   `params` artık okunuyor (slug) ve villa `getVillaBySlug` (mevcut,
   DEĞİŞMEMİŞ `villa.service.ts` export'u — `mapVilla`/`VillaDTO`/
   `getVillaBySlugCached` HİÇ dokunulmadı, o TR sayfasına ÖZEL/export
   edilmiyor) ile okunuyor. Görünen title, `getVillaTranslatedTitle`
   (Phase 6B, `lib/i18n/get-villa-translation.server.ts`) ile locale'e
   göre çözülüyor: çeviri varsa çevrilmiş title, yoksa/TR ise `villa.title`
   AYNEN. Description/badge/SEO/tam villa detay deneyimi BU FAZDA YOK —
   `LocaleRouteComingSoon` (DEĞİŞMEDİ) hâlâ "çevrilmedi" notunu gösteriyor;
   yalnız title'ın üstüne eklendi. `generateMetadata` YOK (bu faz yalnız
   page body — SEO sonraki bir fazın konusu). Villa bulunamazsa (geçersiz
   slug) `notFound()` (TR sayfasının kendi özel "Villa bulunamadı" bloğu
   BURAYA kopyalanmadı — kapsam dışı, standart 404 akışı reuse edildi).
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EnVillaDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();

  const { slug } = await params;
  const villa = await getVillaBySlug(slug);
  if (!villa) {
    notFound();
  }

  const title = await getVillaTranslatedTitle(villa.id, villa.title, "en");

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
      <LocaleRouteComingSoon locale="en" />
    </>
  );
}
