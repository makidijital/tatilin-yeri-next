import type { NextConfig } from "next";

/* ===============================================================
   🛡️ NEXT.JS CONFIG
   ===============================================================
   Supabase Storage URL'leri için next/image remote pattern.
   Hostname `NEXT_PUBLIC_SUPABASE_URL` env'inden build-time'da
   parse edilir; env yoksa wildcard fallback (`**.supabase.co`)
   ile preview build'ler de çalışır.

   Path pattern `/storage/v1/object/public/**` → public bucket'ları
   kapsar (site-assets/category-covers, location-covers, hero, vs.).
   Private bucket'lar `/storage/v1/object/sign/...` farklı path —
   ileride gerekirse ayrıca eklenir.
   =============================================================== */
const supabaseUrlEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHost = "**.supabase.co";
try {
  if (supabaseUrlEnv) {
    supabaseHost = new URL(supabaseUrlEnv).hostname;
  }
} catch {
  // env malformed → wildcard fallback
}

/* ===============================================================
   🛡️ FAZ B — CDN HOST'LARI (next/image remote patterns)
   ===============================================================
   STORAGE_DRIVER=r2 iken görseller cdn/assets.villayagel.com'dan
   gelir; next/image bu host'ları tanımalı. Supabase host KORUNUR
   (dual-host → geçiş + rollback güvenli). Host'lar env'den türetilir;
   env yoksa proje default'larına düşer.
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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
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
