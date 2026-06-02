import * as Sentry from "@sentry/nextjs";

/* 🛡️ DIAGNOSTIC PROBE (geçici — Sentry init çalışmıyor sorunu için).
   Browser console'da bu satır görünüyorsa dosya yükleniyor; görünmüyorsa
   Turbopack `instrumentation-client.ts` alias'ını resolve etmiyor demek
   ve `withSentryConfig` next.config.ts wrap zorunlu. Çözüm sonrası bu
   3 satır geri çıkarılmalı. */
// eslint-disable-next-line no-console
console.log(
  "[instrumentation-client] LOADED",
  "DSN_present=" + Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)
);

/* ===============================================================
   🛡️ SENTRY CLIENT INIT — Next.js native file convention
   ===============================================================
   Bu dosya `instrumentation-client.ts` (Next.js 15+ native client
   bootstrap hook). Next.js client bundle'a OTOMATIK ekler;
   `withSentryConfig` ile next.config.ts sarma şartı YOK.

   ⚠️ NEDEN BU İSİM (eski `sentry.client.config.ts` yerine):
     Sentry SDK 10+ `sentry.client.config.ts` dosyasını webpack
     entry inject ederek yüklüyor — ama bu inject yalnız
     `withSentryConfig(nextConfig, ...)` ile sarılmış config'lerde
     çalışıyor. Next 15+ + Turbopack için resmi öneri:
     `instrumentation-client.ts` (Next-native loader).

   ⚠️ DAVRANIŞ:
     • DSN env yoksa Sentry init no-op (SDK graceful skip) →
       runtime etkilenmez; local dev güvenli.
     • Sentry.captureException sadece DSN varsa upload; yoksa
       silent drop + local console log.
     • Mevcut error handling KORUNUR — Sentry observe; throw /
       return davranışı değişmez.

   IGNORE/FILTER POLİTİKASI:
     • `ignoreErrors`: bot/benign noise filter
     • `denyUrls`: browser extension stack'lerini yut
     • Sample rates: traces=0, replays=0, profilesSampleRate yok
=============================================================== */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  /* Trace/replay/profile KAPALI — ilk faz error-only. */
  tracesSampleRate: 0,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  /* Production'da debug log YOK; local dev'de troubleshooting için
     true'ya alabilirsin → init logs + transport hatalarını konsola
     yansıtır. */
  debug: false,

  environment: process.env.NODE_ENV,

  ignoreErrors: [
    /* User-initiated fetch cancellation — kullanıcı sayfa
       değiştirince navigasyon iptali; gerçek hata değil. */
    "AbortError",
    "The user aborted a request",
    "TypeError: Failed to fetch", // bot/scraper + offline cancel
    "Load failed", // Safari network drop
    "NetworkError when attempting to fetch resource",

    /* Browser-side observers — Chrome bug, app code'unda kaynak yok. */
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",

    /* Hydration mismatch'lerini suppress et — prod'da minor visual,
       dev'de Next overlay zaten gösteriyor. */
    "Hydration failed",
    "There was an error while hydrating",

    /* Browser extensions: MetaMask, AdBlock vb. App code değil. */
    /chrome-extension:\/\//i,
    /moz-extension:\/\//i,
  ],

  denyUrls: [
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^safari-extension:\/\//,
    /^safari-web-extension:\/\//,
  ],
});

/* 🛡️ Next.js 15+ router transition errors otomatik capture.
   Bu satır olmadan client navigasyon sırasındaki hatalar yakalanmaz;
   Sentry resmi pattern (no-op if SDK doesn't export). */
export const onRouterTransitionStart =
  Sentry.captureRouterTransitionStart;
