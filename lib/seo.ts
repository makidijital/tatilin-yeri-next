/* ===============================================================
   🛡️ SEO — site URL + metadataBase standardizasyonu (tek kaynak)
   ===============================================================
   AMAÇ:
     SITE_URL mantığı StructuredData / sitemap.ts / robots.ts /
     kiralik-villalar içinde dağınıktı. Bu modül canonical/metadataBase
     için TEK source-of-truth sağlar.

   İKİ AYRI KAVRAM (bilinçli):
     • SITE_URL — genel kullanım (sitemap/robots base). VERCEL_URL
       fallback'i dahil (preview deploy'larda da bir base olsun diye).
     • siteMetadataBase() — CANONICAL domain. YALNIZ explicit
       NEXT_PUBLIC_SITE_URL. Preview/VERCEL domain'i canonical'a ASLA
       sızmasın diye fallback YOK. Tanımsızsa undefined → Next default
       (prod'da NEXT_PUBLIC_SITE_URL set EDİLMELİ).

   ⚠️ Canonical neden VERCEL_URL kullanmamalı:
     VERCEL_URL preview/deploy domain'idir (proje-hash.vercel.app) ve
     şema-sizdir. Canonical'a girerse arama motoru yanlış domain'i
     kanonik sanar (duplicate-domain). Bu yüzden metadataBase yalnız
     gerçek canonical domain'den türetilir.
   =============================================================== */

/** Genel site URL — sitemap/robots base. VERCEL_URL fallback dahil. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  ""
).replace(/\/+$/, "");

/**
 * Canonical metadataBase — YALNIZ NEXT_PUBLIC_SITE_URL'den.
 * - Şema yoksa `https://` eklenir.
 * - Geçersiz/eksikse `undefined` (Next default; canonical'a yanlış
 *   domain BASILMAZ).
 * - `new URL` ASLA throw etmez (try/catch guard).
 */
export function siteMetadataBase(): URL | undefined {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (!raw) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return undefined;
  }
}
