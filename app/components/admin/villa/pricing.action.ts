"use server";

/* 🛡️ Villa Migration S8B — findIdTitleCurrencyById native twin'e (S8A,
   byte-identical) repoint. Bu dosya "use server" (server action) →
   server-only native repo import'u güvenli. villaRepository yalnız bu
   method için kullanılıyor; method adı aynı. */
import { villaAdminRepository as villaRepository } from "@/lib/db/villa.repository.server";
import {
  getVillaPrices,
  setVillaPrices,
} from "@/app/services/villa-price.service";
/* 🛡️ VP-P1 — app-layer admin gate. Yazma native (dbAdminNative.rpc) + RPC
   auth-bağımsız (DECISION A) olduğundan RLS gate uygulanmıyordu; authz
   burada. Yalnız gate; auth.caller kullanılmaz. */
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PRICING CALENDAR — SERVER ACTIONS
   ===============================================================
   PricingCalendarCanvas (client) fiyat okuma/yazmayı artık DOĞRUDAN
   repository/service yerine bu server action'lar üzerinden yapar →
   `villa.repository` / `villa-price.service` / `@/lib/db` client
   bundle'ına GİRMEZ.

   ⚠️ DAVRANIŞ AYNEN:
     - Read (villa + fiyatlar): public RLS okuması, server tarafında
       anon ile birebir çalışır.
     - Write (setVillaPrices): admin RLS yazması. Server action'da
       `createSupabaseServerClient` (session-aware) client'ı geçilir →
       admin session server tarafında da taşınır → RLS `is_active_admin`
       BUGÜNKÜ gibi uygulanır (yetki aynen korunur, değişmez).
   =============================================================== */

export async function loadPricingData(villaId: string) {
  const [villaRes, prices] = await Promise.all([
    villaRepository.findIdTitleCurrencyById(villaId),
    getVillaPrices(villaId),
  ]);
  return { villa: villaRes.data, prices };
}

export async function savePricingData(
  villaId: string,
  prices: {
    start_date: string;
    end_date: string;
    price: number;
    currency: string;
  }[]
): Promise<void> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return;

  await setVillaPrices(villaId, prices);
}
