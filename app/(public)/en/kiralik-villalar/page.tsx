import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /en/kiralik-villalar — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/kiralik-villalar/page.tsx (DEĞİŞMEDİ).
   Bu dosya yalnız routing altyapısı; listeleme mantığı bu fazda
   BURAYA taşınmadı/kopyalanmadı. `multilingual_enabled=false`
   olduğu sürece (bugün production) notFound() → 404.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EnVillasPage() {
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="en" />;
}
