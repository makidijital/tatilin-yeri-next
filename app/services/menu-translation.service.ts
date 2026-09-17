import { translationRepository } from "@/lib/db/translation.repository.server";
import type { MenuTranslationRow } from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ MENÜ ADI ÇEVİRİ SERVİSİ (migration 086)
   ===============================================================
   `app/services/villa-type-translation.service.ts` (Phase 10D) ile
   AYNI desen — aynı generic `translationRepository`, aynı `{ ok }`
   sonuç zarfı, aynı `en|de` yazılabilir-locale kısıtı. TR canonical
   kaynaktır (`menu.name`) ve bu servisten ASLA yazılmaz/okunmaz.

   ⚠️ TEK BİLİNÇLİ FARK — BOŞ DEĞER İZNİ:
     `upsertTypeTranslation` boş adı REDDEDER. Menü çevirileri ise
     OPSİYONELDİR (admin talebi: "EN/DE boş bırakılabilmeli") — bu
     yüzden boş/whitespace değer hata değil, `null` yazılır ve
     kayıt TR fallback'ine döner. Yeni bir fallback mantığı İCAT
     EDİLMEDİ: `resolveTaxonomyName` zaten boş/whitespace çeviriyi
     canonical ada düşürür.

   ⚠️ KAPSAM: yalnız GÖRÜNEN AD. `href` / `source_type` / `source_id`
   bu servise HİÇ girmez — menü linki canonical kalır.
   =============================================================== */

export type WritableTranslationLocale = "en" | "de";

function isWritableLocale(value: unknown): value is WritableTranslationLocale {
  return value === "en" || value === "de";
}

export type MenuTranslationInput = {
  menuId: string;
  locale: string;
  /** Boş/whitespace → çeviri TEMİZLENİR (null) → TR fallback. */
  name: string;
};

export type MenuTranslationResult =
  | { ok: true; row: MenuTranslationRow }
  | { ok: false; error: string };

export type MenuTranslationsListResult =
  | { ok: true; rows: MenuTranslationRow[] }
  | { ok: false; error: string };

function normalize(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Bir menü satırının EN/DE çevirileri (0..2 satır). */
export async function getMenuTranslations(
  menuId: string
): Promise<MenuTranslationsListResult> {
  const id = (menuId ?? "").toString().trim();
  if (!id) return { ok: false, error: "Geçersiz menü" };

  const { data, error } = await translationRepository.findAllForParent(
    "menu",
    id
  );
  if (error) return { ok: false, error: "Çeviriler okunamadı" };

  const rows = (data || []).filter((row) => isWritableLocale(row.locale));
  return { ok: true, rows };
}

/** EN veya DE menü adını yazar/günceller. Boş değer çeviriyi temizler. */
export async function upsertMenuTranslation(
  input: MenuTranslationInput
): Promise<MenuTranslationResult> {
  const menuId = (input.menuId ?? "").toString().trim();
  if (!menuId) return { ok: false, error: "Geçersiz menü" };

  if (!isWritableLocale(input.locale)) {
    return {
      ok: false,
      error: "Geçersiz dil — yalnız 'en' veya 'de' desteklenir",
    };
  }
  const locale = input.locale;

  /* Boş → null (temizleme). Reddetme YOK — bkz. dosya başı notu. */
  const name = normalize(input.name);

  const { data, error } = await translationRepository.upsertOne(
    "menu",
    menuId,
    locale,
    { name }
  );

  if (error || !data) return { ok: false, error: "Çeviri kaydedilemedi" };
  return { ok: true, row: data };
}
