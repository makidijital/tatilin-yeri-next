/* ===============================================================
   🛡️ LOCALE SWITCH HELPER — PHASE 10C (TopBar dil değiştirici)
   ===============================================================
   AMAÇ: TopBar'daki dil değiştiricinin hedef URL'lerini üretmek.
   `buildLocaleAlternates()` (lib/i18n/seo-alternates.ts, Phase 7B)
   SAF bir path-şekillendirme fonksiyonu — hangi path'lerin GERÇEKTEN
   bir `/en`/`/de` route dosyasına sahip olduğunu BİLMİYOR/KONTROL
   ETMİYOR (bilinçli tasarım, kendi dosyasındaki yorumda açık).
   Bu dosya o eksik parçayı — "bu path'in bir locale route karşılığı
   var mı?" sorusunu — SAF ve MİNİMAL bir allowlist ile cevaplar.

   `buildLocaleAlternates` YENıDEN YAZILMADI/KOPYALANMADI — burada
   yalnız import edilip reuse edilir. `localeFromPathname` de burada
   KULLANILMAZ (bu dosyanın işi hedef tespiti değil, hedef URL
   üretimi — TopBar zaten kendi aktif locale'ini `localeFromPathname`
   ile ayrı tespit ediyor/edecek).

   ROUTE ALLOWLIST — yalnız BUGÜN gerçekten var olan `/en`/`/de` route
   dosyalarını yansıtır (bkz. `app/(public)/en|de/*`):
     - "/"                  → app/(public)/en|de/page.tsx (Phase 10C stub)
     - "/arama"             → app/(public)/en|de/arama/page.tsx (ComingSoon)
     - "/kiralik-villalar"  → app/(public)/en|de/kiralik-villalar/page.tsx (ComingSoon)
     - "/kiralik-villa/*"   → app/(public)/en|de/kiralik-villa/[slug]/page.tsx (Phase 10B, GERÇEK içerik)
     - "/rezervasyon/*"     → app/(public)/en|de/rezervasyon/[slug]/page.tsx (Phase 10B, GERÇEK içerik)
     - "/p/*"               → app/(public)/en|de/p/[slug]/page.tsx (Phase 12D, GERÇEK içerik)
   Yeni bir `/en`/`/de` route eklendiğinde bu liste GÜNCELLENMELİ —
   aksi halde o route için dil değiştirici (bilinçli, güvenli tarafta
   kalarak) ana sayfaya fallback yapar; bu 404/broken-link ÜRETMEZ,
   yalnız o yeni sayfanın locale karşılığını henüz "bilmiyor" olur.

   FALLBACK STRATEJİSİ (kullanıcı onayı: "Hedef locale'in ana sayfasına
   yönlendir"): allowlist'te olmayan bir base path için hedef locale'in
   KÖK sayfası döner (`/`, `/en`, `/de`) — asla 404/broken URL.
   =============================================================== */

import { buildLocaleAlternates } from "@/lib/i18n/seo-alternates";
import type { Locale } from "@/lib/i18n/config";

/** Tam segment eşleşmesi gereken (alt-sayfası olmayan) route'lar. */
const EXACT_LOCALE_ROUTED_PATHS: readonly string[] = [
  "/",
  "/arama",
  "/kiralik-villalar",
];

/** Dinamik segment taşıyan (ör. `[slug]`) route'ların base prefix'leri.
 *  Yalnız prefix'ten SONRA en az bir karakter (gerçek bir slug) varsa
 *  eşleşir — bare `/kiralik-villa/` (slug'sız) route olarak SAYILMAZ. */
const PREFIXED_LOCALE_ROUTED_PATHS: readonly string[] = [
  "/kiralik-villa/",
  "/rezervasyon/",
  /* 🛡️ PHASE 12D — app/(public)/en|de/p/[slug]/page.tsx (GERÇEK içerik,
     `page_translations` okur). Bu dosyanın üstyazısındaki bakım kuralı:
     "Yeni bir /en//de route eklendiğinde bu liste GÜNCELLENMELİ". */
  "/p/",
];

/**
 * Verilen (prefix'siz, TR-eşdeğeri) base path için gerçekten bir
 * `/en`/`/de` route dosyası var mı? Saf, senkron, allowlist-tabanlı.
 */
export function hasLocaleRoute(basePath: string): boolean {
  if (EXACT_LOCALE_ROUTED_PATHS.includes(basePath)) {
    return true;
  }
  return PREFIXED_LOCALE_ROUTED_PATHS.some(
    (prefix) => basePath.startsWith(prefix) && basePath.length > prefix.length
  );
}

/**
 * Mevcut pathname için her locale'in hedef URL'ini üretir — TopBar'ın
 * dil değiştirici linkleri için. `buildLocaleAlternates` (Phase 7B)
 * ile TR-eşdeğeri base path'i türetir; bu base path'in gerçek bir
 * locale route'u varsa (`hasLocaleRoute`) o route'un 3 locale
 * varyantını, YOKSA (fallback) her locale'in kök sayfasını döner
 * (`/`, `/en`, `/de`) — ASLA 404/broken URL üretmez.
 */
export function getLocaleSwitchTargets(
  pathname: string | null | undefined
): Record<Locale, string> {
  const { languages } = buildLocaleAlternates(pathname || "/", "tr");
  const basePath = languages.tr;

  if (hasLocaleRoute(basePath)) {
    return { tr: languages.tr, en: languages.en, de: languages.de };
  }

  return { tr: "/", en: "/en", de: "/de" };
}
