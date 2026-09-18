"use server";

import {
  getVillaDistanceRows,
  getVillaDistanceTranslations,
  upsertVillaDistanceTranslation,
  type VillaDistanceTranslationInput,
  type VillaDistanceTranslationResult,
} from "@/app/services/villa-distance-translation.service";
import { authorizeAdminSession } from "@/lib/admin-route-auth";
import type { VillaDistanceTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ Admin Villa Distance Translation server actions.
 *
 * `villa-translations.action.ts` ile BİREBİR aynı auth deseni:
 *   - Okuma: sayfa zaten middleware ile korunuyor.
 *   - Yazma: `authorizeAdminSession()` İLK kontrol.
 */

export type VillaDistanceRow = {
  id: string;
  title: string;
  distance: string;
};

export type VillaDistanceTranslationsLoadResult =
  | {
      ok: true;
      rows: VillaDistanceRow[];
      translations: VillaDistanceTranslationRow[];
    }
  | { ok: false; error: string };

export async function loadVillaDistanceTranslationsAction(
  villaId: string
): Promise<VillaDistanceTranslationsLoadResult> {
  const rows = await getVillaDistanceRows(villaId);
  const result = await getVillaDistanceTranslations(rows.map((r) => r.id));
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, rows, translations: result.rows };
}

export async function saveVillaDistanceTranslationAction(
  input: VillaDistanceTranslationInput
): Promise<VillaDistanceTranslationResult> {
  const auth = await authorizeAdminSession();
  if (!auth.ok) return { ok: false, error: "Yetkisiz" };

  return upsertVillaDistanceTranslation(input);
}
