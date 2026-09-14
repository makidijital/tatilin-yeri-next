import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /en/arama — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/arama/page.tsx (DEĞİŞMEDİ). Arama/filtre
   mantığı bu fazda BURAYA taşınmadı/kopyalanmadı — yalnız routing
   altyapısı. `multilingual_enabled=false` olduğu sürece (bugün
   production) notFound() → 404.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EnSearchPage() {
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="en" />;
}
