import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import { createVillaFull } from "@/app/services/villa-admin.service";
import type { VillaFormPayload } from "@/app/services/villa-admin/types";

/* ===============================================================
   🛡️ /api/admin/villas — VILLA LIST (admin-only)
   ===============================================================
   GET → minimal villa list { id, title } admin dropdown'ları için
         (reservation detail villa selector, vb.).

   FAZ 2 frontend purge — daha önce client component'ler
   `supabase.from("villa").select("id, title")` ile anon read
   yapıyordu. Bu route adminFetch (Bearer) + service-role ile
   davranış BYTE-IDENTICAL.
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

  /* Query params:
       - activeOnly=1 → `.eq("is_active", true).is("deleted_at", null)
                         .order("title", asc)` (homepage-collection consumer)
     Default: no filter, no order (eski reservation form consumer'ları).
     `select` her zaman `id, title, slug, is_active, deleted_at` döner;
     ek field'lar mevcut consumer'lar için harmless (type ignore). */
  let activeOnly = false;
  try {
    activeOnly =
      (new URL(req.url).searchParams.get("activeOnly") || "") === "1";
  } catch {
    /* URL parse hata → default */
  }

  const { data, error } =
    await villaAdminRepository.findAdminSelectList(activeOnly);

  if (error) {
    console.error("[admin.villas.list] FAILED", error.message);
    return NextResponse.json(
      { ok: false, error: error.message || "Liste alınamadı" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, villas: data || [] });
}

/* POST — yeni villa create. createVillaFull service delege. Service
   orchestration (validate → slug → INSERT → 4 conditional relation INSERT
   → setVillaDistances → setVillaPrices) BYTE-IDENTICAL. Service return
   yeni villa id (string); route `{ ok, id }` döner.
   FAZ 2 frontend purge — villas/ekle/page.tsx (CLIENT) artık adminFetch
   POST kullanır; villa-admin.service barrel runtime import'u kaldırılır
   → server-only chain leak yok. */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  let body: VillaFormPayload;
  try {
    body = (await req.json()) as VillaFormPayload;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  try {
    const newId = await createVillaFull(body);
    return NextResponse.json({ ok: true, id: newId });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Oluşturulamadı";
    console.error("[admin.villas.create] FAILED", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 400 }
    );
  }
}
