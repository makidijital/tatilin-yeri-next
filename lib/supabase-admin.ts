import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/* ===============================================================
   🔥 SUPABASE ADMIN CLIENT — SERVICE ROLE
   ===============================================================
   Sadece SUNUCU TARAFI kullanım (API route'ları). Service role
   key auth.users tablosu üzerinde admin operasyon yetkisi verir.

   ⚠️ KESİNLİKLE:
   - Bu modül yalnızca sunucu tarafı route'lardan import edilmeli.
   - Service role key NEXT_PUBLIC_ ile expose edilmemeli.
   - Client component'ler bu modülü import etmemeli.
   - Browser bundle'a sızmaması için yalnız route handler'larda
     kullanın.

   🛡️ FAZ 0 HARDENING — `import "server-only"` direktifi:
     Bu modül client bundle'a sızarsa Next.js BUILD HATA verir
     (konvansiyonel "import etmemeli" yorumunun derleme-zamanı
     karşılığı). Davranış değişmez; mevcut tüm import'lar zaten
     server-side (route handler / server component / server-only
     service). Tek ek katman: client'tan kazara import edilirse
     production deploy'undan önce build aşamasında yakalanır.

   Env değişkeni: SUPABASE_SERVICE_ROLE_KEY (NEXT_PUBLIC YOK)
   =============================================================== */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL env değişkeni tanımlı değil"
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY env değişkeni tanımlı değil (server-only)"
    );
  }

  cached = createClient(url, serviceRoleKey, {
    auth: {
      // Service role client kullanıcı session'ı tutmaz
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
