import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

import type {
  AdminAuthProvider,
  AuthTokenVerifier,
} from "./auth.provider";
import type {
  AuthResult,
  AuthUser,
  CreateAdminUserInput,
  CreatedAdminUser,
} from "./auth.types";

/* ===============================================================
   🛡️ FAZ 39 — SUPABASE AUTH SERVER-ONLY PROVIDERS
   ===============================================================
   Service-role gerektiren auth işlemleri:
     • Bearer token doğrulama (`verifyToken`) — herhangi bir
       kullanıcının access_token'ını sunucuda decode/verify eder
       (auth.users tablosunda lookup; RLS bypass).
     • Admin createUser — auth.users tablosuna service-role yazma.

   ⚠️ SERVER-ONLY (`import "server-only"`):
     Bu dosya CLIENT bundle'a sızarsa BUILD HATA. Mevcut tüketici
     yalnız `lib/admin-route-auth.ts` (Bearer doğrulama) — server
     route'larından çağrılır. `lib/auth/server.ts` barrel'ı bu
     dosyanın exports'unu açar.

   ⚠️ BYTE-IDENTICAL DAVRANIŞ:
     verifyToken → getSupabaseAdmin().auth.getUser(token)
                    + mapUser → AuthResult<AuthUser>
     createUser  → getSupabaseAdmin().auth.admin.createUser({...})
                    + AuthResult<CreatedAdminUser>
     Eski `supabaseAuthProvider.verifyToken` ve
     `supabaseAdminAuthProvider.createUser` semantic'i birebir aynı;
     sadece dosya konumu ayrıldı (server-only chain izolasyonu).
   =============================================================== */

function mapUser(
  u: { id: string; email: string | null } | null | undefined
): AuthUser | null {
  if (!u || !u.id) return null;
  return { id: u.id, email: u.email ?? null };
}

/* ===============================================================
   🛡️ TOKEN VERIFIER (server-only)
   =============================================================== */

export const supabaseAuthVerifier: AuthTokenVerifier = {
  /* Server-side Bearer token doğrula — service-role context. */
  async verifyToken(token: string): Promise<AuthResult<AuthUser>> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      return {
        ok: false,
        error: error?.message || "Oturum doğrulanamadı",
      };
    }
    const user = mapUser({
      id: data.user.id,
      email: data.user.email ?? null,
    });
    if (!user) {
      return { ok: false, error: "Kullanıcı okunamadı" };
    }
    return { ok: true, value: user };
  },
};

/* ===============================================================
   🛡️ SERVICE-ROLE ADMIN PROVIDER (server-only)
   ===============================================================
   Privilege boundary — yalnız server-only modüllerden import
   edilmeli (admin user creation route'u gibi).
   =============================================================== */

export const supabaseAdminAuthProvider: AdminAuthProvider = {
  async createUser(
    input: CreateAdminUserInput
  ): Promise<AuthResult<CreatedAdminUser>> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: input.emailConfirm ?? true,
    });
    if (error || !data?.user) {
      return {
        ok: false,
        error: error?.message || "Kullanıcı oluşturulamadı",
      };
    }
    return {
      ok: true,
      value: {
        id: data.user.id,
        email: data.user.email ?? input.email,
      },
    };
  },
};
