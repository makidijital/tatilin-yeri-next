import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { softDeleteVilla } from "@/app/services/villa-admin.service";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/soft-delete — VILLA SOFT DELETE
   ===============================================================
   POST → softDeleteVilla(id) service delege.
     - villa.deleted_at = now() + is_active=false (service içinde)
     - reservation history orphan bırakılmaz (soft delete)
   FAZ 2 frontend purge — VillaActions (CLIENT) adminFetch arkasında.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "id gerekli" },
      { status: 400 }
    );
  }

  const result = await softDeleteVilla(id);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "Silinemedi" },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true });
}
