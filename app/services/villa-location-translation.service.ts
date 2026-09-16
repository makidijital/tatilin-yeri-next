import { translationRepository } from "@/lib/db/translation.repository.server";
import type { VillaLocationTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10D — Batch 1 — Bölge (villa_locations) Çeviri Servisi
 *
 * `app/services/villa-translation.service.ts` (Phase 10A) ile BİREBİR
 * AYNI desen: yalnız EN/DE çevirilerinin okunması/yazılması (TR bu
 * servisten YAZILAMAZ), tüm iş kuralı doğrulaması BURADA (repository
 * katmanı yalnız DB primitive'i — bkz. translation.repository.server.ts).
 *
 * ⚠️ `villa_locations` PAYLAŞILAN bir taxonomy tablosudur (birden çok
 * villa aynı bölgeyi referans eder) — bu servis villa formundan DEĞİL,
 * `/maki-admin/locations` yönetim sayfasından çağrılacak (bkz. Phase
 * 10D audit raporu §5/§8). Villa create/update orchestration'ına
 * (`createVillaFull`/`updateVillaFull`) HİÇ bağlanmaz.
 *
 * ⚠️ Parent existence pre-check YOK: `lib/db/villa-location.repository.ts`
 * / `.server.ts`'de (villaAdminRepository'nin villa için sahip olduğu
 * `findSlugById` benzeri) tekil `findById` metodu YOK — yeni bir repo
 * metodu İCAT EDİLMEDİ. Geçersiz `locationId` için DB'nin kendi FK
 * constraint'i (`villa_location_translations_location_id_fkey`,
 * migration 082) `upsertOne` sırasında hata döner; bu hata generic bir
 * mesaja çevrilir (aşağıda `upsertLocationTranslation`).
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type LocationTranslationInput = {
  locationId: string;
  locale: string;
  name: string;
};

export type LocationTranslationResult =
  | { ok: true; row: VillaLocationTranslationRow }
  | { ok: false; error: string };

export type LocationTranslationsListResult =
  | { ok: true; rows: VillaLocationTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getLocationTranslations(
  locationId: string
): Promise<LocationTranslationsListResult> {
  const id = (locationId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz bölge" };

  const { data, error } = await translationRepository.findAllForParent(
    "villa_location",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

export async function upsertLocationTranslation(
  input: LocationTranslationInput
): Promise<LocationTranslationResult> {
  const locationId = (input.locationId ?? "").toString().trim();
  if (!locationId) return { ok: false, error: "Geçersiz bölge" };

  if (!isWritableLocale(input.locale)) {
    return { ok: false, error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir" };
  }
  const locale = input.locale;

  const name = normalize(input.name);
  if (!name) return { ok: false, error: "İsim gerekli" };

  const { data, error } = await translationRepository.upsertOne(
    "villa_location",
    locationId,
    locale,
    { name }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
