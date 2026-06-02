import * as Sentry from "@sentry/nextjs";

/* ===============================================================
   🛡️ SENTRY EDGE CONFIG — ERROR-ONLY (MINIMAL FAZ)
   ===============================================================
   Edge runtime (middleware + edge route handlers) için minimal
   Sentry init. Middleware'imiz `runtime: "nodejs"` değil — Next
   default edge runtime kullanıyor (matcher `/maki-admin/:path*`).
   Burada error capture aktif olur.

   ⚠️ DAVRANIŞ:
     • DSN yoksa no-op.
     • Tracing/profile KAPALI.
     • Mevcut middleware logic (Supabase SSR session refresh +
       marker cookie redirect) AYNEN.
=============================================================== */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0,
  debug: false,
  environment: process.env.NODE_ENV,

  /* Edge'de noise az; aynı list server config ile parity için. */
  ignoreErrors: ["AbortError", "Unauthorized"],
});
