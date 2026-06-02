import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/* ===============================================================
   🛡️ FAZ 54 — MAIL LOGS STATS (admin only, GET)
   ===============================================================
   Admin Mail Logları kartının mount + cleanup sonrası okuduğu
   read-only snapshot endpoint'i.

   AUTH:
     Bearer <access_token> + admin_users is_active=true
     (lib/admin-route-auth.ts > authorizeAdminCaller)

   QUERY STRATEJİSİ:
     - total: head: true, count: "exact" → satır gövdesi gelmez,
       yalnız sayım. 10k+ log için bile O(index-scan).
     - failed: aynı head count, status='failed' filtreli.
     - latest_created_at: tek satır SELECT created_at ORDER BY desc
       LIMIT 1.
     3 paralel query → tek round-trip latency'si.

   RESPONSE:
     { ok: true, total, failed, latest_created_at }
   ============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authorizeAdminCaller(req);
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status }
    );
  }

  const supabase = getSupabaseAdmin();

  const [totalRes, failedRes, latestRes] = await Promise.all([
    supabase
      .from("mail_logs")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("mail_logs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed"),
    supabase
      .from("mail_logs")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (totalRes.error || failedRes.error || latestRes.error) {
    const msg =
      totalRes.error?.message ||
      failedRes.error?.message ||
      latestRes.error?.message ||
      "stats query FAILED";
    console.error("[admin.mail-logs.stats] FAILED", msg);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  }

  const latest =
    (latestRes.data as { created_at: string | null } | null)?.created_at ??
    null;

  return NextResponse.json({
    ok: true,
    total: totalRes.count ?? 0,
    failed: failedRes.count ?? 0,
    latest_created_at: latest,
  });
}
