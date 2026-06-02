import { NextResponse } from "next/server";

import { authorizeAdminCaller } from "@/lib/admin-route-auth";
import { dbAdmin } from "@/lib/db/server";

/* ===============================================================
   🛡️ /api/admin/taxonomies — TAXONOMY LOOKUPS (admin-only)
   ===============================================================
   GET → 5 paralel taxonomy fetch:
     - villa_locations    { id, name, slug }
     - villa_types        { id, name, slug }
     - villa_features     { id, name }
     - rule_items         { id, title }          (ORDER created_at asc)
     - price_include_items{ id, title }          (ORDER created_at asc)

   FAZ 2 frontend purge — daha önce admin client component'ler bu
   query'leri DOĞRUDAN anon supabase ile çekiyordu (RLS-public read).
   Bu route adminFetch (Bearer) + service-role ile davranış
   BYTE-IDENTICAL: aynı select shape'leri tek route response'unda
   birleştirilir. UI tarafı taxonomy label map'ini build eder.

   🛡️ ADDITIVE EXTEND — locations/types/features field'ları AYNEN.
   ruleItems + priceIncludeItems eklendi (yeni consumer:
   villas/ekle/page.tsx dropdown init). Mevcut consumer'lar (henüz
   yok) için ek field'lar harmless (extra key'leri ignore eder).
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

  /* 🛡️ FAZ 2 — rule_items + price_include_items query shape'i
     villas/ekle/page.tsx legacy supabase çağrılarıyla BYTE-IDENTICAL:
       .select("id, title").order("created_at", { ascending: true })
     Master fetch (admin dropdown). RLS-public read aynı semantic. */
  const [locsRes, typesRes, featsRes, rulesRes, includesRes] =
    await Promise.all([
      dbAdmin
        .from("villa_locations")
        .select("id, name, slug, filter_group_name"),
      dbAdmin.from("villa_types").select("id, name, slug"),
      dbAdmin.from("villa_features").select("id, name"),
      dbAdmin
        .from("rule_items")
        .select("id, title")
        .order("created_at", { ascending: true }),
      dbAdmin
        .from("price_include_items")
        .select("id, title")
        .order("created_at", { ascending: true }),
    ]);

  return NextResponse.json({
    ok: true,
    locations: locsRes.data || [],
    types: typesRes.data || [],
    features: featsRes.data || [],
    ruleItems: rulesRes.data || [],
    priceIncludeItems: includesRes.data || [],
  });
}
