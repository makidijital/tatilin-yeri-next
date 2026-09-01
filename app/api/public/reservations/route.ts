import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

import { createReservation } from "@/app/services/reservation.service";
import { reservationServerRepository } from "@/lib/db/reservation.repository.server";
import { verifyPublicReservationPrice } from "@/app/services/reservation/_helpers/price-verify";
import { verifyPublicReservationStayRules } from "@/app/services/reservation/_helpers/stay-verify";
import { applyRateLimit } from "@/lib/rate-limit";
import type { ReservationCreateInput } from "@/app/services/reservation/types";

/* ===============================================================
   🛡️ POST /api/public/reservations — PUBLIC BOOKING CREATE (server)
   ===============================================================
   AMAÇ:
     Public rezervasyon CREATE'i client-side anon yerine SERVER'da
     service_role ile yapar. reservations PHASE 3 (migration 040)
     admin-only RLS sonrası anon INSERT reddedilir; bu route
     `reservationServerRepository` (service_role) ile insert eder →
     RLS bypass + `.insert().select().single()` RETURNING görünür.

   FLOW (createReservation orchestrator BYTE-IDENTICAL):
     - validation (5 throw) — server'da
     - conflict fast-path → check_villa_availability_conflict RPC
     - commission snapshot → villa public read
     - INSERT → service_role (injected)
     - EXCLUDE constraint 23P01 → mapInsertError → "Bu tarihler dolu"

   GÜVENLİK:
     - Yalnız `{ id, reservation_no }` döner — PII (name/phone/email/
       price/commission/payload) RESPONSE'a ASLA girmez.
     - Rate-limit: "availability" bucket (30/dk/IP) — bot/abuse koruması.
     - service_role yalnız server; client'a sızmaz.

   CALLER:
     - app/components/reservation/ReservationForm.tsx (fetch POST)
   =============================================================== */

export async function POST(req: Request): Promise<Response> {
  /* Rate-limit — dedicated "reservation" bucket (3/10dk/IP); booking
     CREATE düşük frekanslı, availability okumalarından izole. */
  const limited = await applyRateLimit(req, "reservation");
  if (limited) return limited;

  let body: ReservationCreateInput;
  try {
    body = (await req.json()) as ReservationCreateInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Geçersiz istek" },
      { status: 400 }
    );
  }

  /* 🛡️ SERVER-SIDE PRICE VERIFY — COMPARE/LOG MODE (enforce edilmiyor).
     Client'ın gönderdiği finansal alanları (total_price_try /
     cleaning_fee_try / prepayment_amount / remaining_payment) sunucuda
     mevcut price engine ile yeniden hesaplayıp karşılaştırır; drift'i
     structured log'lar. Fail-open: ASLA booking'i bloklamaz/throw etmez.
     Enforcement bir SONRAKİ fazda (strict) eklenecek. */
  await verifyPublicReservationPrice(body);

  try {
    /* 🛡️ ORPHAN-GAP GATE — frontend bypass edilirse min-stay'den kısa
       kullanılamaz boşluk bırakan rezervasyon backend'de de reddedilir.
       Ayar kapalı/okunamaz veya veri toplanamazsa BLOKLAMAZ (fail-open);
       yalnız NET orphan ihlali throw eder → aşağıdaki catch 400 döndürür.
       Mevcut overlap/fiyat/create akışına DOKUNMAZ (ayrı, additive).
       createReservation'dan ÖNCE çağrılır. */
    await verifyPublicReservationStayRules({
      villa_id: body?.villa_id,
      start_date: body?.start_date,
      end_date: body?.end_date,
    });

    const created = await createReservation(body, {
      insertRepository: reservationServerRepository,
    });

    const row = created as
      | { id?: string; reservation_no?: string }
      | null;

    return NextResponse.json({
      ok: true,
      reservation: {
        id: row?.id ?? null,
        reservation_no: row?.reservation_no ?? null,
      },
    });
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Rezervasyon oluşturulamadı";
    /* "Bu tarihler dolu" → 409 (conflict); validation/diğer → 400.
       Mesaj createReservation'dan BYTE-IDENTICAL gelir; client catch
       err.message'ı aynen gösterir (UX değişmez). */
    const status = msg === "Bu tarihler dolu" ? 409 : 400;
    console.error("[api.public.reservations] create FAILED:", msg);
    /* 🛡️ SENTRY — yalnız UNEXPECTED hatalar capture; expected validation
       throw'ları (Villa zorunlu, Tarih zorunlu, Bu tarihler dolu, ...)
       sentry.server.config `ignoreErrors` ile zaten DROP edilir. Burada
       blanket captureException safe; filter alt katmanda. */
    Sentry.captureException(err, {
      tags: { route: "public.reservations.create", status: String(status) },
    });
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
