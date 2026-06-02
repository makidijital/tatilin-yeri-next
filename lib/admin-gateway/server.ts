import "server-only";

/* ===============================================================
   🛡️ FAZ 41 — ADMIN GATEWAY SERVER BARREL (SERVER-ONLY)
   ===============================================================
   Tek import path: `import { adminGateway } from "@/lib/admin-gateway/server"`.

   ⚠️ SERVER-ONLY (`import "server-only"`):
     Bu barrel CLIENT bundle'a sızarsa BUILD HATA. Implementation
     `./supabase-admin-gateway` ve `./audit.repository` de
     `import "server-only"` korumalı. adminGateway service-role
     privilege gerektirir.

   KULLANIM (yalnız server-side modüller):
     - Route handler'lar (app/api/.../route.ts)
     - Server-only services (`*.server.ts` veya `import "server-only"`
       olan service'ler)
     - Server actions

   ⚠️ PRIVILEGE BOUNDARY:
     `adminGateway` RLS'i atlar (service-role). Çağıran kod
     `authorizeAdminCaller` arkasında olmalı.

   Provider seçimi tek noktada — gelecekte farklı admin client
   eklenirse burada switch.
   =============================================================== */

import { supabaseAdminGateway } from "./supabase-admin-gateway";

export { adminAuditRepository } from "./audit.repository";

/** Aktif admin gateway (SERVER-ONLY). Service-role boundary. */
export const adminGateway = supabaseAdminGateway;
