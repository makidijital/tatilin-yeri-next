"use server";

import { getPublicSettings } from "@/app/services/settings.service";
import type { Settings } from "@/app/services/settings.types";

/* ===============================================================
   🛡️ SETTINGS — PUBLIC SERVER ACTION (thin wrapper, FAZ 6 S2)
   ===============================================================
   Public client'lar (TopBar, ReservationForm, useBookingEngine) →
   bu server action → `settings.service.getPublicSettings` → RPC
   `get_public_settings` (SECURITY DEFINER, public-safe; secret DÖNMEZ).

   ⚠️ İNCE WRAPPER: iş mantığı YOK — yalnız delege eder. Dönüş
     (`Settings | null`) BİREBİR; RPC/SQL/repository/service değişmedi.
     `Settings` düz obje → server action sınırında sorunsuz serileşir.
   =============================================================== */

export async function getPublicSettingsAction(): Promise<Settings | null> {
  return getPublicSettings();
}
