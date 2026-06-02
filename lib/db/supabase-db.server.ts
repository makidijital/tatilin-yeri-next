import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

import type { DbProvider } from "./db.provider";

/* ===============================================================
   🛡️ FAZ 1.1 — SUPABASE SERVICE-ROLE DB PROVIDER (SERVER-ONLY)
   ===============================================================
   `DbProvider` interface'inin Supabase JS service-role implementation'u.
   `getSupabaseAdmin()` lazy singleton'ı arkasına thin wrapper:
     • `from(table)`        — `getSupabaseAdmin().from(table)`
     • `rpc(name, args)`    — `getSupabaseAdmin().rpc(name, args)`

   ⚠️ BYTE-IDENTICAL DAVRANIŞ:
     Method'lar her çağrıda lazy `getSupabaseAdmin()` çağırır (singleton
     cache; ilk call'da client oluşur, sonrası cached). Caller chain
     (`.select()`, `.upsert()`, `.delete()`, vs.) ve PostgrestQueryBuilder
     return tipi birebir aynı. RLS BYPASS (service-role) davranışı
     mevcut `getSupabaseAdmin()` ile birebir.

   ⚠️ SERVER-ONLY (`import "server-only"`):
     Bu dosya CLIENT bundle'a sızarsa BUILD HATA. Yalnız server-side
     repository'lerden (örn. `*.repository.server.ts`) ve route
     handler'larından import edilmeli. Erişim noktası:
     `lib/db/server.ts` barrel.

   ⚠️ PRIVILEGE BOUNDARY:
     Service-role RLS'i atlar — tüm tabloları görür. Bu provider'a
     ulaşan kod tipik olarak `authorizeAdminCaller` veya
     `adminGateway` arkasında olmalı.
   =============================================================== */

export const supabaseDbAdminProvider: DbProvider = {
  from(table) {
    return getSupabaseAdmin().from(table);
  },
  rpc(name, args) {
    return getSupabaseAdmin().rpc(name, args);
  },
};
