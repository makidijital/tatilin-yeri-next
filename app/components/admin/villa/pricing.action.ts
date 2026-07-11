"use server";

import { villaRepository } from "@/lib/db/villa.repository";
import {
  getVillaPrices,
  setVillaPrices,
} from "@/app/services/villa-price.service";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
  const supabase = await createSupabaseServerClient();
  await setVillaPrices(villaId, prices, supabase);
}
