import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";

/* ===============================================================
   🛡️ /api/admin/villas/[id]/prices — VILLA PRICES (admin-only)
   ===============================================================
   GET → villa_prices satırları (select="*") belirli villa için.

   FAZ 2 frontend purge — eski client davranışı:
     supabase.from("villa_prices").select("*").eq("villa_id", id)
   BYTE-IDENTICAL: aynı select * (tüm kolonlar), aynı filter.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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

  const { data, error } = await villaAdminRepository.findPricesByVillaId(id);

  if (error) {
    console.error("[admin.villas.prices] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Fiyatlar alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, prices: data || [] });
}
