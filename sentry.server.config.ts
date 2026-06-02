import * as Sentry from "@sentry/nextjs";

/* ===============================================================
   🛡️ SENTRY SERVER CONFIG — ERROR-ONLY (MINIMAL FAZ)
   ===============================================================
   Bu dosya Node.js server runtime (route handler, RSC, server
   actions) tarafında Sentry SDK'sını initialize eder. Yalnız error
   capture; tracing KAPALI.

   Bu config `instrumentation.ts` tarafından import edilir
   (Next 13+ official pattern); doğrudan call edilmez.

   ⚠️ DAVRANIŞ:
     • DSN env yoksa init no-op; runtime etkilenmez.
     • Existing error handling (try/catch + console.error + throw)
       AYNEN. Sentry sadece observe; rethrow'u durdurmaz.
     • `beforeSend` filter ile expected 404/422/409 fatura altı
       drop edilir → noise azaltır, payment/booking/auth gerçek
       hatalar görünür.
=============================================================== */

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  /* Trace/profile KAPALI — ilk faz error-only. */
  tracesSampleRate: 0,
  profilesSampleRate: 0,

  debug: false,
  environment: process.env.NODE_ENV,

  /* 🛡️ NOISE FILTERS:
     Server-side önceden değerlendirilen "expected" durumları
     (validation error, abort, beklenen 4xx) Sentry'ye yansıtma. */
  ignoreErrors: [
    /* Booking/availability conflict — expected user-facing flow,
       UI tarafında "Bu tarihler dolu" toast'una dönüşüyor; alarm
       değil. */
    "Bu tarihler dolu",
    "Bu tarihler artık müsait değil",
    /* Reservation guard'ları — expected validation throw'ları
       (createReservation orchestrator). */
    "Villa zorunlu",
    "Tarih zorunlu",
    "Ad ve telefon zorunlu",
    "Tarih aralığı hatalı",
    /* Auth fail'leri — expected admin login failures; brute-force
       alarmı için ileride security rate-limit / Sentry alert
       kurulabilir. */
    "Unauthorized",
    /* Request cancel — bot/network drop. */
    "AbortError",
  ],

  /* `beforeSend` — son şanslar: status/context bazlı filter. */
  beforeSend(event, hint) {
    /* HTTP 404 / 422 / 409 expected — Sentry'ye atmıyoruz. */
    const error = hint?.originalException;
    if (error && typeof error === "object" && "message" in error) {
      const msg = String((error as { message: string }).message || "");
      /* Mail "Resend API key yok" warning'i — env config eksikse
         development noise yapar; production'da apartmandır, yine
         capture etmek isteyebiliriz → şimdilik DROP, ilerde alert
         kurulabilir. */
      if (/Resend API key yok/i.test(msg)) {
        return null;
      }
    }
    return event;
  },
});
