"use server";

import {
  getLocationTranslations,
  upsertLocationTranslation,
  type LocationTranslationInput,
  type LocationTranslationsListResult,
  type LocationTranslationResult,
} from "@/app/services/villa-location-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/* ===============================================================
   🛡️ PHASE 10D — Batch 3 — Admin Villa Location Translation UI Server
   Actions
   ===============================================================
   `feature-translations.action.ts` (Batch 2) / `villa-translations.action.ts`
   (Phase 10A) ile BİREBİR AYNI desen. Locations sayfasının kendi CRUD'ı
   `/api/admin/villa-locations` REST route'u üzerinden gider (adminFetch)
   — bu çeviri action'ı BAĞIMSIZ, ayrı bir "use server" dosyası; mevcut
   CRUD mekanizmasına dokunmaz veya onu taklit etmez.

   Okuma: sayfa zaten middleware ile korunuyor — ekstra auth GEREKMİYOR.
   Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
   servis/DB'ye HİÇ ulaşılmaz.

   ⚠️ Bu dosya yalnız ince wrapper — iş mantığı YOK. Batch 1'de yazılan
   `app/services/villa-location-translation.service.ts` DEĞİŞTİRİLMEDİ,
   yalnız delege edilir.
   =============================================================== */

export async function loadLocationTranslationsAction(
  locationId: string
): Promise<LocationTranslationsListResult> {
  return getLocationTranslations(locationId);
}

export async function saveLocationTranslationAction(
  input: LocationTranslationInput
): Promise<LocationTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };

  return upsertLocationTranslation(input);
}
