import { supabase } from "@/lib/supabase";

import type { AuthProvider } from "./auth.provider";
import type {
  AuthResult,
  AuthSession,
  AuthStateChangeCallback,
  AuthStateSubscription,
  AuthUser,
  SignInWithPasswordInput,
} from "./auth.types";

/* ===============================================================
   🛡️ FAZ 39 — SUPABASE AUTH PROVIDER (CLIENT-SAFE Implementation)
   ===============================================================
   AuthProvider interface'inin Supabase Auth (anon client) impl.
   Bu dosya CLIENT bundle'a girer; SERVICE-ROLE chain'i YOK
   (getSupabaseAdmin import YOK). Anon `supabase` client'ı kullanır.

   ⚠️ PRIVILEGE BOUNDARY:
     - Bu dosya (.provider.ts) — anon client; browser + server.
     - `lib/auth/supabase-auth.server.ts` — service-role context;
       `verifyToken` (Bearer doğrulama) + `supabaseAdminAuthProvider`
       (createUser). `import "server-only"` ile korunur, client
       bundle'a SIZAMAZ.

   ⚠️ KESIN KURAL — BYTE-IDENTICAL DAVRANIŞ:
     - getCurrentUser → supabase.auth.getUser()
     - getSession     → supabase.auth.getSession()
     - signInWithPassword → supabase.auth.signInWithPassword({...})
     - signOut        → supabase.auth.signOut()
     - refreshSession → supabase.auth.refreshSession()
     - onAuthStateChange → supabase.auth.onAuthStateChange(cb)
     - Cookie/session lifecycle Supabase JS v2 client'a delege;
       provider client davranışına müdahil olmaz.

   ⚠️ Console tag'leri caller'da. Provider yalnız Result envelope
   üretir; throw etmez.
   =============================================================== */

/* ---------------------------------------------------------------
   📦 Internal shape mapper — Supabase native session → AuthSession
   --------------------------------------------------------------- */
type SupabaseSessionShape = {
  access_token?: string;
  expires_at?: number;
  user?: { id: string; email: string | null } | null;
};

function mapSession(
  s: SupabaseSessionShape | null | undefined
): AuthSession | null {
  if (!s || !s.access_token || !s.user) return null;
  const u = s.user;
  if (!u.id) return null;
  return {
    user: { id: u.id, email: u.email ?? null },
    accessToken: s.access_token,
    expiresAt: typeof s.expires_at === "number" ? s.expires_at : undefined,
  };
}

function mapUser(
  u: { id: string; email: string | null } | null | undefined
): AuthUser | null {
  if (!u || !u.id) return null;
  return { id: u.id, email: u.email ?? null };
}

/* ===============================================================
   🛡️ ANON CLIENT PROVIDER (CLIENT-SAFE)
   =============================================================== */

export const supabaseAuthProvider: AuthProvider = {
  /* Current user — anon session. */
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return mapUser({
      id: data.user.id,
      email: data.user.email ?? null,
    });
  },

  /* Current session + accessToken. */
  async getSession(): Promise<AuthSession | null> {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session) return null;
    return mapSession(
      data.session as unknown as SupabaseSessionShape
    );
  },

  /* Email/password sign-in. */
  async signInWithPassword(
    input: SignInWithPasswordInput
  ): Promise<AuthResult<AuthSession>> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (error || !data?.session) {
      return {
        ok: false,
        error: error?.message || "Oturum açılamadı",
      };
    }
    const session = mapSession(
      data.session as unknown as SupabaseSessionShape
    );
    if (!session) {
      return { ok: false, error: "Oturum okunamadı" };
    }
    return { ok: true, value: session };
  },

  /* Sign out — idempotent. */
  async signOut(): Promise<AuthResult<void>> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      return { ok: false, error: error.message || "" };
    }
    return { ok: true, value: undefined };
  },

  /* Manuel token refresh. */
  async refreshSession(): Promise<AuthResult<AuthSession>> {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data?.session) {
      return {
        ok: false,
        error: error?.message || "Token yenilenemedi",
      };
    }
    const session = mapSession(
      data.session as unknown as SupabaseSessionShape
    );
    if (!session) {
      return { ok: false, error: "Oturum okunamadı" };
    }
    return { ok: true, value: session };
  },

  /* Auth state listener; subscription handle. */
  onAuthStateChange(
    callback: AuthStateChangeCallback
  ): AuthStateSubscription {
    const { data } = supabase.auth.onAuthStateChange(
      (event, session) => {
        callback(
          event,
          session
            ? mapSession(session as unknown as SupabaseSessionShape)
            : null
        );
      }
    );
    return {
      unsubscribe: () => {
        try {
          data?.subscription?.unsubscribe();
        } catch {
          /* ignore */
        }
      },
    };
  },
};
