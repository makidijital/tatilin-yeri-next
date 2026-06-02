import "server-only";

/* ===============================================================
   🛡️ FAZ 39 — AUTH SERVER BARREL (SERVER-ONLY)
   ===============================================================
   Server-only auth artefaktları:
     • `authVerifier` — Bearer token doğrulama (server route'larında
       authorizeAdminToken/Caller tarafından kullanılır).
     • `adminAuthProvider` — service-role createUser (admin user
       oluşturma route'unda).

   ⚠️ `import "server-only"` direktifi: bu barrel CLIENT bundle'a
   sızarsa BUILD HATA. Implementation `./supabase-auth.server`
   içinde; o dosya da `import "server-only"` korumalı.

   Provider seçimi tek noktada — gelecekte farklı auth provider
   eklenirse burada switch:
     export const authVerifier: AuthTokenVerifier = isCustomEnabled
       ? customAuthVerifier
       : supabaseAuthVerifier;
   =============================================================== */

import {
  supabaseAuthVerifier,
  supabaseAdminAuthProvider,
} from "./supabase-auth.server";

/** Aktif server-side token verifier (SERVER-ONLY). */
export const authVerifier = supabaseAuthVerifier;

/** Aktif service-role admin provider (SERVER-ONLY). */
export const adminAuthProvider = supabaseAdminAuthProvider;
