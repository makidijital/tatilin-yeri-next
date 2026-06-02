import { supabase } from "./supabase";
import { authProvider } from "@/lib/auth";

/* ===============================================================
   🔥 ADMIN AUTH — TEK SOURCE-OF-TRUTH
   ===============================================================
   Authentication: Supabase Auth (auth.users) — şifre/session burada.
   Authorization:  public.admin_users — is_active + permissions.

   Flow:
     supabase.auth.getUser()
       ↓
     admin_users lookup (email match, lowercased)
       ↓
     is_active = true kontrolü
       ↓
     permissions normalize edilir (string[] olarak garanti)

   Eğer herhangi bir adımda kullanıcı geçersiz/pasif/yok ise:
   getCurrentAdmin() null döner. Çağıran taraf logout + redirect
   yapar. Tek source-of-truth burada.
   =============================================================== */

export type AdminAuthRecord = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  sidebar_permissions: string[];
};

export type AdminLookupResult =
  | { ok: true; admin: AdminAuthRecord }
  | { ok: false; reason: "unauthenticated" | "not_admin" | "inactive" };

/* ---------------------------------------------
   getCurrentAdmin — basit API
   - geçerli admin döner veya null
---------------------------------------------- */
export async function getCurrentAdmin(): Promise<AdminAuthRecord | null> {
  const result = await lookupCurrentAdmin();
  return result.ok ? result.admin : null;
}

/* ---------------------------------------------
   lookupCurrentAdmin — neden başarısız olduğunu da döner
   (login flow inactive vs not-found ayrımı için)
---------------------------------------------- */
export async function lookupCurrentAdmin(): Promise<AdminLookupResult> {
  /* FAZ 39: authProvider.getCurrentUser delege; null davranışı
     (unauthenticated) aynen. */
  const user = await authProvider.getCurrentUser();
  if (!user) {
    return { ok: false, reason: "unauthenticated" };
  }
  const authUserId = user.id;
  const email = (user.email || "").toLowerCase().trim();
  if (!authUserId && !email) {
    return { ok: false, reason: "unauthenticated" };
  }

  /* ---------- LOOKUP ---------- */
  // 1) Yeni kayıtlar: auth_user_id öncelikli
  type Row = {
    id: string;
    full_name: string | null;
    email: string | null;
    is_active: boolean | null;
    sidebar_permissions: unknown;
  };
  let row: Row | null = null;

  if (authUserId) {
    const { data, error } = await supabase
      .from("admin_users")
      .select(
        "id, full_name, email, is_active, sidebar_permissions"
      )
      .eq("auth_user_id", authUserId)
      .maybeSingle();
    if (error) {
      console.error(
        "[admin-auth.lookup] auth_user_id FAILED",
        error.message
      );
      // continue to email fallback
    } else {
      row = (data as Row | null) || null;
    }
  }

  // 2) Eski kayıtlar (auth_user_id NULL): email fallback
  if (!row && email) {
    const { data, error } = await supabase
      .from("admin_users")
      .select(
        "id, full_name, email, is_active, sidebar_permissions"
      )
      .eq("email", email)
      .maybeSingle();
    if (error) {
      console.error(
        "[admin-auth.lookup] email fallback FAILED",
        error.message
      );
      return { ok: false, reason: "not_admin" };
    }
    row = (data as Row | null) || null;
  }

  if (!row) {
    return { ok: false, reason: "not_admin" };
  }
  if (!row.is_active) {
    return { ok: false, reason: "inactive" };
  }

  return {
    ok: true,
    admin: {
      id: row.id,
      full_name: (row.full_name || "").trim(),
      email: (row.email || email).trim().toLowerCase(),
      is_active: !!row.is_active,
      sidebar_permissions: Array.isArray(row.sidebar_permissions)
        ? (row.sidebar_permissions as unknown[]).filter(
            (p): p is string => typeof p === "string"
          )
        : [],
    },
  };
}

/* ---------------------------------------------
   requireAdmin — yetkisizse throw eder
---------------------------------------------- */
export async function requireAdmin(): Promise<AdminAuthRecord> {
  const admin = await getCurrentAdmin();
  if (!admin) {
    throw new Error("Yetki gerekli");
  }
  return admin;
}

/* ---------------------------------------------
   signOutAdmin — supabase signOut wrapper
---------------------------------------------- */
export async function signOutAdmin(): Promise<void> {
  /* FAZ 39: authProvider.signOut delege; idempotent. Result envelope
     yüzeye taşınmaz (caller mevcut signature `Promise<void>` bekliyor). */
  await authProvider.signOut();
}
