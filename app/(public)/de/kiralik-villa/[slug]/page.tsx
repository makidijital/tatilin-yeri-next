import type { Metadata } from "next";

import { requirePublicLocaleEnabled } from "@/lib/i18n/public-locale-gate.server";
import { setRequestLocale } from "@/lib/i18n/request-locale.server";
import LocaleRouteComingSoon from "@/app/components/i18n/LocaleRouteComingSoon";

/* ===============================================================
   🛡️ /de/kiralik-villa/[slug] — PHASE 4A (Public Locale Routing Core)
   ===============================================================
   TR karşılığı: app/(public)/kiralik-villa/[slug]/page.tsx (~1000
   satır, DEĞİŞMEDİ). Villa detay veri/komponent akışı bu fazda
   BURAYA kopyalanmadı/refactor edilmedi (görev tanımının açık kısıtı
   — bkz. FALLBACK notu). `params` bu fazda kullanılmıyor; içerik
   üretimi sonraki bir fazın konusu. `multilingual_enabled=false`
   olduğu sürece (bugün production) notFound() → 404 — aynı slug'ın
   TR karşılığı (`/kiralik-villa/[slug]`) bu değişiklikten ETKİLENMEZ.

   🛡️ PHASE 4B EKLEMESİ: `setRequestLocale(locale)` — bu request için
   locale'i işaretler (lib/i18n/request-locale.server.ts, React `cache()`
   request-scoped store). TR route'ları bu store'u hiç yazmadığından
   onlar için `DEFAULT_LOCALE` ("tr") otomatik kalır. Bu satır dışında
   PHASE 4A davranışı (gate + placeholder) DEĞİŞMEDİ.
   =============================================================== */

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function DeVillaDetailPage() {
  setRequestLocale("de");
  await requirePublicLocaleEnabled();
  return <LocaleRouteComingSoon locale="de" />;
}
