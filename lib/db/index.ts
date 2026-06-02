/* ===============================================================
   🛡️ FAZ 1.1 — DB BARREL (CLIENT-SAFE)
   ===============================================================
   Tek import path: `import { db } from "@/lib/db"`.

   ⚠️ BU BARREL CLIENT-SAFE — server-only chain (getSupabaseAdmin)
   içermez. Hem CLIENT hem SERVER tüketicileri tarafından sorunsuz
   import edilebilir. RLS uygulanır (anon context).

   PRIVILEGE BOUNDARY:
     - `db` (BU BARREL) — anon client; browser + server. RLS aktif.
     - `dbAdmin` — `@/lib/db/server` barrel'ından import edilir.
       `import "server-only"` ile korunur; client bundle'a sızarsa
       BUILD HATA. RLS bypass (service-role).

   Provider seçimi tek noktada — gelecekte Supabase yerine Drizzle/
   Prisma/raw pg eklenirse burada switch:
     export const db: DbProvider = isDrizzleEnabled
       ? drizzleDbProvider
       : supabaseDbProvider;

   FAZ 1.1 SCOPE:
     • Sadece foundation: interface + Supabase implementation + barrel.
     • Repository migration FAZ 1.2'de (her repo per-PR).
     • Mevcut repository'ler hâlâ `@/lib/supabase` / `@/lib/supabase-admin`
       kullanıyor; davranış değişmedi.
   =============================================================== */

import { supabaseDbProvider } from "./supabase-db.provider";

export type { DbProvider } from "./db.provider";

/** Aktif anon-client DB provider (CLIENT-SAFE). RLS aktif. */
export const db = supabaseDbProvider;
