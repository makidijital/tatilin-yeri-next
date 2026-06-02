import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* ===============================================================
   🔥 ADMIN SESSION MIDDLEWARE — SSR-AWARE (FAZ 3)
   ===============================================================
   Korunan path: /maki-admin/:path*

   ⚠️ TODO — NEXT.JS 16 PROXY MIGRATION:
     Next 16 sürümünde `middleware.ts` convention deprecated; yerine
     "Proxy" pattern öneriliyor (next dev/build çıktısında uyarı).
     Şu an breaking değil, mevcut middleware çalışmaya devam ediyor.
     Migration ileride yapılacak:
       1. Yeni "proxy" konvansiyonuna geçiş (Next docs referansı)
       2. Bu dosyanın imzası NextRequest → request → response
          pattern'ine adapte
       3. Supabase SSR `updateSession` helper'ı proxy içine taşınır
     Bu turda KAPSAM DIŞI — runtime davranışı bozmamak öncelik.

   ⚠️ FAZ 3 EKLENTI — SUPABASE SESSION REFRESH:
     Mevcut marker-cookie redirect logic'i AYNEN korundu. Üzerine,
     Supabase'in official SSR pattern'i (createServerClient +
     supabase.auth.getUser()) eklendi — her admin request'inde
     access token gerekirse yenilenir, refreshed session cookie'leri
     response'a yazılır.

     Sonuç: RSC + route handler context'i artık cookies üzerinden
     authenticated kullanıcıyı görebilir → `auth.uid()` server-side
     NULL olmaz → mig 040/042 admin-only RLS doğru çalışır.

   ⚠️ DAVRANIŞ KORUMA:
     • MARKER COOKIE ("admin-session=1") AYNEN — AdminSessionGuard
       set/clear ediyor, middleware bunu redirect hint olarak okuyor.
       Supabase session cookie'leri PARALEL akıyor (ayrı isim:
       sb-<project>-auth-token).
     • Redirect logic AYNEN: login path + has-marker → home;
       protected path + no-marker → login.
     • Whitelist + matcher AYNEN: yalnız /maki-admin/* eşleşir.

   ⚠️ COOKIE WRITE PROPAGATION (kritik):
     Supabase refresh response cookie yazıyor; redirect olduğunda
     refreshed cookies REDIRECT response'una kopyalanmalı, yoksa
     yeni access token tarayıcıya gitmez. `propagateAuthCookies`
     helper'ı bu işi yapar.

   ⚠️ CUSTOM AUTH SİSTEMİ YOK:
     Bu middleware Supabase official SSR helper'ını kullanıyor.
     Custom JWT verification, custom session model YOK — Supabase
     Auth + cookie storage standart pattern'i.
   =============================================================== */

const MARKER_COOKIE = "admin-session";
const LOGIN_PATH = "/maki-admin/login";
const HOME_PATH = "/maki-admin";

export async function middleware(req: NextRequest): Promise<NextResponse> {
  /* 🛡️ STEP 1 — Supabase SSR session refresh.
     Official pattern: createServerClient with cookies adapter, then
     getUser() çağrısı access token'ı yeniler (gerekirse). Refreshed
     cookies `supabaseResponse` üzerinde toplanır; aşağıda redirect
     gerekirse bu cookies redirect response'una kopyalanır. */
  let supabaseResponse = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });
          supabaseResponse = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  /* IMPORTANT: getUser çağrısı access token yenilenmesini tetikler;
     return değeri burada KULLANILMAZ (downstream redirect kararı
     marker cookie üzerinden gidiyor — mevcut UX BYTE-IDENTICAL).
     Hata olsa bile redirect logic'i bozulmaz; getUser yalnız
     side-effect (refresh) için. */
  try {
    await supabase.auth.getUser();
  } catch {
    /* Network glitch / expired refresh token — refresh fail eder ama
       redirect logic'i mevcut marker-cookie üzerinden devam eder.
       Kullanıcı stale session yaşarsa AdminSessionGuard'da yakalanır. */
  }

  /* 🛡️ STEP 2 — Mevcut marker-cookie redirect logic'i (BYTE-IDENTICAL). */
  const { pathname } = req.nextUrl;
  const isLoginPath = pathname === LOGIN_PATH;
  const hasMarker = req.cookies.get(MARKER_COOKIE)?.value === "1";

  // Login sayfasında ve oturumu var → ana panele
  if (isLoginPath && hasMarker) {
    const url = req.nextUrl.clone();
    url.pathname = HOME_PATH;
    url.search = "";
    const redirectRes = NextResponse.redirect(url);
    propagateAuthCookies(supabaseResponse, redirectRes);
    return redirectRes;
  }

  // Korunan path'te ve oturumu yok → login'e
  if (!isLoginPath && !hasMarker) {
    const url = req.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    // Geri dönüş için orijinal path'i query'de tut (opsiyonel)
    url.searchParams.set("redirect", pathname);
    const redirectRes = NextResponse.redirect(url);
    propagateAuthCookies(supabaseResponse, redirectRes);
    return redirectRes;
  }

  return supabaseResponse;
}

/* ---------------------------------------------------------------
   🛡️ propagateAuthCookies — refreshed Supabase session cookies'ini
   redirect response'una taşı. Yoksa yeni access token tarayıcıya
   gitmez ve refresh boşa gider.
=============================================================== */
function propagateAuthCookies(
  source: NextResponse,
  target: NextResponse
): void {
  source.cookies.getAll().forEach((cookie) => {
    target.cookies.set(cookie.name, cookie.value, {
      domain: cookie.domain,
      expires: cookie.expires,
      httpOnly: cookie.httpOnly,
      maxAge: cookie.maxAge,
      path: cookie.path,
      sameSite: cookie.sameSite,
      secure: cookie.secure,
    });
  });
}

export const config = {
  matcher: [
    /*
     * /maki-admin/* tüm path'leri eşleşir.
     * Public reservation flow, voucher route'ları, mail API
     * route'ları, public pages → matcher dışında.
     *
     * 🛡️ FAZ 3 NOTU: Matcher ŞIMDIDEN değişmedi; session refresh
     * yalnız admin navigasyonunda tetiklenir. Bu yeterli çünkü:
     *   • Admin pages browser → cookies tazelenir, sonraki API
     *     çağrılarına taze token gider.
     *   • Public RSC ve /api/public/* zaten authenticated user
     *     beklemiyor (anon path).
     *   • Faz 4'te (RSC migration) ihtiyaç olursa matcher
     *     genişletilebilir; bu turda dokunulmuyor.
     */
    "/maki-admin/:path*",
  ],
};
