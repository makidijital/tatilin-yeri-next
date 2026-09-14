import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /de/rezervasyon/[slug] — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/rezervasyon/[slug]/page.tsx (DEĞİŞMEDİ).
   Rezervasyon formu/fiyat hesaplama akışı bu fazda BURAYA
   kopyalanmadı/refactor edilmedi — price engine ve reservation
   hesaplamalarına KESİNLİKLE dokunulmadı. `params` bu fazda
   kullanılmıyor. `multilingual_enabled=false` olduğu sürece (bugün
   production) notFound() → 404 — TR rezervasyon akışı ETKİLENMEZ.

   NOT: `/rezervasyon-kontrol`, `/rezervasyon/basarili` gibi diğer
   rezervasyon alt-route'ları bu fazın istenen URL listesinde
   YOKTU; kapsamı kendiliğinden genişletmemek için mirror'lanmadı.

   🛡️ PHASE 4B EKLEMESİ: `setRequestLocale(locale)` — bu request için
   locale'i işaretler (lib/i18n/request-locale.server.ts, React `cache()`
   request-scoped store). TR route'ları bu store'u hiç yazmadığından
   onlar için `DEFAULT_LOCALE` ("tr") otomatik kalır. Bu satır dışında
   PHASE 4A davranışı (gate + placeholder) DEĞİŞMEDİ.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DeReservationPage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="de" />;
}
