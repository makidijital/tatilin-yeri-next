import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { settingsServerRepository } from "@/lib/db/settings.repository.server";

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
  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    const { data, error } =
      await settingsServerRepository.findSingletonStrict();

    if (error) {
      console.error("[admin.settings.read] FAILED", error.message);
      return NextResponse.json(
        { ok: false, error: error.message || "Settings alınamadı" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, settings: data });
  } catch (err) {
    /* 🛡️ SON KAPI — authorizeAdminCaller (verifyToken/getSupabaseAdmin)
       veya beklenmedik bir throw route'tan kaçarsa Next HTML 500 döner
       ve client `res.json()` → JSON.parse `<` üzerinde patlar. Bu catch
       her durumda JSON zarfı garanti eder (davranış: yetki/okuma hatası
       zaten 500 JSON dönüyordu → aynı seviye). */
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin.settings.read] EXCEPTION", msg);
    return NextResponse.json(
      { ok: false, error: "Settings alınamadı" },
      { status: 500 }
    );
  }
}

/* ===============================================================
   🛡️ PUT → SETTINGS UPDATE (admin-only, FAZ 6 S3)
   ===============================================================
   Eski `settings.service.updateSettings` (anon client + RLS
   is_active_admin) yerine app'in secure admin pattern'i:
   authorizeAdminCaller (Bearer JWT → verifyToken → is_active_admin)
   → service-role repo (RLS bypass). Davranış BYTE-IDENTICAL:
     - current.id lookup (findSingleton) → yoksa fail (eski NO_ROW)
     - updateById(id, values) → error → fail
     - başarı → { ok: true }
   Secret yetkilendirmesi eskiyle AYNI seviyede (JWT-doğrulamalı admin).
   =============================================================== */
export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const auth = await authorizeAdminCaller(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: auth.error },
        { status: auth.status }
      );
    }

    let values: Record<string, unknown>;
    try {
      values = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { ok: false, error: "Geçersiz istek" },
        { status: 400 }
      );
    }

    const { data: current, error: readErr } =
      await settingsServerRepository.findSingleton();
    const id = (current as { id?: string } | null)?.id;
    if (readErr || !id) {
      console.error("[admin.settings.update] NO_ROW — settings tablosu boş");
      return NextResponse.json(
        { ok: false, error: "Settings satırı bulunamadı" },
        { status: 500 }
      );
    }

    const { error } = await settingsServerRepository.updateById(id, values);
    if (error) {
      console.error("[admin.settings.update] FAILED", error.message);
      return NextResponse.json(
        { ok: false, error: error.message || "Settings güncellenemedi" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    /* 🛡️ SON KAPI — GET ile aynı gerekçe: authorizeAdminCaller veya
       beklenmedik throw HTML 500'e düşmesin; her durumda JSON zarfı.
       Başarısızlıkta client `updateSettingsClient` zaten `false` alır
       (davranış: eski 500 JSON ile aynı seviye). */
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    console.error("[admin.settings.update] EXCEPTION", msg);
    return NextResponse.json(
      { ok: false, error: "Settings güncellenemedi" },
      { status: 500 }
    );
  }
}
