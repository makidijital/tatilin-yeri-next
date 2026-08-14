/* ===============================================================
   🛡️ NATIVE AUTH — COOKIE NAMES (EDGE-SAFE, saf)
   ===============================================================
   Cookie İSİM türetimi (Node crypto / next/headers / server-only YOK) →
   hem Edge middleware hem server route/action import edebilir. Değerler
   `cookies.ts` (server yazma/okuma) ile ortak tek kaynak.

   `__Host-` prefix yalnız Secure iken geçerli; AUTH_COOKIE_SECURE=false
   (yalnız local http-dev) → prefix'siz düz isim.
   =============================================================== */

export const COOKIE_SECURE =
  (process.env.AUTH_COOKIE_SECURE ?? "true").toLowerCase() !== "false";

export const ACCESS_COOKIE = COOKIE_SECURE ? "__Host-admin_at" : "admin_at";
export const REFRESH_COOKIE = COOKIE_SECURE ? "__Host-admin_rt" : "admin_rt";

/** Middleware redirect-hint marker (supabase modunda kullanılır; native
 *  middleware buna bağlı DEĞİL — native cookie'leri doğrular). */
export const MARKER_COOKIE = "admin-session";
