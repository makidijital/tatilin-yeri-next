import "server-only";

/* ===============================================================
   🛡️ SUPABASE ADMIN CLIENT — CANONICAL ENTRY (service-role)
   ===============================================================
   Mevcut `lib/supabase-admin.ts` aynen yerinde duruyor (40+
   import noktası); bu dosya yeni canonical path olarak onu
   re-export eder. Caller'lar zaman içinde `@/lib/supabase/admin`
   path'ine kademeli olarak taşınabilir — bu turda DOKUNULMUYOR.

   GÜVENLİK SINIRI:
     `import "server-only"` — client bundle'a sızarsa BUILD HATA.
     Re-export edilen `getSupabaseAdmin` zaten `server-only`
     korumalı.

   KULLANIM:
     // Yeni canonical path (önerilen ileride):
     import { getSupabaseAdmin } from "@/lib/supabase/admin";
     // Eski path AYNEN çalışmaya devam eder:
     import { getSupabaseAdmin } from "@/lib/supabase-admin";

   ⚠️ FAZ KAPSAMI:
     Bu dosya sadece path consolidation için var. Hiçbir caller
     henüz buraya migrate edilmedi — eski import path'leri
     bozulmuyor. Faz 4+ kapsamında kademeli geçiş yapılabilir.
=============================================================== */

export { getSupabaseAdmin } from "@/lib/supabase-admin";
