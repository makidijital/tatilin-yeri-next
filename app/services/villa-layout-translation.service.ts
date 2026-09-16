import { translationRepository } from "@/lib/db/translation.repository.server";
import { getVillaById } from "@/app/services/villa.service";
import {
  buildLayoutTranslationEntries,
  normalizeLayoutTranslationEntries,
  type LayoutTranslationEntry,
} from "@/lib/villa-layout-translation.helper";
import type { VillaTranslationRow } from "@/lib/i18n/translations.types";

/**
 * 🛡️ PHASE 10E — Villa Konaklama Düzeni (oda/banyo ADI) çevirileri
 *
 * Bu servis YALNIZCA `villa_translations.bedroom_layout` ve
 * `.bathroom_layout` kolonlarını (migration 083) yönetir.
 *
 * KESİNLİKLE YAZILMAYANLAR: title / description / badge / seo_title /
 * seo_description. Bu kolonlar Phase 10A'nın `villa-translation.service.ts`
 * sorumluluğundadır ve upsert payload'ına HİÇ eklenmez — böylece yalnız
 * layout kaydeden bir çağrı mevcut metin çevirilerini EZEMEZ (partial
 * upsert: ON CONFLICT DO UPDATE SET yalnız GÖNDERİLEN kolonları set eder).
 *
 * TR'YE DOKUNULMAZ: `villa.bedroom_layout` / `villa.bathroom_layout`
 * (migration 047) bu servisten SALT-OKUNUR referans olarak okunur, ASLA
 * yazılmaz. Ana villa update orchestration'ına (createVillaFull /
 * updateVillaFull) HİÇ girilmez. Locale whitelist "en" | "de" — TR bu
 * yoldan yazılamaz.
 *
 * DRIFT GÜVENLİĞİ: Oda/banyo kayıtlarının stabil ID'si yoktur (saf JSONB
 * array). Bu yüzden YAZIM sırasında gelen dizi, DB'deki GÜNCEL TR layout'a
 * karşı katı biçimde doğrulanır (uzunluk + index + TR kaynak adı). Bayat
 * bir TR layout üzerinden gönderilen kayıt REDDEDİLİR — sessizce yanlış
 * odaya çeviri bağlamak kabul edilmez. Okuma tarafındaki (public) toleranslı
 * satır-bazlı fallback için bkz. lib/villa-layout-translation.helper.ts.
 *
 * Doğrulama mantığı İKİNCİ KEZ İCAT EDİLMEZ — Batch 1'in saf helper'ı
 * (`normalizeLayoutTranslationEntries` / `buildLayoutTranslationEntries`)
 * reuse edilir. Yeni repository / yeni DB abstraction YAZILMAZ.
 */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

/** Tek bir oda/banyo adı için üst sınır (villa-translation.service.ts'in
 *  MAX_TITLE_LEN'i ile aynı cömert sınır). */
const MAX_NAME_LEN = 200;

export type VillaLayoutTranslationInput = {
  villaId: string;
  locale: string;
  /** TR oda dizisiyle AYNI uzunlukta `[{i, tr, name}]`.
   *  `undefined`/`null` → bu kolon HİÇ yazılmaz (mevcut değer korunur). */
  bedroomLayout?: unknown;
  /** TR banyo dizisiyle AYNI uzunlukta `[{i, tr, name}]`.
   *  `undefined`/`null` → bu kolon HİÇ yazılmaz (mevcut değer korunur). */
  bathroomLayout?: unknown;
};

export type VillaLayoutTranslationResult =
  | { ok: true; row: VillaTranslationRow }
  | { ok: false; error: string };

export type VillaLayoutTranslationsListResult =
  | { ok: true; rows: VillaTranslationRow[] }
  | { ok: false; error: string };

/** Yazım öncesi katı doğrulama sonucu. */
type ValidationOutcome =
  | { ok: true; entries: LayoutTranslationEntry[] }
  | { ok: false; error: string };

/**
 * Gelen çeviri dizisini DB'deki GÜNCEL TR adlarına karşı doğrular.
 * Kabul kriterleri (hepsi sağlanmalı, aksi halde TÜM yazım reddedilir):
 *   • dizi olmalı (shape)
 *   • uzunluk TR layout uzunluğuna eşit olmalı
 *   • her kaydın `i` değeri pozisyonuna eşit olmalı
 *   • her kaydın `tr` değeri o anki TR adıyla birebir aynı olmalı
 *   • her `name` en fazla MAX_NAME_LEN karakter olmalı
 * Sonuç entries DB'deki TR adlarından YENİDEN türetilir (client'ın
 * gönderdiği `tr` değerine güvenilmez).
 */
function validateLayoutInput(
  raw: unknown,
  trNames: string[],
  label: string
): ValidationOutcome {
  if (!Array.isArray(raw)) {
    return { ok: false, error: `${label} çeviri formatı geçersiz` };
  }

  const entries = normalizeLayoutTranslationEntries(raw);
  if (entries.length !== raw.length) {
    return { ok: false, error: `${label} çeviri formatı geçersiz` };
  }
  if (entries.length !== trNames.length) {
    return {
      ok: false,
      error: `${label} düzeni değişmiş — sayfayı yenileyip tekrar deneyin`,
    };
  }

  const names: string[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.i !== i) {
      return { ok: false, error: `${label} çeviri sırası geçersiz` };
    }
    if (entry.tr !== trNames[i]) {
      return {
        ok: false,
        error: `${label} düzeni değişmiş — sayfayı yenileyip tekrar deneyin`,
      };
    }
    if (entry.name.length > MAX_NAME_LEN) {
      return {
        ok: false,
        error: `${label} adı ${MAX_NAME_LEN} karakteri geçemez`,
      };
    }
    names.push(entry.name);
  }

  /* Kaydedilecek dizi DB'deki TR adlarından YENİDEN türetilir.
     Tamamı boşsa [] döner → çağıran taraf NULL yazar. */
  return { ok: true, entries: buildLayoutTranslationEntries(trNames, names) };
}

/**
 * Bir villanın EN/DE çeviri satırlarını döner (TR filtrelenir).
 * `villa-translation.service.ts`'in `getVillaTranslations` deseniyle AYNI.
 */
export async function getVillaLayoutTranslations(
  villaId: string
): Promise<VillaLayoutTranslationsListResult> {
  const id = (villaId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz villa" };

  const { data, error } = await translationRepository.findAllForParent(
    "villa",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

/**
 * Oda/banyo adı çevirilerini kaydeder.
 * En az bir layout alanı verilmelidir; verilmeyen alan HİÇ yazılmaz
 * (mevcut DB değeri aynen korunur).
 */
export async function upsertVillaLayoutTranslation(
  input: VillaLayoutTranslationInput
): Promise<VillaLayoutTranslationResult> {
  const villaId = (input.villaId ?? "").toString().trim();
  if (!villaId) return { ok: false, error: "Geçersiz villa" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  const bedroomProvided =
    input.bedroomLayout !== undefined && input.bedroomLayout !== null;
  const bathroomProvided =
    input.bathroomLayout !== undefined && input.bathroomLayout !== null;

  if (!bedroomProvided && !bathroomProvided) {
    return { ok: false, error: "Kaydedilecek çeviri yok" };
  }

  /* 🛡️ Parent existence + TR layout referansı TEK çağrıda.
     `getVillaById` mevcut bir servis metodu (villa.service.ts) — yeni
     repository metodu İCAT EDİLMEDİ. `mapVilla` içinde layout'lar zaten
     `normalizeBedroomLayout`/`normalizeBathroomLayout` ile normalize
     edilir; yani admin formunun ve public render'ın GÖRDÜĞÜ dizinin
     AYNISI referans alınır. deleted_at IS NULL filtresi de burada. */
  const villa = await getVillaById(villaId);
  if (!villa) return { ok: false, error: "Villa bulunamadı" };

  const trBedroomNames = (villa.bedroom_layout ?? []).map((r) => r.name);
  const trBathroomNames = (villa.bathroom_layout ?? []).map((r) => r.name);

  /* 🛡️ SADECE gönderilen kolonlar payload'a girer — title/description/
     badge/seo_* ASLA. Böylece mevcut metin çevirileri korunur. */
  const fields: Record<string, unknown> = {};

  if (bedroomProvided) {
    const outcome = validateLayoutInput(
      input.bedroomLayout,
      trBedroomNames,
      "Oda"
    );
    if (!outcome.ok) return { ok: false, error: outcome.error };
    fields.bedroom_layout =
      outcome.entries.length > 0 ? outcome.entries : null;
  }

  if (bathroomProvided) {
    const outcome = validateLayoutInput(
      input.bathroomLayout,
      trBathroomNames,
      "Banyo"
    );
    if (!outcome.ok) return { ok: false, error: outcome.error };
    fields.bathroom_layout =
      outcome.entries.length > 0 ? outcome.entries : null;
  }

  const { data, error } = await translationRepository.upsertOne(
    "villa",
    villaId,
    locale,
    fields
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
