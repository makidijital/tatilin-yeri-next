import { NextResponse } from "next/server";
import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import {
  callerHasPermission,
  FORBIDDEN_MESSAGE,
} from "@/lib/auth/action-authz";
import { createGalleryUploadTicket } from "@/app/services/villa-image/villa-image.direct-upload";

/* ===============================================================
   🛡️ POST /api/admin/villas/[id]/gallery/upload-url
   ===============================================================
   Villa galerisi DIRECT-TO-R2 upload'ı için kısa ömürlü imzalı PUT
   adresi üretir. Dosya byte'ları bu route'a GELMEZ; yalnız küçük JSON.

   AUTH: authorizeAdminCaller (mevcut admin cookie) + "villas" izni —
   eski `/api/admin/storage/upload` route'unun `villas/` öneki için
   uyguladığı izinle AYNI.

   REQUEST  (JSON): { size: number, contentType: "image/webp" }
   RESPONSE 200   : { ok: true, uploadUrl, key, contentType, expiresIn }
            4xx/5xx: { ok: false, error }

   Object key İSTEMCİDEN ALINMAZ; sunucu üretir (villa-image.direct-upload).
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

  if (!(await callerHasPermission(auth.caller.id, "villas"))) {
    return NextResponse.json(
      { ok: false, error: FORBIDDEN_MESSAGE },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;

  let body: { size?: unknown; contentType?: unknown };
  try {
    body = (await req.json()) as { size?: unknown; contentType?: unknown };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek gövdesi" },
      { status: 400 }
    );
  }

  const result = await createGalleryUploadTicket(id, {
    size: body?.size,
    contentType: body?.contentType,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: result.status }
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}
