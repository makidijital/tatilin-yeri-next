import type { Metadata, Viewport } from "next";
import { Montserrat, Manrope, Inter, Fraunces, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";

import { CurrencyProvider } from "@/app/context/CurrencyContext";
import { getCachedSettings } from "@/lib/cache.helpers";
import { siteMetadataBase } from "@/lib/seo";
import { resolveAssetUrlVersioned } from "@/lib/storage.helpers";

/* 🛡️ PUBLIC BODY/UI FONT — Montserrat. Global `--font-sans` buna
   bağlanır. next/font self-host + display:swap + adjustFontFallback
   (default) → CLS minimal. Admin gövde Inter'de kalır (aşağıda pin). */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
});

/* 🛡️ PUBLIC DISPLAY/HEADING FONT — Manrope (modern premium geometric
   sans). Global `--font-display` token'ı buna bağlanır; admin
   `.admin-shell` içinde Fraunces'e pinli kalır. */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

/* 🛡️ Inter — YALNIZ admin gövde tipografisi için korunur. Public gövde
   Montserrat'a geçti; admin `.admin-shell --font-sans` Inter'e pinli
   (admin typography'ye dokunulmadı). */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
  axes: ["opsz", "SOFT"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

/* ===============================================================
   🛡️ ROOT VIEWPORT — viewport-fit=cover (safe-area aktivasyonu)
   ===============================================================
   `viewportFit: "cover"` olmadan `env(safe-area-inset-*)` iOS'ta 0
   döner; bu yüzden BottomNav / SearchBottomSheet / MobileBookingCta /
   SuccessModal içindeki `pb-[env(safe-area-inset-bottom)]` etkisizdi
   (çentikli iPhone'da alt home-indicator şeridi boş kalıyordu). cover
   ile bu padding'ler amaçlandığı gibi çalışır → mobil fixed bar'lar
   home-indicator'a kadar tam yapışır, alt boşluk kapanır. width /
   initialScale Next default'larıyla aynı (davranış değişmez). */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/* ===============================================================
   🛡️ ROOT METADATA — settings-driven SEO fallback chain
   ===============================================================
   Fallback öncelikliği:
     page-specific generateMetadata (varsa)
       → settings.default_meta_title / description / og_image
         → bu dosyadaki hardcoded fallback
   Robots: settings.robots_index / robots_follow → default true/true.
   Verification: google / yandex / bing — meta tag olarak.
   theme-color: settings.browser_theme_color veya default.
   Icons: settings.favicon_url. Statik `app/favicon.ico` convention
   dosyası kasten YOK — eskiden Next auto-inject ettiği o link admin
   settings'ten yüklenen favicon'u override ediyordu (browser önce
   `/favicon.ico` hash'li URL'i çekiyor, settings link'ini ignore
   ediyordu). Artık tek favicon kaynağı settings; admin upload anında
   yeni URL metadata'ya yansır. favicon_url boşsa hiç link emit
   edilmez (browser default boş icon).
   =============================================================== */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getCachedSettings().catch(() => null);
  const title =
    settings?.default_meta_title?.trim() || "Villa Kiralama — Lüks Villa Deneyimi";
  const description =
    settings?.default_meta_description?.trim() ||
    "Akdeniz'in seçkin villalarında özel havuz, deniz manzarası ve butik konfor. Hayalindeki tatili keşfet.";
  /* 🛡️ Aşama A — resolveAssetUrl normalize: FULL URL (legacy) ve
     relative path (yeni) için tutarlı render URL'i üretir. */
  const ogImage =
    resolveAssetUrlVersioned(settings?.default_og_image, settings?.updated_at) ||
    undefined;
  const favicon =
    resolveAssetUrlVersioned(settings?.favicon_url, settings?.updated_at) ||
    undefined;
  const themeColor = settings?.browser_theme_color?.trim() || "#1B1A17";

  const robotsIndex = settings?.robots_index !== false;
  const robotsFollow = settings?.robots_follow !== false;

  const verification: NonNullable<Metadata["verification"]> = {};
  if (settings?.google_site_verification?.trim()) {
    verification.google = settings.google_site_verification.trim();
  }
  if (settings?.yandex_verification?.trim()) {
    verification.yandex = settings.yandex_verification.trim();
  }
  if (settings?.bing_verification?.trim()) {
    /* Bing uses generic `other`. */
    verification.other = {
      "msvalidate.01": settings.bing_verification.trim(),
    };
  }

  return {
    /* 🛡️ metadataBase — TÜM relative canonical/OG URL'lerini canonical
       domain'e çözer (yoksa Next localhost'a düşerdi). Yalnız
       NEXT_PUBLIC_SITE_URL'den; preview/VERCEL domain canonical'a sızmaz. */
    metadataBase: siteMetadataBase(),
    title,
    description,
    robots: {
      index: robotsIndex,
      follow: robotsFollow,
    },
    openGraph: {
      type: "website",
      title,
      description,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    ...(Object.keys(verification).length ? { verification } : {}),
    ...(favicon ? { icons: { icon: favicon } } : {}),
    other: {
      "theme-color": themeColor,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getCachedSettings().catch(() => null);
  const gtmId = settings?.gtm_container_id?.trim();
  const customHead = settings?.custom_head_scripts?.trim();
  const analyticsScript = settings?.analytics_script?.trim();

  return (
    <html
      lang="tr"
      className={`${montserrat.variable} ${manrope.variable} ${inter.variable} ${fraunces.variable} ${geistMono.variable}`}
    >
      <head>
        {/* 🛡️ Custom head HTML — admin tarafından kontrol edilen
           raw inject. XSS vektör; sadece admin'in girdiği güvenilir
           HTML. dangerouslySetInnerHTML kullanılır. */}
        {customHead ? (
          <div
            // eslint-disable-next-line react/no-unknown-property
            dangerouslySetInnerHTML={{ __html: customHead }}
          />
        ) : null}
      </head>
      <body className="min-h-screen bg-[var(--color-ivory)] text-[var(--color-stone-900)] antialiased font-sans">
        {/* 🛡️ GTM Container — admin GTM-ID girdiğinde otomatik load.
           next/script `afterInteractive` → main bundle'ı bloklamaz. */}
        {gtmId ? (
          <Script id="gtm-init" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','${gtmId}');`}
          </Script>
        ) : null}
        {/* 🛡️ Custom analytics script — admin raw HTML. */}
        {analyticsScript ? (
          <div
            // eslint-disable-next-line react/no-unknown-property
            dangerouslySetInnerHTML={{ __html: analyticsScript }}
          />
        ) : null}
        <CurrencyProvider>{children}</CurrencyProvider>
      </body>
    </html>
  );
}
