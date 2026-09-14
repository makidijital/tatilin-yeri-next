import "server-only";

import { translationRepository } from "@/lib/db/translation.repository.server";
import { DEFAULT_LOCALE, toLocale, type Locale } from "@/lib/i18n/config";
import {
  TRANSLATION_ENTITY_CONFIG,
  type TranslationEntity,
  type TranslationRowFor,
} from "@/lib/i18n/translations.types";

/* ===============================================================
   🛡️ TRANSLATION READ LAYER — PHASE 5 (Translation Read Layer)
   ===============================================================
   AMAÇ: Phase 3'ün ham, generic `translationRepository`'sinin (9
   çeviri tablosu, `findOne`/`findAllForParent`, `{ data, error }`
   zarfı) ÜZERİNE, locale/fallback semantiği ekleyen TEK küçük katman.

   Bu dosya translationRepository'yi YENİDEN YAZMAZ — proje
   konvansiyonuna göre repository ham kalır (bkz. rule-item.repository.ts
   üstyazısı: "error/trim-validation/return/log SERVICE'te"), bu dosya
   o SERVICE katmanının i18n karşılığıdır (app/services/*.service.ts
   deseniyle aynı sorumluluk ayrımı, yalnız i18n'e özgü olduğundan
   lib/i18n/ altında — get-dictionary.ts ile aynı klasör/konvansiyon).

   FALLBACK KARARI (bilinçli, mimariye göre seçildi):
     Mevcut parent tabloları (villa, pages, faqs, ...) zaten Türkçe
     source-of-truth ve `null` dönüşü mevcut mimaride ZATEN "kayıt
     yok" anlamına geliyor (`DbSingleResult.data: T | null`,
     `.maybeSingle()` 0 satırda `null` döner — bkz.
     native-db.provider.ts, villa.service.ts `getVillaBySlug` → null).
     Bu yüzden burada da "çeviri yok" sinyali `undefined` DEĞİL,
     `null` — mevcut mimariyle TUTARLI, yeni bir sözleşme İCAT
     EDİLMEDİ.

     `getTranslation` PARENT TABLOLARI HİÇ BİLMEZ/SORGULAMAZ (villa,
     pages, faqs repository'lerine tek bir import/çağrı bile YOK) —
     yalnız çeviri satırını (veya yokluğunu) döner. Parent değerine
     asıl fallback'i UYGULAMAK, `resolveTranslatedField` ile ÇAĞIRAN
     TARAFIN sorumluluğudur (bu faz PUBLIC COMPONENT'lere BAĞLAMIYOR
     — bkz. görev tanımı — dolayısıyla bugün hiçbir çağıran yok; bu
     ileride villa/page/faq render kodunun kullanacağı hazır temel).
     Bu ayrım N+1'i de önler: getTranslation yalnız TEK sorgu atar
     (translation tablosuna), parent veri zaten çağıran tarafın
     mevcut akışından (ör. getVillaBySlug) geliyor olur.

   TR KISAYOLU (performans + "gereksiz bağımlılık yok"):
     `locale === "tr"` (veya geçersiz/tanınmayan bir locale →
     `toLocale` ile "tr"e düşer) ise translation tablosuna HİÇ SORGU
     ATILMAZ, doğrudan `null` döner. Villa title gibi alanlar bugün
     `villa.title`'dan nasıl okunuyorsa TR için AYNEN öyle okunmaya
     devam eder — bu dosya o akışa hiçbir yeni DB bağımlılığı eklemez.

   GÜVENLİK: `translationRepository` zaten server-only (`lib/db/
   translation.repository.server.ts` → `dbNative` → `pg`). Bu dosya
   da `"server-only"` import eder — client bundle'a asla girmez. Yeni
   bir admin/service-role bypass, RLS, GRANT YOK — mevcut tek-app-rolü
   native Postgres deseni (Phase 3/081) AYNEN korunur.

   PERFORMANS: `getTranslation` başına TEK sorgu (`findOne` zaten
   `.eq(parentIdColumn, parentId).eq("locale", locale).maybeSingle()`
   — tek satır, tek round-trip). Bu faz cache EKLEMEZ (kapsam dışı,
   görev tanımı) — ileride birden çok kart için N+1 riski oluşursa
   `findAllForParent` (Phase 3'te zaten var, DEĞİŞTİRİLMEDİ) veya
   toplu bir varyant sonraki bir fazın konusu.
   =============================================================== */

/** `TRANSLATION_ENTITY_CONFIG`'te tanımlı bilinen bir entity mi?
 *  (bkz. `isSupportedLocale` — lib/i18n/config.ts — aynı desen: tip
 *  daralması + güvenli, throw'suz doğrulama.) Bilinmeyen bir değer
 *  (yanlış yazım, tip bypass'ı) DB'ye asla ulaşmaz. */
export function isTranslationEntity(
  value: unknown
): value is TranslationEntity {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(TRANSLATION_ENTITY_CONFIG, value)
  );
}

/**
 * Bir parent kaydın belirli bir locale'deki çeviri satırını okur.
 *
 * Dönüş — `null` ("bu locale için çeviri yok/uygulanmaz") ÜÇ durumda:
 *   1) `locale` TR'ye çözümleniyorsa (geçerli "tr" veya geçersiz/
 *      tanınmayan bir değer) → sorgu atılmadan.
 *   2) `entity` bilinmiyorsa → sorgu atılmadan.
 *   3) `parentId` boşsa → sorgu atılmadan.
 *   4) Sorgu atılır ama satır yoksa VEYA DB hatası dönerse (asla
 *      throw etmez — `translationRepository`/native provider zaten
 *      hata fırlatmıyor, `{ data: null, error }` döner; burada hata
 *      da güvenli null'a indirgenir — bir çeviri okuma sorunu public
 *      sayfayı asla çökertmemeli).
 *
 * Satır bulunursa TAMAMI (`TranslationRowFor<E>`) döner — alan bazlı
 * fallback `resolveTranslatedField` ile çağıran tarafta yapılır
 * (bir satırda bazı kolonlar dolu, bazıları NULL olabilir — bkz.
 * migration 082, tüm çevrilebilir kolonlar nullable).
 */
export async function getTranslation<E extends TranslationEntity>(
  entity: E,
  parentId: string,
  locale: Locale
): Promise<TranslationRowFor<E> | null> {
  const resolvedLocale = toLocale(locale);

  if (resolvedLocale === DEFAULT_LOCALE) return null;
  if (!isTranslationEntity(entity)) return null;
  if (!parentId) return null;

  const { data, error } = await translationRepository.findOne(
    entity,
    parentId,
    resolvedLocale
  );
  if (error) return null;

  return (data ?? null) as TranslationRowFor<E> | null;
}

/**
 * Tek bir alan için deterministik fallback: çeviri değeri dolu bir
 * string'se onu, değilse (null/undefined/boş/yalnız boşluk) `parentValue`'yu
 * döner. `parentValue` HİÇBİR ŞEKİLDE sorgulanmaz/değiştirilmez —
 * çağıran taraf mevcut TR parent verisini (ör. `villa.title`) olduğu
 * gibi geçirir; bu fonksiyon saf (pure), DB'ye dokunmaz.
 */
export function resolveTranslatedField<T>(
  translatedValue: string | null | undefined,
  parentValue: T
): T | string {
  if (typeof translatedValue === "string" && translatedValue.trim() !== "") {
    return translatedValue;
  }
  return parentValue;
}
