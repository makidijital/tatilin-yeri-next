import { NextResponse } from "next/server";

import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🧪 GEÇİCİ DEBUG PROBE — AUTH-P2A (SİLİNECEK)
   ===============================================================
   AMAÇ: `authorizeAdminSession()` server-side runtime kanıtı —
   createSupabaseServerClient().auth.getSession()'ın server context'te
   access_token döndürüp verifyToken + admin_users lookup'ın geçtiğini
   uçtan uca doğrular.

   ⚠️ İZOLE: yalnız `authorizeAdminSession()` çağrılır. Yeni auth /
     verifyToken / lookup YAZILMAZ. Villa-image domaini (gallery.action /
     admin-gallery.action / service / repository / storage / R2)
     DOKUNULMADI. Sonuç PASS olunca bu dosya SİLİNİR.

   ⚠️ authorizeAdminSession iç detayları (token length vb.) route'a
     expose edilmez; `result.ok`/`status`/`error` TRANSİTİF kanıttır:
       - ok:true          → getSession→access_token + verifyToken +
                            admin_users lookup HEPSİ geçti.
       - 401 "Oturum bulunamadı"     → getSession token DÖNMEDİ.
       - 401 "Oturum doğrulanamadı"  → verifyToken FAIL.
       - 403 …            → admin_users lookup fail / not admin / pasif.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const result = await authorizeAdminSession();

  if (result.ok) {
    console.log("[_debug.auth-session] PASS", {
      ok: true,
      derived:
        "getSession→access_token OK · verifyToken OK · admin_users lookup OK",
      callerId: result.caller.id,
      callerEmail: result.caller.email,
      callerActive: result.caller.is_active,
    });
    return NextResponse.json({
      ok: true,
      status: 200,
      error: null,
      caller: {
        id: result.caller.id,
        email: result.caller.email,
        is_active: result.caller.is_active,
      },
    });
  }

  console.log("[_debug.auth-session] FAIL", {
    ok: false,
    status: result.status,
    error: result.error,
    derived:
      result.status === 401
        ? "401 → 'Oturum bulunamadı' = getSession token yok · 'Oturum doğrulanamadı' = verifyToken fail"
        : "403 → admin_users lookup fail / not admin / pasif",
  });
  return NextResponse.json(
    {
      ok: false,
      status: result.status,
      error: result.error,
      caller: null,
    },
    { status: result.status }
  );
}
