import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /en — PHASE 4A KALIBI (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/page.tsx (DEĞİŞMEDİ). Anasayfa
   mantığı/içeriği bu fazda BURAYA taşınmadı/kopyalanmadı — yalnız
   routing altyapısı, diğer 8 /en/*, /de/* route'uyla (arama,
   kiralik-villalar, kiralik-villa/[slug], rezervasyon/[slug])
   BİREBİR AYNI kalıp. `multilingual_enabled=false` olduğu sürece
   (bugün production) notFound() → 404.

   🛡️ PHASE 10C — Header dil değiştiricisinin "/" → "/en" → "/de"
   hedefinin 404 üretmemesi için eklendi (bkz. lib/i18n/seo-alternates.ts
   `buildLocaleAlternates` zaten "/" path'ini destekliyordu; eksik olan
   yalnız bu route dosyasının kendisiydi). `setRequestLocale(locale)`
   — bu request için locale'i işaretler (lib/i18n/request-locale.server.ts,
   React `cache()` request-scoped store). Diğer 8 route'un ÜSTYAZISIYLA
   AYNI davranış: PHASE 4A gate + placeholder DEĞİŞMEDİ.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EnHomePage() {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="en" />;
}
