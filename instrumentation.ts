import * as Sentry from "@sentry/nextjs";

/* ===============================================================
   🛡️ NEXT.JS INSTRUMENTATION HOOK — SENTRY (ERROR-ONLY FAZ)
   ===============================================================
   Next 13+ official "instrumentation.ts" hook. Build + start
   sırasında bir kez çalışır; runtime'a göre uygun Sentry config'i
   yükler.

   ⚠️ DAVRANIŞ:
     • Bu dosya OLMASA bile Sentry'nin sentry.{client,server,edge}.
       config.ts dosyaları otomatik yüklenir (Next + Sentry wizard
       konvansiyonu). Ama explicit register() hook hem source map
       hem runtime detection için canonical pattern.
     • DSN yoksa Sentry init no-op; runtime davranışı etkilenmez.

   `onRequestError` (Next 15+):
     Server-side route handler veya RSC içinde throw edilen
     yakalanmamış exception otomatik Sentry'ye akar. Manuel
     captureException eklemeden de hata visibility var.
=============================================================== */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    return;
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
    return;
  }
}

/* 🛡️ Otomatik route handler / RSC error capture.
   Sentry SDK v8+ ve Next 15+ official entegrasyon. Tüm
   `app/api/.../route.ts` POST/GET/PATCH/DELETE içindeki
   yakalanmamış exception'lar Sentry'ye iner. Mevcut try/catch
   blokları zaten error'u yakalıyor + structured log atıyor;
   Sentry yalnız re-throw edilen veya yakalanmamış olanları
   görür — silent fail riskini azaltır. */
export const onRequestError = Sentry.captureRequestError;
