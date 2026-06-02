/* ===============================================================
   🛡️ DEPRECATED — see instrumentation-client.ts
   ===============================================================
   Bu dosya eski Sentry SDK (≤9 + Next ≤14) konvansiyonu.
   SDK 10+ + Next 15+ için yeni canonical: `instrumentation-client.ts`
   (Next.js native; webpack inject şartı yok; Turbopack uyumlu).

   ⚠️ İÇERİĞİ NE-OP'A ALINDI:
     Sandbox `rm` permission engelliyor; dosya silinemedi. Boş
     bırakmak SDK'nın duplicate-init uyarısını engeller — `withSentryConfig`
     gelecekte eklenirse webpack injection burayı yüklese bile
     `Sentry.init` çağrısı YOK → no-op.

   Migration:
     Sentry config artık `instrumentation-client.ts`'de. Bu dosyayı
     güvenli şekilde silebilirsin:
       rm sentry.client.config.ts
=============================================================== */

export {};
