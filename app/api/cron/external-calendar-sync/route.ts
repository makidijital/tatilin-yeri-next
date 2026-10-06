import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { externalCalendarSourceServerRepository } from "@/lib/db/external-calendar-source.repository.server";
import { syncExternalCalendarSource } from "@/app/services/external-calendar.service";
import { externalCalendarEventServerRepository } from "@/lib/db/external-calendar-event.repository.server";
import { getExternalCalendarToday } from "@/lib/external-calendar-past";

/* ===============================================================
   🛡️ CRON — EXTERNAL CALENDAR SYNC (thin wrapper)
   ===============================================================
   Zamanlama: her 4 saatte bir (Coolify Scheduled Task).
   Tetikleyici: zamanlanmış görev → GET /api/cron/external-
   calendar-sync (Authorization: Bearer <CRON_SECRET>).

   ⚠️ TASARIM PRENSİBİ:
     Mevcut `/api/admin/external-calendars/sync` route'una DOKUNULMADI;
     admin manuel sync yeteneği AYNEN. Bu cron wrapper paralel bir
     endpoint — yalnız iki fark:
       1. Auth: admin Bearer JWT yerine CRON_SECRET Bearer
       2. Aktif tüm source'ları tek isteğde döner (admin endpoint
          tek `source_id` alıyor; cron için pratik değil)

   ⚠️ BUSINESS LOGIC REUSE:
     `syncExternalCalendarSource(sourceId)` service'i AYNEN
     çağrılır. Sync mantığı (SSRF guard, parser, upsert, deactivate
     sweep, manuel-override koruma) tek source-of-truth servisten gelir.

   ⚠️ ACTIVITY LOG:
     Admin sync route'undaki `insertAdminActivityLog` cron context'inde
     YOK (cron operation admin değil; activity log admin operasyonları
     içindir). Cron sonucu uygulama log'larında izlenir. Sentry'ye
     fail durumunda otomatik akar (instrumentation onRequestError).

   ⚠️ KAPSAM:
     Sadece `external_calendar_sources.is_active = true` kayıtları
     işlenir. Pasif source'lar sync edilmez (mevcut admin davranışı
     ile aynı).
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* GET — zamanlanmış görevin çağırdığı method.
   POST eklemiyoruz; tek entry point yeterli. */
export async function GET(req: Request) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  /* Aktif source'ları çek. service-role; mig 029 RLS authenticated
     SELECT için bu cron context anon JWT taşımıyor → service-role
     gerekli. */
  const { data: sources, error: listErr } =
    await externalCalendarSourceServerRepository.findActiveIds();

  if (listErr) {
    console.error(
      "[cron.external-calendar-sync] LIST_FAILED",
      listErr.message
    );
    return NextResponse.json(
      { ok: false, error: listErr.message },
      { status: 500 }
    );
  }

  const sourceIds = (sources || [])
    .map((r) => (r as { id?: unknown })?.id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  /* Her source için ayrı `syncExternalCalendarSource` çağrısı.
     Service throw etmez; { ok:false, error, stage } döner →
     loop devam eder (bir source fail olsa diğerleri sync olsun).
     Sequential — concurrent fetch external provider rate-limit
     riski oluşturur. */
  const results: Array<{
    sourceId: string;
    ok: boolean;
    imported?: number;
    deactivated?: number;
    skipped?: number;
    totalSeen?: number;
    skippedPast?: number;
    deletedPast?: number;
    error?: string;
    stage?: string;
  }> = [];

  for (const id of sourceIds) {
    const r = await syncExternalCalendarSource(id);
    if (r.ok) {
      results.push({
        sourceId: r.sourceId,
        ok: true,
        imported: r.imported,
        deactivated: r.deactivated,
        skipped: r.skipped,
        totalSeen: r.totalSeen,
        skippedPast: r.skippedPast,
        deletedPast: r.deletedPast,
      });
    } else {
      console.error(
        "[cron.external-calendar-sync] SOURCE_FAILED",
        r.sourceId,
        r.stage,
        r.error
      );
      results.push({
        sourceId: r.sourceId,
        ok: false,
        error: r.error,
        stage: r.stage,
      });
    }
  }

  /* 🛡️ GEÇMİŞ CLEANUP (tüm kaynaklar) — sync yalnız aktif kaynakların
     geçmiş satırlarını siler; pasif kaynakların `end_date < bugün`
     (Europe/Istanbul) satırları burada temizlenir. Kriter YALNIZ bu;
     bugünle kesişen / gelecek event'lere dokunulmaz. Fail-soft. */
  let pastCleanupDeleted: number | null = null;
  const today = getExternalCalendarToday();
  try {
    const { data: pastData, error: pastErr } =
      await externalCalendarEventServerRepository.deletePastAll(today);
    if (pastErr) {
      console.error(
        "[cron.external-calendar-sync] PAST_CLEANUP_FAILED",
        pastErr.message
      );
    } else {
      pastCleanupDeleted = Array.isArray(pastData) ? pastData.length : 0;
    }
  } catch (err) {
    console.error(
      "[cron.external-calendar-sync] PAST_CLEANUP_FAILED",
      err instanceof Error ? err.message : "unknown"
    );
  }

  const successCount = results.filter((r) => r.ok).length;
  const failCount = results.length - successCount;

  console.log(
    "[cron.external-calendar-sync] DONE",
    `total=${results.length}`,
    `success=${successCount}`,
    `fail=${failCount}`,
    `pastDeleted=${pastCleanupDeleted ?? "ERR"}`,
    `today=${today}`
  );

  /* HTTP 200 — zamanlayıcı başarı kabul eder; partial failure
     individual source error'larında. Aggregate JSON yanıtta ve
     uygulama log'larında görünür. */
  return NextResponse.json({
    ok: true,
    total: results.length,
    success: successCount,
    fail: failCount,
    past_cleanup: { date: today, deleted: pastCleanupDeleted },
    results,
  });
}
