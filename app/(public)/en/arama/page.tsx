import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /en/arama — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/arama/page.tsx (DEĞİŞMEDİ). Arama/filtre
   mantığı bu fazda BURAYA taşınmadı/kopyalanmadı — yalnız routing
   altyapısı. `multilingual_enabled=false` olduğu sürece (bugün
   production) notFound() → 404.

   🛡️ PHASE 4B EKLEMESİ: `setRequestLocale(locale)` — bu request için
   locale'i işaretler (lib/i18n/request-locale.server.ts, React `cache()`
   request-scoped store). TR route'ları bu store'u hiç yazmadığından
   onlar için `DEFAULT_LOCALE` ("tr") otomatik kalır. Bu satır dışında
   PHASE 4A davranışı (gate + placeholder) DEĞİŞMEDİ.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EnSearchPage() {
  setRequestLocale("en");
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="en" />;
}
