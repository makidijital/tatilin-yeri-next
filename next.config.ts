import type { NextConfig } from "next";

/* ===============================================================
   🛡️ NEXT.JS CONFIG — next/image remote patterns
   ===============================================================
   Görseller Cloudflare R2'den, CDN host'ları üzerinden servis edilir.
   Host'lar env'den türetilir; env yoksa proje default'larına düşer.
   =============================================================== */
function hostFromBase(
  base: string | undefined,
  fallback: string
): string {
  try {
    return base ? new URL(base).hostname : fallback;
  } catch {
    return fallback;
  }
}
const villaImagesCdnHost = hostFromBase(
  process.env.NEXT_PUBLIC_CDN_BASE_VILLA_IMAGES,
  "cdn.villayagel.com"
);
const siteAssetsCdnHost = hostFromBase(
  process.env.NEXT_PUBLIC_CDN_BASE_SITE_ASSETS,
  "assets.villayagel.com"
);

const cdnHosts = Array.from(
  new Set([villaImagesCdnHost, siteAssetsCdnHost])
).filter(Boolean);

/* ⚠️ LEGACY ASSET HOST — GEÇİCİ, VERİ TEMİZLİĞİ BEKLİYOR
   Veritabanındaki bazı asset alanları (villa_images.image_url,
   settings.site_logo/favicon/default_og_image/watermark_logo,
   pages.cover_image, villa_types/villa_locations.cover_image) hâlâ
   ESKİ SAĞLAYICININ tam URL'ini tutuyor olabilir; `resolveAssetUrl`
   ve `parseVillaStorageUrl` bu değerleri bilinçli olarak pass-through
   eder (bkz. lib/storage.helpers.ts, lib/villa-image.helpers.ts).
   Bu pattern kaldırılırsa `next/image` o satırlar için HARD ERROR verir.

   KALDIRMA KOŞULU: DB'deki tüm asset alanları R2 bucket-relative
   path'e normalize edildikten SONRA bu blok silinebilir.
   Bu blok hiçbir environment variable OKUMAZ; yalnız statik bir
   wildcard host'tur. */
const LEGACY_ASSET_HOST = "**.supabase.co";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: LEGACY_ASSET_HOST,
        pathname: "/storage/v1/object/public/**",
      },
      /* CDN host'ları — bucket kökü doğrudan serve edilir (path: /**). */
      ...cdnHosts.map((hostname) => ({
        protocol: "https" as const,
        hostname,
        pathname: "/**",
      })),
    ],
  },
};

export default nextConfig;
