"use server";

import {
  getVillaLayoutTranslations,
  upsertVillaLayoutTranslation,
  type VillaLayoutTranslationInput,
  type VillaLayoutTranslationsListResult,
  type VillaLayoutTranslationResult,
} from "@/app/services/villa-layout-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";

/**
 * 🛡️ PHASE 10E — Villa Konaklama Düzeni (oda/banyo adı) çeviri actions
 *
 * Konum: mevcut `villa-translations.action.ts` (Phase 10A) ile AYNI
 * klasör — proje convention'ı. O dosya DEĞİŞTİRİLMEDİ; bu AYRI, bağımsız
 * bir action dosyasıdır (Batch 1-3'te taksonomiler için uygulanan
 * "her çeviri alanı kendi action'ı" deseniyle aynı).
 *
 * Okuma: sayfa zaten middleware ile korunuyor (bkz. gallery.action.ts'in
 * `loadGalleryImages` ve villa-translations.action.ts'in
 * `loadVillaTranslationsAction` deseni) — ekstra auth GEREKMİYOR.
 *
 * Yazma: `authorizeAdminSession()` İLK kontrol — yetkisiz çağrıda
 * servise/DB'ye HİÇ ulaşılmaz.
 */

export async function loadVillaLayoutTranslationsAction(
  villaId: string
): Promise<VillaLayoutTranslationsListResult> {
  return getVillaLayoutTranslations(villaId);
}

export async function saveVillaLayoutTranslationAction(
  input: VillaLayoutTranslationInput
): Promise<VillaLayoutTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };

  return upsertVillaLayoutTranslation(input);
}
