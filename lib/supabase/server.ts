import "server-only";

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/* ===============================================================
   🛡️ SUPABASE SERVER CLIENT — SSR-AWARE (request-scoped)
   ===============================================================
   AMAÇ:
     Server Component (RSC) ve route handler bağlamından
     Supabase'i **kullanıcının session cookie'sini taşıyarak**
     çağırmak. Eski pattern (module-level anon singleton) server
     context'te cookie okumadığı için anonim olarak gidiyor, RLS
     `auth.uid()` NULL döndürüyordu → admin-only tabloda silent
     DENY. Bu helper cookie'leri Next.js `cookies()` API'sinden okur
     ve her request için izole bir client döner.

   NEXT.JS 15 NOTU:
     `cookies()` Next 15'te **Promise** döner — `await cookies()`
     pattern'i zorunlu. Bu helper async. Caller:
       const supabase = await createSupabaseServerClient();
       const { data } = await supabase.from(...).select(...);

   GÜVENLİK SINIRI:
     `import "server-only"` direktifi build-time guard'ı. Bu modül
     client bundle'a sızarsa Next.js BUILD HATA verir.

   COOKIE WRITE/REMOVE DAVRANISI:
     RSC içinde `cookies()` read-only; helper write/remove
     denediğinde Next try/catch ile sessizce yutar (faz 3'te
     middleware her request'te refresh ettiği için bu cookie write
     attempt'leri normalde tetiklenmez). Route handler'larda set
     başarılı olur.

   FAZ 4 KAPSAMI (BU TURDA YAPILMAYACAK):
     Mevcut RSC + admin route handler'ları henüz bu helper'a
     migrate edilmedi (sahiplik dosya-bazlı, ileride yapılır).
     Şu an helper hazır ve test edilebilir; mevcut sistem
     etkilenmez.

   ÇAĞRILMA PATTERN'İ:
     // RSC veya route handler:
     import { createSupabaseServerClient } from "@/lib/supabase/server";
     const supabase = await createSupabaseServerClient();
     const { data, error } = await supabase
       .from("reservations")
       .select("id")
       .eq("id", reservationId)
       .maybeSingle();
=============================================================== */

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          /* RSC + route handler'da cookies().set() bazen mümkün
             olmuyor (özellikle RSC read-only mode). try/catch ile
             yutuyoruz; gerçek session yenileme middleware'de
             updateSession üzerinden gerçekleşir → kayıp yok. */
          try {
            cookiesToSet.forEach(
              ({ name, value, options }: {
                name: string;
                value: string;
                options: CookieOptions;
              }) => {
                cookieStore.set(name, value, options);
              }
            );
          } catch {
            /* RSC read-only cookies — no-op. Middleware refresh path
               cookies'i her request başında yeniler. */
          }
        },
      },
    }
  );
}
