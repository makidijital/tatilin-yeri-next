import "server-only";

import { getSupabaseAdmin } from "./supabase-admin";
import { authVerifier } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/* ===============================================================
   🔥 ADMIN ROUTE AUTHORIZER — TEK HELPER
   ===============================================================
   Server-side route'larda caller'ın admin olup olmadığını
   doğrular. Authorization: Bearer <access_token> header'ı bekler.

   Flow:
     1. Bearer token parse
     2. supabase.auth.getUser(token) → auth user
     3. admin_users lookup:
          - önce auth_user_id ile (yeni kayıtlar)
          - bulunamazsa email ile (eski kayıtlar — backward compat)
     4. is_active kontrolü
     5. Caller record döner

   Sadece sunucu (route handler) tarafından kullanılır;
   client component'lere import edilmez.
   =============================================================== */

export type AuthorizedAdminCaller = {
  /** admin_users.id (uuid) */
  id: string;
  /** auth.users.id (uuid) */
  authUserId: string;
  email: string;
  is_active: boolean;
};

export type AuthorizeResult =
  | { ok: true; caller: AuthorizedAdminCaller }
  | { ok: false; status: number; error: string };

/* ---------------------------------------------
   🔥 CORE — authorizeAdminToken(token)
   - Token doğrulama + admin_users lookup
   - Bearer header, query param, ya da başka bir kaynaktan
     gelen ham token string'i ile kullanılabilir.
---------------------------------------------- */
export async function authorizeAdminToken(
  rawToken: string | null | undefined
): Promise<AuthorizeResult> {
  const token = (rawToken || "").toString().trim();
  if (!token) {
    return { ok: false, status: 401, error: "Geçersiz token" };
  }

  /* FAZ 39: authVerifier.verifyToken delege; service-role context
     provider içinde (getSupabaseAdmin); "Oturum doğrulanamadı"
     mesajı route-edge'de aynen. authVerifier `@/lib/auth/server`
     barrel'ından gelir; `import "server-only"` chain'i ile korunur. */
  const verify = await authVerifier.verifyToken(token);
  if (!verify.ok) {
    return {
      ok: false,
      status: 401,
      error: "Oturum doğrulanamadı",
    };
  }

  const authUserId = verify.value.id;
  const email = (verify.value.email || "")
    .toLowerCase()
    .trim();

  /* admin_users tablo lookup'ı için service-role client lokal
     kullanılır (DB tarafı; auth tarafından bağımsız). */
  const admin = getSupabaseAdmin();

  /* ---------- LOOKUP ---------- */
  // 1) Yeni kayıtlar: auth_user_id öncelikli
  let row: {
    id: string;
    email: string | null;
    is_active: boolean | null;
  } | null = null;

  if (authUserId) {
    const { data, error } = await admin
      .from("admin_users")
      .select("id, email, is_active")
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) {
      console.error(
        "[admin-route-auth.lookup] auth_user_id FAILED",
        error.message
      );
      // continue to email fallback
    } else {
      row = data;
    }
  }

  // 2) Eski kayıtlar: email fallback
  if (!row && email) {
    const { data, error } = await admin
      .from("admin_users")
      .select("id, email, is_active")
      .eq("email", email)
      .maybeSingle();
    if (error) {
      return {
        ok: false,
        status: 500,
        error: "admin_users lookup hatası",
      };
    }
    row = data;
  }

  if (!row) {
    return { ok: false, status: 403, error: "Yetkisiz" };
  }
  if (!row.is_active) {
    return {
      ok: false,
      status: 403,
      error: "Hesabınız pasif durumda",
    };
  }

  return {
    ok: true,
    caller: {
      id: row.id,
      authUserId,
      email: (row.email || email).toLowerCase().trim(),
      is_active: !!row.is_active,
    },
  };
}

/* ---------------------------------------------
   🔥 BEARER — authorizeAdminCaller(req)
   POST/JSON route'ları için klasik Authorization header path.
---------------------------------------------- */
function extractBearer(req: Request): string | null {
  const authHeader = req.headers.get("authorization") || "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const t = m[1].trim();
  return t || null;
}

export async function authorizeAdminCaller(
  req: Request
): Promise<AuthorizeResult> {
  const token = extractBearer(req);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Authorization header eksik",
    };
  }
  return authorizeAdminToken(token);
}

/* ---------------------------------------------
   🔥 COOKIE SESSION — authorizeAdminSession()
   ---------------------------------------------
   Server Action path'i (Bearer YOK, cookie session VAR). Bearer
   route'ları `authorizeAdminCaller` kullanır; cookie-session server
   action'ları (galeri/pricing write'ları) bunu kullanır.

   ⚠️ ADDITIVE + ÇEKİRDEK KORUNUR:
     `createSupabaseServerClient()` (SSR cookie) → `getSession()` →
     `access_token` → DEĞİŞMEMİŞ `authorizeAdminToken(token)`. Token
     transport; gerçek doğrulama yine authorizeAdminToken içindeki
     `verifyToken` (service-role `auth.getUser(token)`) + admin_users
     lookup. Yeni auth mantığı / lookup / verify YOK. Dönüş aynen
     `AuthorizeResult`. access_token yoksa mevcut 401 formatı.
--------------------------------------------- */
export async function authorizeAdminSession(): Promise<AuthorizeResult> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Oturum bulunamadı",
    };
  }
  return authorizeAdminToken(token);
}

/* ---------------------------------------------
   🔥 FLEX — authorizeAdminCallerFlex(req)
   GET-and-open-new-tab senaryoları için (örn: /api/voucher/[id]):
     - Authorization: Bearer <token>  → öncelikli (programatik kullanım)
     - ?token=<access_token>           → fallback (new-tab UX'i)
   Token query'de geçerken HTTPS şart; Referrer-Policy: no-referrer
   route response header'ında set edilmeli (route içi sorumluluk).
---------------------------------------------- */
export async function authorizeAdminCallerFlex(
  req: Request
): Promise<AuthorizeResult> {
  const headerToken = extractBearer(req);
  let token: string | null = headerToken;
  if (!token) {
    try {
      const url = new URL(req.url);
      const q = url.searchParams.get("token");
      if (q && q.trim()) token = q.trim();
    } catch {
      // URL parse error → token yok kabul et
    }
  }
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Yetkilendirme tokenı eksik",
    };
  }
  return authorizeAdminToken(token);
}
