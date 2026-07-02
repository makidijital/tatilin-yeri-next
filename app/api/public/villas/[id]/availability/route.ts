import { NextResponse } from "next/server";

import { villaRepository } from "@/lib/db/villa.repository";
import {
  fetchExternalCalendarStringsForVilla,
  EMPTY_EXTERNAL_STRING_ARRAYS,
  type ExternalCalendarStringArrays,
} from "@/lib/external-calendar.public.helper";
import { getVillaPrices } from "@/app/services/villa-price.service";
import type { VillaPriceEmbed } from "@/lib/villa-row.types";
import { applyRateLimit } from "@/lib/rate-limit";

/* ===============================================================
   🛡️ GET /api/public/villas/[id]/availability
   ===============================================================
   AMAÇ:
     VillaCardBookingModal client component'i için BOOKING context
     verilerini server-side TOPLU olarak döner. Modal browser'da
     `getSupabaseAdmin()` (service role) çağıramaz — bu route
     server-only helper'ları izolasyon altında kullanır.

     ÖNEMLI: Response, BookingSidebar'ın server-side aldığı
     prop setiyle birebir eşittir (drift YOK):

       BookingSidebar prop                 ↔  API response field
       ────────────────────────────────────────────────────────
       prices                               ↔  prices
       deposit                              ↔  config.deposit
       cleaning_fee                         ↔  config.cleaning_fee
       cleaning_currency                    ↔  config.cleaning_currency
       cleaning_limit                       ↔  config.cleaning_limit
       custom_prepayment_rate               ↔  config.custom_prepayment_rate
       minimum_stay_nights                  ↔  config.minimum_stay_nights
       externalBlocks                       ↔  externalBlocks

     (villaId + villaSlug parent VillaCard zaten biliyor.)

   CALLER:
     - app/components/villa/VillaCardBookingModal.tsx (client)
       Modal mount sonrası TEK fetch; engine'e tüm input'lar
       buradan akar (VillaCard caller drift'i bypass edilir).

   RESPONSE SHAPE:
     {
       config: {
         deposit: number | null,
         cleaning_fee: number | null,
         cleaning_currency: string | null,
         cleaning_limit: number | null,
         custom_prepayment_rate: number | null,
         minimum_stay_nights: number | null
       },
       prices: VillaPriceEmbed[],          // villa_prices rows
       externalBlocks: ExternalCalendarStringArrays
     }

   DAVRANIŞ DOKUNULMAYAN:
     - external blocks expansion semantic'i (helper içinde)
     - villa table row shape
     - villa_prices shape (getVillaPrices service kullanıldı)
     - BookingSidebar (server-side props ile beslenir — değişmedi)

   GÜVENLİK:
     - PUBLIC route (auth yok). DÖNEN VERİLER:
       * villa.deposit / cleaning_* / custom_prepayment_rate /
         minimum_stay_nights → public villa detail sayfasında
         ZATEN gösteriliyor
       * villa_prices rows → public villa detail sayfasında ZATEN
         gösteriliyor (PriceList + BookingSidebar)
       * external_calendar_events.start_date / end_date (expand)
         → BookingSidebar'da ZATEN render ediliyor (kırmızı blok)
     - Service role key SADECE server'da kullanılır; response'a
       sadece tarih string'leri ve sayısal alanlar gider.

   CACHE:
     - `no-store` — availability gerçek-zamanlı; stale veri yanlış
       blocking gösterebilir.
   =============================================================== */

type VillaConfig = {
  deposit: number | null;
  cleaning_fee: number | null;
  cleaning_currency: string | null;
  cleaning_limit: number | null;
  custom_prepayment_rate: number | null;
  minimum_stay_nights: number | null;
};

type ResponseShape = {
  config: VillaConfig;
  prices: VillaPriceEmbed[];
  externalBlocks: ExternalCalendarStringArrays;
};

const EMPTY_CONFIG: VillaConfig = {
  deposit: null,
  cleaning_fee: null,
  cleaning_currency: null,
  cleaning_limit: null,
  custom_prepayment_rate: null,
  minimum_stay_nights: null,
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  /* Rate limit: 30 req/dakika/IP. Modal lazy mount + nadir refresh
     pattern bu limiti aşmaz; bot scraping korunur. Limit aşılırsa
     429 + stable JSON; mevcut başarı path'i değişmez. */
  const limited = await applyRateLimit(req, "availability");
  if (limited) return limited;

  const { id } = await ctx.params;

  /* Defansif id validation — UUID enforcement yapmıyoruz (Supabase
     zaten geçersiz formatta empty döner) ama tip ve boş string
     erken-reddi yapıyoruz. */
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    return NextResponse.json(
      { error: "id required" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    /* Paralel fetch — 3 bağımsız kaynak:
         1. villa row (deposit, cleaning_*, prepayment, min stay) — anon
         2. villa_prices (getVillaPrices service, anon) — BookingSidebar
            sayfa server-fetch'i ile birebir aynı service çağrısı
         3. external_calendar_events (service role, helper internal) */
    const [configRes, prices, externalBlocks] = await Promise.all([
      villaRepository.findAvailabilityConfigById(id),
      getVillaPrices(id),
      fetchExternalCalendarStringsForVilla(id),
    ]);

    if (configRes.error) {
      console.error(
        "[api.public.villas.availability] config fetch:",
        configRes.error.message
      );
    }

    const raw = configRes.data as Record<string, unknown> | null;
    const config: VillaConfig = raw
      ? {
          deposit:
            typeof raw.deposit === "number" ? raw.deposit : null,
          cleaning_fee:
            typeof raw.cleaning_fee === "number"
              ? raw.cleaning_fee
              : null,
          cleaning_currency:
            typeof raw.cleaning_currency === "string"
              ? raw.cleaning_currency
              : null,
          cleaning_limit:
            typeof raw.cleaning_limit === "number"
              ? raw.cleaning_limit
              : null,
          custom_prepayment_rate:
            typeof raw.custom_prepayment_rate === "number"
              ? raw.custom_prepayment_rate
              : null,
          minimum_stay_nights:
            typeof raw.minimum_stay_nights === "number"
              ? raw.minimum_stay_nights
              : null,
        }
      : EMPTY_CONFIG;

    /* getVillaPrices defansif olarak [] döner (hata durumunda). */
    const safePrices: VillaPriceEmbed[] = Array.isArray(prices)
      ? (prices as VillaPriceEmbed[])
      : [];

    const body: ResponseShape = {
      config,
      prices: safePrices,
      externalBlocks: externalBlocks || EMPTY_EXTERNAL_STRING_ARRAYS,
    };

    return NextResponse.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[api.public.villas.availability] EXCEPTION:", msg);

    /* Hata durumunda 500 — modal kendi defansif fallback'lerini
       uygular (EMPTY_CONFIG + [] prices + EMPTY_EXTERNAL).
       UI yine açılır, sadece engine inputları zayıflar. */
    return NextResponse.json(
      { error: "availability fetch failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
