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

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseHost,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
