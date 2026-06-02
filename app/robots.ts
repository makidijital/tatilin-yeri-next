import type { MetadataRoute } from "next";

/* ===============================================================
   🛡️ ROBOTS — Next.js App Router (production-grade crawl policy)
   ===============================================================
   POLİTİKA: "default allow + explicit disallow". Kök (/) crawl'a açık;
   yalnız internal / token / duplicate-risk path'ler kapatılır. Bu,
   indexlenmesi gereken sayfaları (villa detay, CMS, listeleme) ASLA
   yanlışlıkla kapatmaz.

   ALLOW (kapatılmaz — SEO değeri):
     /                       (anasayfa)
     /kiralik-villalar       (villa listesi)
     /kiralik-villa/[slug]   (villa detay — ASLA blocklanmaz)
     /p/[slug]               (CMS sayfaları)
     /iletisim, /teklif-al   (statik/landing)

   DISALLOW (crawl budget + duplicate + gizlilik):
     /maki-admin   → admin panel (indexlenmemeli)
     /api          → API route'ları (içerik değil)
     /arama        → faceted search; sonsuz query permütasyonu + duplicate
     /favoriler    → kullanıcı state + /favoriler/paylas/[token] (prefix kapsar)
     /liste/       → token-bazlı paylaşım listesi (per-user)
     /v/           → voucher (token, gizli)
     /rezervasyon/ → transactional checkout flow (villa detayın thin duplicate'i)

   PREFIX ÇAKIŞMA KONTROLÜ (doğrulandı):
     Hiçbir disallow prefix'i allow route'larıyla çakışmaz.
     Özellikle: `/kiralik-villa/` ve `/kiralik-villalar` AÇIK kalır;
     disallow listesinde `/kiralik-villa*` YOK. Villa sayfaları güvende.
     /v/ /liste/ /rezervasyon/ trailing-slash ile yazıldı (bu segmentlerin
     index page'i yok; yanlış pozitif blok riski yok).

   SITEMAP: absolute URL şart. NEXT_PUBLIC_SITE_URL (sitemap.ts ile aynı
     kaynak). Boşsa sitemap/host alanları OMIT edilir (geçersiz relative
     referans basılmaz) + uyarı loglanır.

   ⚠️ ÖN KOŞUL: NEXT_PUBLIC_SITE_URL prod'da `https://<domain>` olarak
     SET EDİLMELİ. NEXT_PUBLIC_VERCEL_URL fallback şema-siz/preview-domain
     olduğundan production canonical host için GÜVENİLİR DEĞİL (yanlış
     domain'e crawl yönlendirme riski) — yalnız son-çare.

   FUTURE-PROOF: yeni public route eklenince DEFAULT ALLOW olur (kök açık).
     Yalnız yeni bir internal/token/duplicate path çıkarsa buraya disallow
     eklenir. Yeni SEO sayfaları otomatik crawl'a açık kalır.
   =============================================================== */

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_VERCEL_URL ||
  ""
).replace(/\/+$/, "");

export default function robots(): MetadataRoute.Robots {
  if (!SITE_URL) {
    console.warn(
      "[robots] NEXT_PUBLIC_SITE_URL tanımsız — sitemap/host referansı OMIT edildi; prod'da SET EDİLMELİ."
    );
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/maki-admin",
          "/api",
          "/arama",
          "/favoriler",
          "/liste/",
          "/v/",
          "/rezervasyon/",
        ],
      },
    ],
    /* Absolute URL yoksa OMIT — relative sitemap referansı geçersizdir. */
    sitemap: SITE_URL ? `${SITE_URL}/sitemap.xml` : undefined,
    host: SITE_URL || undefined,
  };
}
