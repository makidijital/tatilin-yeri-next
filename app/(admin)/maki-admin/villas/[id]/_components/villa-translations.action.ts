"use server";

import {
  getVillaTranslations,
  upsertVillaTranslation,
  type VillaTranslationInput,
  type VillaTranslationsListResult,
  type VillaTranslationResult,
} from "@/app/services/villa-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/**
 * 🛡️ PHASE 10A — Admin Villa Translation UI Server Actions
 *
 * Okuma: sayfa zaten middleware ile korunuyor (bkz. gallery.action.ts'in
 * `loadGalleryImages` deseni) — ekstra auth GEREKMİYOR.
 *
 * Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
 * servis/DB'ye HİÇ ulaşılmaz.
 */

export async function loadVillaTranslationsAction(
  villaId: string
): Promise<VillaTranslationsListResult> {
  return getVillaTranslations(villaId);
}

export async function saveVillaTranslationAction(
  input: VillaTranslationInput
): Promise<VillaTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };

  return upsertVillaTranslation(input);
}
