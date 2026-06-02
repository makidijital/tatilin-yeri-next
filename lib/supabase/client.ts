import { createBrowserClient } from "@supabase/ssr";

/* ===============================================================
   🛡️ SUPABASE BROWSER CLIENT — SSR-AWARE
   ===============================================================
   AMAÇ:
     Tarayıcı tarafında çalışan tek anon client; oturum (session)
     localStorage yerine **cookie-backed** olarak saklanır.
     Cookie-backed session, Faz 3'te kurulan middleware
     `updateSession` helper'ı sayesinde sunucu tarafına (RSC + route
     handler) **otomatik** akar — `auth.uid()` server context'te
     NULL olmaz, RLS policy'leri authenticated kullanıcıyı doğru
     görür.

   API YÜZEYİ:
     `createBrowserClient` döndüğü client, `@supabase/supabase-js`
     `createClient` ile aynı `SupabaseClient` interface'ini sunar:
       .from(...).select(...) / .rpc(...) / .auth.signInWithPassword(...)
       .auth.getSession() / .auth.getUser() / .auth.onAuthStateChange(...)
       .storage.from(...) ...
     Bu yüzden mevcut tüm caller'lar BYTE-IDENTICAL davranır;
     yalnız session persistence layer değişir.

   GÜVENLİK SINIRI:
     Bu modül **BROWSER-ONLY** olarak tasarlandı. Server-side
     (RSC / route handler) import edilirse cookie I/O gerçekleşmez
     ve auth context boşa gider. EK GÜVENLİK katmanı (faz 1):
       development mode'da typeof window === "undefined" iken
       console.warn ile uyar; BREAKING değil.

   ESKI PATH UYUMU:
     `@/lib/supabase` (module-level singleton) Faz 2'de bu factory'ye
     delege edecek; mevcut import'lar değişmez. Bu dosya yeni
     canonical entry; eski path compat alias olarak kalır.

   ÇAĞRILMA PATTERN'İ:
     // Component (browser):
     import { createSupabaseBrowserClient } from "@/lib/supabase/client";
     const supabase = createSupabaseBrowserClient();
     // Modül-seviye singleton istiyorsan eski path (lib/supabase.ts)
     // hâlâ aynı default şekilde çalışır.
=============================================================== */

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Tarayıcı tarafı SSR-aware Supabase client'ı.
 *
 * Singleton: aynı session storage'ı (cookies) paylaşan tek bir client
 * instance'ı döner. Birden fazla call'da aynı referans gelir; bu
 * `onAuthStateChange` listener'larının çoğalmasını engeller ve
 * `localStorage`/cookie senkronu için kritiktir.
 */
export function createSupabaseBrowserClient() {
  if (typeof window === "undefined") {
    /* 🛡️ DEV-ONLY UYARI (non-breaking):
       Browser client server context'te çağrıldığında session
       cookie-write/read yapamaz; sessizce anon davranır → RLS
       DENY pattern'i (eski tip). Burada throw etmiyoruz çünkü
       mevcut sistemde sitemap / arama / liste gibi RSC dosyaları
       henüz migrate edilmedi (faz 4 kapsamı). Production'da
       console flood'u olmasın diye sadece development'ta uyar. */
    if (process.env.NODE_ENV === "development") {
      console.warn(
        "[supabase/client] createSupabaseBrowserClient() server context'te çağrıldı. " +
          "Server tarafı için @/lib/supabase/server (createSupabaseServerClient) veya " +
          "@/lib/supabase/admin (getSupabaseAdmin) kullanın."
      );
    }
  }

  if (browserClient) return browserClient;

  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return browserClient;
}
