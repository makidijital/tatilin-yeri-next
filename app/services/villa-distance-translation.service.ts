import { translationRepository } from "@/lib/db/translation.repository.server";
import { villaAdminRepository } from "@/lib/db/villa.repository.server";
import type { VillaDistanceTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ VILLA DISTANCE TRANSLATION SERVICE
 *
 * `villa_distance_translations` (migration 082) tablosu public EN/DE villa
 * detay sayfası tarafından ZATEN OKUNUYORDU (`getTranslationsForParents`
 * + `resolveTranslatedField`) ama admin tarafında YAZMA yolu yoktu — bu
 * servis o boşluğu kapatır.
 *
 * Desen `villa-translation.service.ts` ile BİREBİR:
 *   - TR bu servisten YAZILAMAZ (locale whitelist "en" | "de").
 *   - Boş/whitespace değer `null` yazılır → public tarafta TR canonical'a
 *     fallback (`resolveTranslatedField`) devam eder.
 *   - Tüm doğrulama burada; repository yalnız DB primitive'i.
 *
 * `villa_distances` canonical TR satırlarına (title/distance) HİÇ
 * DOKUNULMAZ; `setVillaDistances` replace-all akışı DEĞİŞMEDİ.
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

const MAX_TITLE_LEN = 120;
const MAX_DISTANCE_LEN = 60;

export type VillaDistanceTranslationInput = {
  distanceId: string;
  locale: string;
  title?: string | null;
  distance?: string | null;
};

export type VillaDistanceTranslationResult =
  | { ok: true; row: VillaDistanceTranslationRow }
  | { ok: false; error: string };

export type VillaDistanceTranslationsListResult =
  | { ok: true; rows: VillaDistanceTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Bir villanın TÜM mesafe satırlarının EN + DE çevirilerini İKİ PARALEL
 * batch sorguda okur (`findManyForLocale` + `.in()`), satır başına sorgu
 * YOK — public `getTranslationsForParents` ile AYNI desen.
 */
export async function getVillaDistanceTranslations(
  distanceIds: string[]
): Promise<VillaDistanceTranslationsListResult> {
  const ids = Array.from(
    new Set((distanceIds || []).map((v) => (v ?? "").toString().trim()).filter(Boolean))
  );
  if (ids.length === 0) return { ok: true, rows: [] };

  const [en, de] = await Promise.all([
    translationRepository.findManyForLocale("villa_distance", ids, "en"),
    translationRepository.findManyForLocale("villa_distance", ids, "de"),
  ]);
  if (en.error || de.error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = [...(en.data || []), ...(de.data || [])].filter((row) =>
    isWritableLocale(row.locale)
  );
  return { ok: true, rows };
}

export async function upsertVillaDistanceTranslation(
  input: VillaDistanceTranslationInput
): Promise<VillaDistanceTranslationResult> {
  const distanceId = (input.distanceId ?? "").toString().trim();
  if (!distanceId) return { ok: false, error: "Geçersiz mesafe kaydı" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const title = normalize(input.title);
  if (title && title.length > MAX_TITLE_LEN) {
    return { ok: false, error: `Başlık ${MAX_TITLE_LEN} karakteri geçemez` };
  }

  const distance = normalize(input.distance);
  if (distance && distance.length > MAX_DISTANCE_LEN) {
    return { ok: false, error: `Mesafe ${MAX_DISTANCE_LEN} karakteri geçemez` };
  }

  const { data, error } = await translationRepository.upsertOne(
    "villa_distance",
    distanceId,
    locale,
    { title, distance }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}

/** Panelin listeleyeceği canonical TR mesafe satırları. */
export async function getVillaDistanceRows(
  villaId: string
): Promise<Array<{ id: string; title: string; distance: string }>> {
  const id = (villaId ?? "").toString().trim();
  if (!id) return [];

  const { data, error } = await villaAdminRepository.findVillaDistances(id);
  if (error) return [];

  return (data || [])
    .map((row) => {
      const r = row as { id?: unknown; title?: unknown; distance?: unknown };
      return {
        id: (r.id ?? "").toString(),
        title: (r.title ?? "").toString(),
        distance: (r.distance ?? "").toString(),
      };
    })
    .filter((r) => r.id.length > 0);
}
