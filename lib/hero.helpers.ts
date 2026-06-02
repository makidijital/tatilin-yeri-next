import type { Settings } from "@/app/services/settings.service";
import { resolveAssetUrl } from "@/lib/storage.helpers";

/* ===============================================================
   🛡️ HOMEPAGE HERO — RESOLVER + DEFAULTS
   ===============================================================
   Hero.tsx ve admin Settings ekranı bu helper'ı tek source-of-truth
   olarak kullanır. Hiçbir setting alanı kırılgan değil; her biri
   eksikse hardcoded default'a fallback eder. Hero hiçbir durumda
   kırılmaz.

   `hero_enabled === false` özel durumu: admin'in "varsayılan görünüme
   dön" anahtarı. Tek satırda tüm custom alanlar bypass edilir,
   defaults render olur. Saved data DB'de korunur (tekrar açınca
   geri gelir) — destructive değil.

   SSR-FIRST: bu fonksiyon pure; server'da `getSettings()` sonucu
   bir kez çağrılır, prop olarak Hero'ya geçer. Client tarafında
   hydration sırasında aynı obje JSON olarak rebuild edilir →
   hydration mismatch yok.
   =============================================================== */

/** Hardcoded defaults — Hero.tsx'in mevcut hardcoded değerleriyle
    BİREBİR aynı. Migration / settings boş tabloda olsa bile homepage
    önceki versiyonla görsel olarak özdeş kalır. */
export const HERO_DEFAULTS = {
  badge: "Akdeniz Collection",
  /* Title için \n ile iki satır: birinci satır beyaz, sonraki
     satırlar text-white/85 (mevcut "Sessizce / olağanüstü." görselinin
     parity'si). */
  title: "Sessizce\nolağanüstü.",
  subtitle:
    "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Her detay, bir konaklamadan fazlasını sunmak için tasarlandı.",
  backgroundImage:
    "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=2400&auto=format&fit=crop",
  /* 1.0 = mevcut full overlay; daha düşük = arka plan daha açık.
     Hero.tsx içindeki iki gradient bu çarpan ile zayıflatılır. */
  overlayOpacity: 1,
} as const;

/** Frontend Hero'nun beklediği şekil — resolveHeroContent çıktısı. */
export type HeroContent = {
  enabled: boolean;
  badge: string;
  title: string; // \n ile çok-satırlı olabilir
  subtitle: string;
  backgroundImage: string;
  /** 0..1 arası; 1 = full overlay (default), 0 = overlay yok. */
  overlayOpacity: number;
  /** İsteğe bağlı CTA'lar; ikisi de doluysa render edilir. */
  primaryCta: { text: string; href: string } | null;
  secondaryCta: { text: string; href: string } | null;
};

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function pickStr(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const t = v.trim();
  return t.length > 0 ? v : fallback;
}

function pickCta(
  text: unknown,
  href: unknown
): { text: string; href: string } | null {
  if (typeof text !== "string" || typeof href !== "string") return null;
  const t = text.trim();
  const h = href.trim();
  if (!t || !h) return null;
  return { text: t, href: h };
}

/**
 * Append a cache-busting `?ts=` query param to a URL.
 * Only used for ADMIN-UPLOADED hero images (which sit at a fixed
 * Supabase storage path: `hero/homepage-hero.webp`). DB stores
 * the clean URL; this helper produces the render-time URL.
 *
 * Default fallback (Unsplash) URL is NOT busted — already
 * versioned by the third-party CDN.
 */
function withCacheBust(url: string, cacheKey: string | number): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}ts=${cacheKey}`;
}

/**
 * `settings` null olabilir (tablo boş, fetch error). Bu durumda
 * tamamen defaults dönülür → Hero kırılmaz.
 *
 * `hero_enabled === false`: defaults ZORLAR. Diğer hero_* alanları
 * yok sayılır. (Saved data DB'de korunur; reset toggle gibi davranır.)
 *
 * `options.cacheKey`: opsiyonel; verilirse VE admin'in upload ettiği
 * custom bir image varsa, render URL'ine `?ts=<cacheKey>` eklenir.
 * Default Unsplash fallback URL'ine eklenmez. Server tarafında
 * çağırılarak (örn. /page.tsx içinde Date.now()) hydration-safe.
 */
export function resolveHeroContent(
  settings: Settings | null | undefined,
  options?: { cacheKey?: string | number }
): HeroContent {
  if (!settings || settings.hero_enabled === false) {
    return {
      enabled: settings ? settings.hero_enabled !== false : true,
      badge: HERO_DEFAULTS.badge,
      title: HERO_DEFAULTS.title,
      subtitle: HERO_DEFAULTS.subtitle,
      backgroundImage: HERO_DEFAULTS.backgroundImage,
      overlayOpacity: HERO_DEFAULTS.overlayOpacity,
      primaryCta: null,
      secondaryCta: null,
    };
  }

  /* Image resolution + cache-busting:
       - Admin custom upload varsa → temiz URL + ?ts=<cacheKey>
       - Custom upload yoksa → default Unsplash URL (cache-bust YOK)
     🛡️ Aşama A — `resolveAssetUrl` normalize: settings.hero_background_image
        HEM FULL URL (legacy) HEM relative path (yeni) olabilir. HTTP(S)
        prefix'li değerler pass-through; relative path'ler runtime'da
        getPublicUrl ile URL'e çevrilir. Mevcut DB içeriği için byte-
        identical davranış (FULL URL ise aynen geri döner). */
  const customImage = resolveAssetUrl(settings.hero_background_image) ?? "";
  const hasCustomImage = customImage.length > 0;
  const baseImage = hasCustomImage ? customImage : HERO_DEFAULTS.backgroundImage;
  const backgroundImage =
    hasCustomImage && options?.cacheKey !== undefined
      ? withCacheBust(baseImage, options.cacheKey)
      : baseImage;

  return {
    enabled: true,
    badge: pickStr(settings.hero_badge_text, HERO_DEFAULTS.badge),
    title: pickStr(settings.hero_title, HERO_DEFAULTS.title),
    subtitle: pickStr(settings.hero_subtitle, HERO_DEFAULTS.subtitle),
    backgroundImage,
    overlayOpacity: clamp01(
      settings.hero_overlay_opacity,
      HERO_DEFAULTS.overlayOpacity
    ),
    primaryCta: pickCta(
      settings.hero_primary_cta_text,
      settings.hero_primary_cta_href
    ),
    secondaryCta: pickCta(
      settings.hero_secondary_cta_text,
      settings.hero_secondary_cta_href
    ),
  };
}
