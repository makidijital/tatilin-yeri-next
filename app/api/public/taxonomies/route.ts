import { NextResponse } from "next/server";

import { villaLocationRepository } from "@/lib/db/villa-location.repository";
import { villaTypeRepository } from "@/lib/db/villa-type.repository";
import { villaFeatureRepository } from "@/lib/db/villa-feature.repository";

/* ===============================================================
   🛡️ /api/public/taxonomies — PUBLIC TAXONOMY LOOKUPS
   ===============================================================
   GET → 3 paralel taxonomy fetch:
     - villa_locations { id, name, slug }
     - villa_types     { id, name, slug }
     - villa_features  { id, name }

   AUTH: PUBLIC (RLS-public read; bu tablolar zaten anon erişime
   açık RLS phase 1 / migration 037). Route yalnız client-side
   `@/lib/supabase` direct erişimini API boundary arkasına alır;
   güvenlik semantiği değişmez.

   FAZ 2 frontend purge — public form'lar (teklif-al vb.) için
   dropdown options. Davranış BYTE-IDENTICAL: aynı select shape'leri
   tek route response'unda birleştirilir.

   RATE-LIMIT: bu route public-read taxonomy; mevcut anon supabase
   path'inde rate-limit yoktu, korumayı çoğaltmıyor. Üzerine rate-
   limit eklemek behavior değiştirir; eklenmiyor.
   =============================================================== */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const [locsRes, typesRes, featsRes] = await Promise.all([
    villaLocationRepository.findAllForPublicTaxonomy(),
    villaTypeRepository.findAllForPublicTaxonomy(),
    villaFeatureRepository.findAllForPublicTaxonomy(),
  ]);

  return NextResponse.json({
    ok: true,
    locations: locsRes.data || [],
    types: typesRes.data || [],
    features: featsRes.data || [],
  });
}
