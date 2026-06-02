import { NextResponse } from "next/server";

import { authorizeCronRequest } from "@/lib/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/* ===============================================================
   🛡️ CRON — MAIL LOGS RETENTION (thin wrapper)
   ===============================================================
   Vercel cron schedule: her gece (vercel.json crons[]).
   Tetikleyici: Vercel cron infrastructure → GET /api/cron/mail-logs-
   cleanup (Authorization: Bearer <CRON_SECRET>).

   ⚠️ TASARIM PRENSİBİ:
     Mevcut `/api/admin/mail-logs/cleanup` route'una DOKUNULMADI;
     admin manuel cleanup yeteneği AYNEN (mode "30d" | "all"). Bu cron
     wrapper paralel bir endpoint — yalnız iki fark:
       1. Auth: admin Bearer JWT yerine CRON_SECRET Bearer
       2. Mode sabit "30d" — admin endpoint'indeki 30 günlük cutoff
          değeri (line 81-88) AYNEN.

   ⚠️ BUSINESS LOGIC PARITY:
     Cutoff hesap: `Date.now() - 30 * 24 * 60 * 60 * 1000` → ISO.
     DELETE: `from("mail_logs").delete({ count: "exact" }).lt("created_
     at", cutoff)`. Admin route'undaki "30d" şubesiyle BYTE-IDENTICAL.

   ⚠️ ACTIVITY LOG:
     Admin cleanup route'undaki `insertAdminActivityLog` cron
     context'inde YOK (cron operation admin değil; existing cron
     wrapper'larıyla aynı disiplin). Cron sonucu Vercel cron logs +
     console.log üzerinden izlenir; fail → Sentry instrumentation
     onRequestError üzerinden otomatik akar.
=============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = authorizeCronRequest(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const result = await supabase
    .from("mail_logs")
    .delete({ count: "exact" })
    .lt("created_at", cutoff);

  if (result.error) {
    console.error("[cron.mail-logs-cleanup] FAILED", {
      message: result.error.message,
    });
    return NextResponse.json(
      { ok: false, error: result.error.message },
      { status: 500 }
    );
  }

  const deleted = result.count ?? 0;
  console.log("[cron.mail-logs-cleanup] OK", { deleted, cutoff });
  return NextResponse.json({ ok: true, mode: "30d", deleted });
}
