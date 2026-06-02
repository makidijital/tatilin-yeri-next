import { supabase } from "@/lib/supabase";

import type { DbProvider } from "./db.provider";

/* ===============================================================
   🛡️ FAZ 1.1 — SUPABASE ANON DB PROVIDER (CLIENT-SAFE)
   ===============================================================
   `DbProvider` interface'inin Supabase JS anon-client implementation'u.
   Mevcut `@/lib/supabase` singleton'ı thin wrapper olarak dışa açar:
     • `from(table)` — `supabase.from(table)` (bind ile `this` korunur)
     • `rpc(name, args)` — `supabase.rpc(name, args)` (bind ile `this` korunur)

   ⚠️ BYTE-IDENTICAL DAVRANIŞ:
     Method'lar `supabase` singleton'ının kendi method'larıdır;
     `.bind(supabase)` ile `this` context'i korunur. Caller chain
     (`.select()`, `.eq()`, `.insert()`, `.maybeSingle()`, ...) ve
     PostgrestQueryBuilder return tipi birebir aynı. Auth context,
     RLS davranışı, cookie/storage lifecycle Supabase JS v2'ye
     delege; bu wrapper hiçbir runtime davranışı değiştirmez.

   CLIENT-SAFE:
     `@/lib/supabase` `import "server-only"` İÇERMEZ (anon client
     browser+server her ikisinde de çalışır). Bu dosya hem CLIENT
     hem SERVER caller'ları tarafından sorunsuz import edilebilir.
   =============================================================== */

export const supabaseDbProvider: DbProvider = {
  from: supabase.from.bind(supabase),
  rpc: supabase.rpc.bind(supabase),
};
