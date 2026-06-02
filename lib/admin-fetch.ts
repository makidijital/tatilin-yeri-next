import { authProvider } from "@/lib/auth";

/* ===============================================================
   🔥 ADMIN FETCH — TEK MERKEZİ HELPER
   ===============================================================
   Korunan API route'larına çağrı yapan admin UI kodu için
   ortak Bearer-token kapısı.

   - getAdminAccessToken(): Supabase session'dan access_token döner
       (yoksa null; UI tarafında "Oturum bulunamadı" handle edilir).
   - adminFetch(input, init): otomatik olarak
       Authorization: Bearer <token> ekler ve fetch() döner.
       keepalive / fire-and-forget pattern aynen çalışır:
         adminFetch(url, { keepalive: true }).catch(...)
   - buildAdminUrlWithToken(url): GET-and-open-new-tab senaryoları
       için (örn: voucher PDF) URL'e ?token=<access_token>
       query parametresi ekler. Token query'de geçer; HTTPS gerekir
       ve Referrer-Policy: no-referrer route response'unda set edilir.

   Bu helper SADECE client component'lerde kullanılır.
   Server-side (route handler) auth doğrulaması:
     lib/admin-route-auth.ts → authorizeAdminCaller / Flex
   =============================================================== */

export async function getAdminAccessToken(): Promise<string | null> {
  try {
    /* FAZ 39: authProvider.getSession delege; null davranışı + token
       trim semantic aynen. Console tag (`[admin-fetch] getSession ...`)
       caller'da kalır — provider sessiz. */
    const session = await authProvider.getSession();
    if (!session) {
      return null;
    }
    const token = session.accessToken;
    return typeof token === "string" && token.trim() ? token : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[admin-fetch] getSession EXCEPTION", msg);
    return null;
  }
}

export async function adminFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const token = await getAdminAccessToken();
  if (!token) {
    // Sentinel error — UI tarafı catch edip "Oturum bulunamadı"
    // göstermeli; bu helper UI mesajı üretmez.
    throw new Error("Oturum bulunamadı. Yeniden giriş yapın.");
  }
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

/* ---------------------------------------------
   🔥 buildAdminUrlWithToken
   GET-and-open-new-tab için (örn: window.open(voucher PDF))
   - URL'e ?token=<access_token> ekler
   - Sadece HTTPS / aynı origin için kullanılmalı
   - Token kısa ömürlü (Supabase JWT default 1h)
---------------------------------------------- */
export async function buildAdminUrlWithToken(
  url: string
): Promise<string | null> {
  const token = await getAdminAccessToken();
  if (!token) return null;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}
