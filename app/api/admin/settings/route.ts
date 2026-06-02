import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ /api/admin/settings — SETTINGS READ (admin-only)
   ===============================================================
   GET → settings row (singleton). Caller bekleyen field'ları
   response'tan okur. Şu an reservation detail page yalnız
   `prepayment_rate` field'ını okuyor; route tam row döner (kalan
   field'lar gelecek caller'lar için).

   FAZ 2 frontend purge — eski client davranışı:
     supabase.from("settings").select("prepayment_rate").single()
   Davranış BYTE-IDENTICAL: `.single()` semantic'i korunur (tek
   satır), service-role read.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { data, error } = await dbAdmin
    .from("settings")
    .select("*")
    .single();

  if (error) {
    console.error("[admin.settings.read] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Settings alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, settings: data });
}
