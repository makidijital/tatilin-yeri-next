import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /de/kiralik-villalar — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/kiralik-villalar/page.tsx (DEĞİŞMEDİ).
   Bu dosya yalnız routing altyapısı; listeleme mantığı bu fazda
   BURAYA taşınmadı/kopyalanmadı. `multilingual_enabled=false`
   olduğu sürece (bugün production) notFound() → 404.

   🛡️ PHASE 4B EKLEMESİ: `setRequestLocale(locale)` — bu request için
   locale'i işaretler (lib/i18n/request-locale.server.ts, React `cache()`
   request-scoped store). TR route'ları bu store'u hiç yazmadığından
   onlar için `DEFAULT_LOCALE` ("tr") otomatik kalır. Bu satır dışında
   PHASE 4A davranışı (gate + placeholder) DEĞİŞMEDİ.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DeVillasPage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="de" />;
}
