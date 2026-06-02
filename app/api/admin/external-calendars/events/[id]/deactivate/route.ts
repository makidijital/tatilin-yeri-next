import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  extractAdminContextFromRequest,
  insertAdminActivityLog,
} from "@/app/services/admin-activity-log.service";

/* ===============================================================
   🛡️ FAZ 56G+ — ADMIN EXTERNAL EVENT DEACTIVATE
   ===============================================================
   POST /api/admin/external-calendars/events/[id]/deactivate
   AUTH: authorizeAdminCaller (Bearer JWT + admin_users.is_active)

   FLOW:
     1) Admin doğrula
     2) Event'i fetch et (entity_title için)
     3) UPDATE is_active=false, manually_deactivated=true (idempotent)
     4) Activity log
     5) JSON response

   ⚠️ HARD DELETE YASAK — yalnız soft toggle. Audit / sync geçmişi
   korunur. RLS authenticated INSERT/UPDATE policy YOK → service-role
   ile yazılır (sync pipeline ile aynı disiplin).

   KORUNAN DAVRANIŞ:
     • Reservation flow / overlap trigger (mig 031) etkilenmiyor
     • EXCLUDE constraint dokunulmuyor
     • Sync stale-deactivate normal akışı korunur
     • Calendar render — is_active=false event availability'ye
       girmez (FAZ 56C `getBlockedVillaIds` `.eq("is_active", true)`)

   IDEMPOTENT:
     Zaten is_active=false ise yine başarılı; UPDATE row count = 0.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const { id } = await context.params;
  const eventId = (id || "").toString().trim();
  if (!eventId) {
    return NextResponse.json(
      { ok: false, error: "event id gerekli" },
      { status: 400 }
    );
  }

  /* getSupabaseAdmin() service-role client. RLS bypass — events tablosu
     authenticated UPDATE policy yok; tüm SELECT/UPDATE'ler bu client
     üzerinden gider. getSupabaseAdmin throw ederse (env eksik) catch'e
     düşer, actual mesaj response'a yansır. */
  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "service-role init hatası";
    console.error(
      "[admin.external_events.deactivate] ADMIN CLIENT INIT FAILED",
      msg
    );
    return NextResponse.json(
      { ok: false, error: `Admin client başlatılamadı: ${msg}` },
      { status: 500 }
    );
  }

  /* MINIMAL EXISTENCE + STATE FETCH — yalnız core kolonlar.
     `manually_deactivated` ve embed (source/villa) BURADA YOK:
       • manually_deactivated migration 032 sonrası eklenir; route
         önce yokken de çalışabilsin diye SELECT'ten çıkarıldı.
         (UPDATE payload'ı yine `manually_deactivated: true` set
         eder; eğer kolon yoksa UPDATE error'u zaten net mesajla
         yukarı taşınır.)
       • Source/villa embed yalnız activity log entity_title için
         lazımdı; PostgREST embed fail-prone (FK relationship cache,
         RLS) → ayrı fail-soft fetch'e taşındı (aşağıda). */
  const { data: existing, error: fetchErr } = await supabase
    .from("external_calendar_events")
    .select(
      "id, villa_id, source_id, external_uid, start_date, end_date, summary, is_active"
    )
    .eq("id", eventId)
    .maybeSingle();

  if (fetchErr) {
    console.error(
      "[admin.external_events.deactivate] FETCH FAILED",
      fetchErr.message
    );
    return NextResponse.json(
      { ok: false, error: `Event okunamadı: ${fetchErr.message}` },
      { status: 500 }
    );
  }
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "Event bulunamadı" },
      { status: 404 }
    );
  }

  type EventRow = {
    id: string;
    villa_id: string;
    source_id: string;
    external_uid: string;
    start_date: string;
    end_date: string;
    summary: string | null;
    is_active: boolean;
  };
  const row = (existing as unknown) as EventRow;

  /* UPDATE — service-role (RLS bypass). manually_deactivated=true
     migration 032 gerektirir; uygulanmadıysa UPDATE error'u response'a
     net mesajla taşınır → admin gerçek sebebi görür ve migration'ı
     uygular. */
  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("external_calendar_events")
    .update({
      is_active: false,
      manually_deactivated: true,
      updated_at: now,
    })
    .eq("id", eventId);

  if (updateErr) {
    console.error(
      "[admin.external_events.deactivate] UPDATE FAILED",
      updateErr.message
    );
    return NextResponse.json(
      {
        ok: false,
        error: `Event pasifleştirilemedi: ${updateErr.message}`,
      },
      { status: 500 }
    );
  }

  /* ENRICHED FETCH for activity log entity_title — fail-soft.
     Source name + villa title yalnız audit kozmetiği; embed fail
     ederse generic title kullanılır, UPDATE başarısı etkilenmez. */
  let sourceName = "Harici";
  let villaTitle = row.villa_id;
  try {
    const { data: srcData } = await supabase
      .from("external_calendar_sources")
      .select("source_name")
      .eq("id", row.source_id)
      .maybeSingle();
    if (
      srcData &&
      typeof (srcData as { source_name?: string | null }).source_name === "string"
    ) {
      const n = (srcData as { source_name: string }).source_name.trim();
      if (n) sourceName = n;
    }
    const { data: vData } = await supabase
      .from("villa")
      .select("title")
      .eq("id", row.villa_id)
      .maybeSingle();
    if (
      vData &&
      typeof (vData as { title?: string | null }).title === "string"
    ) {
      const t = (vData as { title: string }).title.trim();
      if (t) villaTitle = t;
    }
  } catch {
    /* enriched lookup hatası audit'i bozmaz. */
  }

  /* Activity log — fail-safe. */
  try {
    const ctx = extractAdminContextFromRequest(req, auth.caller);
    await insertAdminActivityLog(ctx, {
      action: "external_calendar_event.deactivated",
      entity_type: "external_calendar",
      entity_id: row.id,
      entity_title: `${sourceName} · ${villaTitle} · ${row.start_date} → ${row.end_date}`,
      before_data: { is_active: row.is_active },
      after_data: { is_active: false, manually_deactivated: true },
      diff_summary: row.is_active
        ? ["is_active: true → false", "manually_deactivated: → true"]
        : ["manually_deactivated: → true (idempotent)"],
    });
  } catch (logErr) {
    /* Activity log hatası işlemi bozmaz. */
    console.warn(
      "[admin.external_events.deactivate] activity log WARN",
      logErr instanceof Error ? logErr.message : "unknown"
    );
  }

  return NextResponse.json({
    ok: true,
    id: row.id,
    already_inactive: !row.is_active,
  });
}
