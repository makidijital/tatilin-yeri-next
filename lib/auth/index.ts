/* ===============================================================
   🛡️ FAZ 39 — AUTH BARREL (CLIENT-SAFE)
   ===============================================================
   Tek import path: `import { authProvider } from "@/lib/auth"`.

   ⚠️ BU BARREL CLIENT-SAFE — server-only chain (getSupabaseAdmin)
   içermez. Bu nedenle hem CLIENT hem SERVER tüketicilerden
   sorunsuz import edilebilir.

   PRIVILEGE BOUNDARY:
     - `authProvider` (BU BARREL) — anon client; browser + server.
       Method'lar: getCurrentUser, getSession, signInWithPassword,
       signOut, refreshSession, onAuthStateChange. HİÇBİRİ
       service-role gerektirmez.
     - `authVerifier` / `adminAuthProvider` — `@/lib/auth/server`
       barrel'ından import edilir. `import "server-only"` ile
       korunur; client bundle'a sızarsa BUILD HATA verir.

   Provider seçimi tek noktada — gelecekte Supabase yerine Clerk/
   NextAuth/Better Auth/custom JWT eklenirse burada switch:
     export const authProvider: AuthProvider = isClerkEnabled
       ? clerkAuthProvider
       : supabaseAuthProvider;
   =============================================================== */

import { supabaseAuthProvider } from "./supabase-auth.provider";

export type {
  AuthProvider,
  AuthTokenVerifier,
  AdminAuthProvider,
} from "./auth.provider";
export type {
  AuthUser,
  AuthSession,
  SignInWithPasswordInput,
  AuthResult,
  AuthStateEvent,
  AuthStateChangeCallback,
  AuthStateSubscription,
  CreateAdminUserInput,
  CreatedAdminUser,
} from "./auth.types";

/** Aktif anon-client auth provider (CLIENT-SAFE). */
export const authProvider = supabaseAuthProvider;
